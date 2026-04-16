/**
 * Live Understanding — two-thread Q&A engine
 *
 * Thread 1 — QUESTION (detect questions in recent transcript)
 *   Trigger: every ~200 new chars of transcript.
 *   Checks the latest ~200 chars for any question being asked.
 *   Output: QuestionContext
 *
 * Thread 2 — ANSWER (generate answer when question detected)
 *   Trigger: when the question thread detects a new question.
 *   Analyzes the last ~2 minutes of transcript to formulate a helpful answer.
 *   Output: AnswerContext
 */

import http from 'http'
import { EventEmitter } from 'events'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionContext {
  has_question: boolean
  question: string
  last_updated_at: number
}

export interface AnswerContext {
  question: string
  answer: string
  confidence: number  // 0–1
  last_updated_at: number
}

export type ThreadId = 'question' | 'answer'

export interface ThreadStatus {
  id: ThreadId
  label: string
  running: boolean
  last_ran_at: number | null
  last_duration_ms: number | null
  error: string | null
  trigger_chars: number
  chars_since_last: number
  model: string
  call_count: number
  input_tokens: number
  output_tokens: number
  last_prompt_chars: number
  last_response_chars: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OLLAMA_PORT = 11434
const QUESTION_TRIGGER_CHARS = 200   // check every ~200 new chars
const ANSWER_CONTEXT_CHARS   = 4000  // ~2 min of transcript for answer generation
const MAX_CHUNKS = 2000

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

let questionContext: QuestionContext | null = null
let answerContext: AnswerContext | null = null

let allChunks: string[] = []

let questionRunning = false
let answerRunning   = false
let sessionActive   = false
let sessionRunning  = false

let ollamaModel = 'qwen3.5:4b'
let clearGeneration = 0

export const emitter = new EventEmitter()

// Track all in-flight HTTP requests so they can be aborted on stop/clear
const activeRequests = new Set<ReturnType<typeof http.request>>()

function abortActiveRequests() {
  for (const req of activeRequests) {
    try { req.destroy() } catch { /* ignore */ }
  }
  activeRequests.clear()
}

// ---------------------------------------------------------------------------
// Thread status tracking
// ---------------------------------------------------------------------------

const BLANK_STATS = { call_count: 0, input_tokens: 0, output_tokens: 0, last_prompt_chars: 0, last_response_chars: 0 }

const threadStatus: Record<ThreadId, ThreadStatus> = {
  question: { id: 'question', label: 'Question', running: false, last_ran_at: null, last_duration_ms: null, error: null, trigger_chars: QUESTION_TRIGGER_CHARS, chars_since_last: 0, model: ollamaModel, ...BLANK_STATS },
  answer:   { id: 'answer',   label: 'Answer',   running: false, last_ran_at: null, last_duration_ms: null, error: null, trigger_chars: 0, chars_since_last: 0, model: ollamaModel, ...BLANK_STATS },
}

const threadStartedAt: Partial<Record<ThreadId, number>> = {}

// Retry tracking
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000]
const retryTimers: Partial<Record<ThreadId, ReturnType<typeof setTimeout>>> = {}
const retryCounts: Record<ThreadId, number> = { question: 0, answer: 0 }

function scheduleRetry(id: ThreadId, trigger: () => void) {
  if (retryTimers[id]) clearTimeout(retryTimers[id])
  const count = retryCounts[id]
  if (count >= RETRY_DELAYS_MS.length) return
  retryCounts[id]++
  retryTimers[id] = setTimeout(() => { retryTimers[id] = undefined; trigger() }, RETRY_DELAYS_MS[count])
}

function clearRetries() {
  for (const id of Object.keys(retryTimers) as ThreadId[]) {
    if (retryTimers[id]) { clearTimeout(retryTimers[id]); delete retryTimers[id] }
  }
  retryCounts.question = retryCounts.answer = 0
}

function recordCall(id: ThreadId, inputChars: number, outputChars: number) {
  threadStatus[id].call_count    += 1
  threadStatus[id].input_tokens  += Math.round(inputChars / 4)
  threadStatus[id].output_tokens += Math.round(outputChars / 4)
  threadStatus[id].last_prompt_chars   = inputChars
  threadStatus[id].last_response_chars = outputChars
}

