import { useState, useCallback, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'

export function useUnderstanding() {
  const { s } = useI18n()
  const [questionContext, setQuestionContext] = useState<QuestionContext | null>(null)
  const [answerContext, setAnswerContext]     = useState<AnswerContext | null>(null)
  const [threadStatuses, setThreadStatuses]   = useState<ThreadStatus[]>([])
  const [liveCharsOffset, setLiveCharsOffset] = useState(0)
  const [isActive, setIsActive]               = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const liveCharsRef = useRef(0)

  useEffect(() => {
    window.electronAPI.startUnderstandingSession()
      .then(() => {
        setIsActive(true)
        setError(null)
      })
      .catch((err) => {
        console.error('Failed to start understanding session:', err)
        setIsActive(false)
        setError(s.err_live_understanding_start)
      })
    const unsubs = [
      window.electronAPI.onQuestionDetected(setQuestionContext),
      window.electronAPI.onAnswerGenerated(setAnswerContext),
      window.electronAPI.onThreadsStatus((statuses) => {
        liveCharsRef.current = 0
        setLiveCharsOffset(0)
        setThreadStatuses(statuses)
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const toggle = useCallback(async () => {
    if (isActive) {
      try {
        await window.electronAPI.stopUnderstandingSession()
        setIsActive(false)
        setError(null)
      } catch (err) {
        console.error('Failed to stop understanding session:', err)
        setError(s.err_live_understanding_stop)
      }
    } else {
      try {
        await window.electronAPI.startUnderstandingSession()
        setIsActive(true)
        setError(null)
        setQuestionContext(null)
        setAnswerContext(null)
        setThreadStatuses([])
      } catch (err) {
        console.error('Failed to start understanding session:', err)
        setIsActive(false)
        setError(s.err_live_understanding_start)
      }
    }
  }, [isActive, s.err_live_understanding_start, s.err_live_understanding_stop])

  const pushChunk = useCallback((text: string) => {
    liveCharsRef.current += text.length
    setLiveCharsOffset(liveCharsRef.current)
    window.electronAPI.pushTranscriptChunk(text).catch(console.error)
  }, [])

  const clear = useCallback(() => {
    setQuestionContext(null)
    setAnswerContext(null)
    window.electronAPI.clearUnderstanding().catch(console.error)
  }, [])

  return {
    questionContext, answerContext,
    threadStatuses, liveCharsOffset,
    isActive, error, toggle, clear, pushChunk,
  }
}