function setThreadState(id: ThreadId, running: boolean, error: string | null = null) {
  if (running) {
    threadStartedAt[id] = Date.now()
  } else {
    const started = threadStartedAt[id]
    if (started) {
      threadStatus[id].last_duration_ms = Date.now() - started
      delete threadStartedAt[id]
    }
    threadStatus[id].last_ran_at = Date.now()
    threadStatus[id].chars_since_last = 0
  }
  threadStatus[id].running = running
  if (error) threadStatus[id].error = friendlyError(error)
  else if (!running) { threadStatus[id].error = null; retryCounts[id] = 0 }
  emitter.emit('threads-status', Object.values(threadStatus))
}

function totalTranscriptChars(): number {
  return allChunks.reduce((sum, c) => sum + c.length, 0)
}

// Track chars at last question trigger
let lastQuestionTriggerChars = 0

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startSession(model?: string) {
  questionContext = null
  answerContext   = null
  allChunks      = []
  sessionActive  = true
  sessionRunning = false
  lastQuestionTriggerChars = 0
  if (model) ollamaModel = model

  clearRetries()

  // Reset thread statuses
  for (const id of ['question', 'answer'] as ThreadId[]) {
    threadStatus[id] = {
      id,
      label: capitalize(id),
      running: false,
      last_ran_at: null,
      last_duration_ms: null,
      error: null,
      trigger_chars: id === 'question' ? QUESTION_TRIGGER_CHARS : 0,
      chars_since_last: 0,
      model: ollamaModel,
      ...BLANK_STATS,
    }
  }

  emitter.emit('threads-status', Object.values(threadStatus))

  // Warmup: send a tiny request so Ollama loads the model into memory now,
  // not on the first real question detection (which adds ~10-30s cold start).
  ollamaChat(ollamaModel, 'Reply with OK.', 'warmup').catch(() => {})
}

export function stopSession() {
  sessionActive  = false
  sessionRunning = false
  clearRetries()
  abortActiveRequests()
}

export async function pauseSession(): Promise<void> {
  sessionRunning = false
  let changed = false
  for (const id of Object.keys(threadStatus) as ThreadId[]) {
    if (threadStatus[id].running) { threadStatus[id] = { ...threadStatus[id], running: false }; changed = true }
  }
  if (changed) emitter.emit('threads-status', Object.values(threadStatus))
  abortActiveRequests()
  await releaseOllama()
}

export function resumeSession(): void {
  sessionRunning = true
}

export function setOllamaModel(model: string) {
  ollamaModel = model
  for (const id of Object.keys(threadStatus) as ThreadId[]) {
    threadStatus[id].model = model
  }
  emitter.emit('threads-status', Object.values(threadStatus))
}

export function getQuestionContext(): QuestionContext | null  { return questionContext }
export function getAnswerContext(): AnswerContext | null      { return answerContext }
export function getThreadStatuses(): ThreadStatus[]          { return Object.values(threadStatus) }

export function clearUnderstanding() {
  clearGeneration++
  abortActiveRequests()
  clearRetries()
  questionContext = null
  answerContext   = null
  allChunks       = []
  questionRunning = false
  answerRunning   = false
  sessionRunning  = false
  lastQuestionTriggerChars = 0

  for (const id of ['question', 'answer'] as ThreadId[]) {
    threadStatus[id] = {
      id,
      label: capitalize(id),
      running: false,
      last_ran_at: null,
      last_duration_ms: null,
      error: null,
      trigger_chars: id === 'question' ? QUESTION_TRIGGER_CHARS : 0,
      chars_since_last: 0,
      model: ollamaModel,
      ...BLANK_STATS,
    }
  }
  emitter.emit('threads-status', Object.values(threadStatus))
  emitter.emit('understanding-question', null)
  emitter.emit('understanding-answer', null)
}

export function pushChunk(text: string) {
  if (!sessionActive || !text.trim()) return

  allChunks.push(text)
  if (allChunks.length > MAX_CHUNKS) allChunks = allChunks.slice(-MAX_CHUNKS)

  if (sessionRunning) {
    const totalChars = totalTranscriptChars()
    const sinceLastQuestion = totalChars - lastQuestionTriggerChars
    threadStatus.question.chars_since_last = sinceLastQuestion

    // Urgent trigger: "?" in the chunk — extract the question sentence directly
    // and skip straight to answer generation (saves an LLM round-trip)
    if (text.includes('?')) {
      lastQuestionTriggerChars = totalChars
      const extracted = extractQuestionFromText(text)
      if (extracted) {
        console.log('[live-understanding] ? trigger — extracted question:', extracted)
        questionContext = { has_question: true, question: extracted, last_updated_at: Date.now() }
        emitter.emit('understanding-question', questionContext)
        triggerAnswer(extracted)
      }
    } else if (sinceLastQuestion >= QUESTION_TRIGGER_CHARS) {
      lastQuestionTriggerChars = totalChars
      triggerQuestion()
    }

    emitter.emit('threads-status', Object.values(threadStatus))
  }
}

export async function analyzeMeeting(): Promise<string> {
  const transcript = allChunks.join('\n')
  if (!transcript.trim()) return 'No transcript available yet.'

  const systemPrompt =
    `You are a meeting transcription expert. Given a raw conversation transcription (without speaker labels), ` +
    `identify the distinct speakers and attribute each line/segment to the correct person. ` +
    `Use contextual clues like names mentioned, role references, tone shifts, and conversation flow. ` +
    `Format the output as a clean conversation with speaker labels (use real names when mentioned, otherwise Speaker 1/2/etc). ` +
    `Keep the original text as-is — do not paraphrase or summarize. Just add speaker attribution.  If possible correct typos when needed, if it won't change the meaning of what was said.`

  const userPrompt = `Raw transcription:\n${transcript.slice(-12000)}`
  return ollamaChat(ollamaModel, systemPrompt, userPrompt)
}

// ---------------------------------------------------------------------------
// Thread 1 — Question detection
// ---------------------------------------------------------------------------

async function triggerQuestion() {
  if (questionRunning || allChunks.length === 0) return
  questionRunning = true
  setThreadState('question', true)

  const gen = clearGeneration
  const recentText = allChunks.join('\n').slice(-QUESTION_TRIGGER_CHARS * 2)

  try {
    const result = await runQuestionDetection(recentText, (ic, oc) => recordCall('question', ic, oc))
    if (gen !== clearGeneration) return

    questionContext = { ...result, last_updated_at: Date.now() }
    emitter.emit('understanding-question', questionContext)

    // If a question was detected, trigger the answer thread
    if (result.has_question && result.question.trim()) {
      triggerAnswer(result.question)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[live-understanding] Question thread error:', msg)
    setThreadState('question', false, msg)
    scheduleRetry('question', triggerQuestion)
    return
  } finally {
    questionRunning = false
  }
  setThreadState('question', false)
}

async function runQuestionDetection(recentText: string, stats?: (ic: number, oc: number) => void): Promise<{ has_question: boolean; question: string }> {
  const systemPrompt =
    `You are a conversation monitor. Your ONLY job is to detect if someone is asking a question in the given text. ` +
    `Look for direct questions, requests for information, or anything that expects a response. ` +
    `If there IS a question, extract it clearly. If there is no question, set has_question to false. ` +
    `Return valid JSON only.`

  const userPrompt = `Recent conversation:\n${recentText}\n\nIs someone asking a question here?`

  const format = {
    type: 'object',
    properties: {
      has_question: { type: 'boolean' },
      question:     { type: 'string' },
    },
    required: ['has_question', 'question'],
  }

  const raw = await ollamaChatStructured(ollamaModel, systemPrompt, userPrompt, format, stats)
  const parsed = JSON.parse(raw)

  return {
    has_question: typeof parsed.has_question === 'boolean' ? parsed.has_question : false,
    question:     typeof parsed.question === 'string' ? parsed.question : '',
  }
}

// ---------------------------------------------------------------------------
// Thread 2 — Answer generation
// ---------------------------------------------------------------------------

async function triggerAnswer(question: string) {
  if (answerRunning) return
  // Don't re-answer the same question
  if (answerContext?.question === question) return
  answerRunning = true
  setThreadState('answer', true)

  const gen = clearGeneration
  const contextText = allChunks.join('\n').slice(-ANSWER_CONTEXT_CHARS)

  try {
    const result = await runAnswerGeneration(question, contextText, (ic, oc) => recordCall('answer', ic, oc))
    if (gen !== clearGeneration) return

    answerContext = { ...result, last_updated_at: Date.now() }
    emitter.emit('understanding-answer', answerContext)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[live-understanding] Answer thread error:', msg)
    setThreadState('answer', false, msg)
    scheduleRetry('answer', () => triggerAnswer(question))
    return
  } finally {
    answerRunning = false
  }
  setThreadState('answer', false)
}

async function runAnswerGeneration(question: string, contextText: string, stats?: (ic: number, oc: number) => void): Promise<{ question: string; answer: string; confidence: number }> {
  const systemPrompt =
    `You are helping someone during a live conversation. Based on the transcript context, ` +
    `write a concise, natural answer to the question below. ` +
    `Write something the person could say out loud — direct, clear, and under 3 sentences. ` +
    `Use specific facts from the transcript when possible. ` +
    `Rate your confidence from 0 to 1 based on how well the transcript supports your answer. ` +
    `Return valid JSON only.`

  const userPrompt =
    `Recent transcript:\n${contextText}\n\n` +
    `Question to answer: ${question}`

  const format = {
    type: 'object',
    properties: {
      answer:     { type: 'string' },
      confidence: { type: 'number' },
    },
    required: ['answer', 'confidence'],
  }

  const raw = await ollamaChatStructured(ollamaModel, systemPrompt, userPrompt, format, stats)
  const parsed = JSON.parse(raw)

  return {
    question,
    answer:     typeof parsed.answer === 'string' ? parsed.answer : '',
    confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5,
  }
}

/** Extract the last sentence ending with "?" from text — no LLM needed. */
function extractQuestionFromText(text: string): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const questions = sentences.filter(s => s.trim().endsWith('?'))
  if (questions.length === 0) return null
  return questions[questions.length - 1].trim()
}

// ---------------------------------------------------------------------------
// Ollama HTTP helpers
// ---------------------------------------------------------------------------

function stripThinkTags(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

function stripJsonFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

function friendlyError(msg: string): string {
  if (msg.includes('ECONNREFUSED'))       return 'Ollama not running'
  if (msg.includes('timeout'))            return 'Ollama timed out'
  if (msg.includes('not valid JSON') || msg.includes('Unexpected token') || msg.includes('SyntaxError') ||
      msg.includes('Expected') || msg.includes('JSON at position'))
                                          return 'Model returned invalid JSON'
  if (msg.includes('model') && msg.includes('not found')) return 'Model not found'
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNRESET')) return 'Network error'
  return msg.length > 60 ? msg.slice(0, 57) + '…' : msg
}

function ollamaChatStructured(model: string, systemContent: string, userContent: string, format: object, stats?: (ic: number, oc: number) => void, port = OLLAMA_PORT): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user',   content: userContent },
      ],
      stream: false,
      think: false,
      options: { temperature: 0.1 },
      format,
    })

    const req = http.request(
      { hostname: 'localhost', port, path: '/api/chat', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => {
          activeRequests.delete(req)
          try {
            const content = JSON.parse(data).message?.content ?? JSON.parse(data).response ?? data
            const result = stripJsonFences(stripThinkTags(String(content)))
            stats?.(systemContent.length + userContent.length, result.length)
            resolve(result)
          } catch { resolve(stripJsonFences(data)) }
        })
        res.on('error', (err) => { activeRequests.delete(req); reject(err) })
      },
    )
    activeRequests.add(req)
    req.on('error', (err) => { activeRequests.delete(req); reject(err) })
    req.setTimeout(60_000, () => { activeRequests.delete(req); req.destroy(); reject(new Error('Ollama timeout')) })
    req.write(body)
    req.end()
  })
}

function ollamaChat(model: string, systemContent: string, userContent: string, stats?: (ic: number, oc: number) => void, port = OLLAMA_PORT): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user',   content: userContent },
      ],
      stream: false,
      think: false,
      options: { temperature: 0.3 },
    })

    const req = http.request(
      { hostname: 'localhost', port, path: '/api/chat', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => {
          activeRequests.delete(req)
          try {
            const content = JSON.parse(data).message?.content ?? JSON.parse(data).response ?? data
            const result = stripThinkTags(String(content))
            stats?.(systemContent.length + userContent.length, result.length)
            resolve(result)
          } catch { resolve(data) }
        })
        res.on('error', (err) => { activeRequests.delete(req); reject(err) })
      },
    )
    activeRequests.add(req)
    req.on('error', (err) => { activeRequests.delete(req); reject(err) })
    req.setTimeout(60_000, () => { activeRequests.delete(req); req.destroy(); reject(new Error('Ollama Q&A timeout')) })
    req.write(body)
    req.end()
  })
}

function releaseOllama(): Promise<void> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: ollamaModel,
      keep_alive: 0,
    })

    const req = http.request(
      { hostname: 'localhost', port: OLLAMA_PORT, path: '/api/chat', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        res.resume()
        res.on('end', () => resolve())
        res.on('error', () => resolve())
      },
    )

    req.on('error', () => resolve())
    req.setTimeout(5_000, () => { req.destroy(); resolve() })
    req.write(body)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
