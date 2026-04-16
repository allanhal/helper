import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useTranscription } from './hooks/useTranscription'
import { useModels } from './hooks/useModels'
import { useSystemStats } from './hooks/useSystemStats'
import { useUnderstanding } from './hooks/useUnderstanding'
import { useOllama } from './hooks/useOllama'
import { useStorage } from './hooks/useStorage'
import { Toolbar } from './components/Toolbar'
import { TranscriptColumns } from './components/TranscriptColumns'
import { AudioMeter } from './components/AudioMeter'
import { UnderstandingPanel } from './components/UnderstandingPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { OllamaManager } from './components/OllamaManager'
import { FirstRunDownload } from './components/FirstRunDownload'
import { useI18n } from './i18n'
import './index.css'

function App() {
  const [firstRunNeeded, setFirstRunNeeded] = useState<boolean | null>(null)
  const [firstRunModel, setFirstRunModel] = useState<string>('large-v3-turbo')

  useEffect(() => {
    window.electronAPI.ensureDefaultModel().then((res) => {
      setFirstRunModel(res.model)
      setFirstRunNeeded(!res.present)
    }).catch(() => {
      // IPC failed — show first-run download so the user sees the error
      // and can retry instead of silently skipping to a broken main app
      setFirstRunNeeded(true)
    })
  }, [])

  if (firstRunNeeded === null) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <span>Loading...</span>
      </div>
    )
  }

  if (firstRunNeeded) {
    return <FirstRunDownload model={firstRunModel} onDone={() => setFirstRunNeeded(false)} />
  }

  return <MainApp />
}

function MainApp() {
  const { s } = useI18n()

  const [fontSize, setFontSize] = useStorage<number>('helper-font-size', 13)
  const [understandingWidth, setUnderstandingWidth] = useStorage<number>('helper-understanding-width', 380)

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = understandingWidth
    const onMouseMove = (ev: MouseEvent) => {
      setUnderstandingWidth(Math.max(180, startWidth + ev.clientX - startX))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [understandingWidth, setUnderstandingWidth])

  const { models, error: modelsError } = useModels()
  const { stats: systemStats, error: systemStatsError } = useSystemStats()
  const {
    questionContext, answerContext, threadStatuses, liveCharsOffset,
    isActive: understandingActive, error: understandingError, clear: clearUnderstanding,
    pushChunk: pushTranscriptChunk,
  } = useUnderstanding()
  const {
    model: ollamaModel,
    models: ollamaModels,
    error: ollamaError,
    refresh: ollamaRefresh,
    setCurrent: setOllamaModel,
  } = useOllama()

  // Fast model removed — single model architecture

  const [transcripts, setTranscripts] = useState<Record<string, string>>({})
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showOllamaPicker, setShowOllamaPicker] = useState(false)
  const lastChunkRef = useRef<Float32Array | null>(null)
  const modelPickerRef = useRef<HTMLDivElement | null>(null)
  const ollamaPickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const unsubChunk = window.electronAPI.onMergeChunk((text) => {
      setTranscripts((prev) => ({ ...prev, merged: (prev.merged ?? '') + text }))
    })
    const unsubDone = window.electronAPI.onMergeDone((result) => {
      if (!result.ok) {
        setMergeError(result.reason ?? s.err_merge_failed)
        setTranscripts((prev) => {
          const next = { ...prev }
          if (!next.merged || next.merged.trim() === '') delete next.merged
          return next
        })
      } else {
        setMergeError(null)
      }
    })
    return () => { unsubChunk(); unsubDone() }
  }, [s.err_merge_failed])

  useEffect(() => {
    if (!showModelPicker && !showOllamaPicker) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (modelPickerRef.current?.contains(target) || ollamaPickerRef.current?.contains(target)) return
      setShowModelPicker(false)
      setShowOllamaPicker(false)
    }
    document.addEventListener('click', close, { capture: true })
    return () => document.removeEventListener('click', close, { capture: true })
  }, [showModelPicker, showOllamaPicker])

  const handleFontSizeChange = useCallback((dir: 1 | -1 | 0) => {
    setFontSize((prev) => {
      if (dir === 0) return 13
      const presets = [11, 13, 16]
      if (dir === 1) return presets.find((p) => p > prev) ?? prev + 2
      return Math.max(2, [...presets].reverse().find((p) => p < prev) ?? prev - 2)
    })
  }, [setFontSize])

  const { enqueueChunk, cancelTranscription, isTranscribing, error: transcriptionError } = useTranscription()

  const handleNewChunk = useCallback((chunk: Float32Array) => {
    lastChunkRef.current = chunk
    // Run whisper.cpp models via existing transcribe pipeline
    enqueueChunk(chunk, (results) => {
      setTranscripts((prev) => {
        const next = { ...prev }
        for (const r of results) {
          next[r.model] = (next[r.model] ? next[r.model] + '\n' : '') + r.text
        }
        return next
      })
      const lang = results.find((r) => r.language)?.language
      if (lang) setDetectedLanguage(lang)
      if (understandingActive && results.length > 0) {
        const text = results[0].text.trim()
        if (text) pushTranscriptChunk(text)
      }
    })
  }, [enqueueChunk, understandingActive, pushTranscriptChunk])

  const handleMerge = useCallback(async (results: TranscribeResult[]) => {
    setMergeError(null)
    setTranscripts((prev) => ({ ...prev, merged: '' }))
    await window.electronAPI.mergeTranscripts(results).catch(console.error)
  }, [])

  const {
    start, stop, isRecording, error: captureError,
    audioLevel, micMuted, speakerMuted, toggleMicMute, toggleSpeakerMute,
  } = useAudioCapture(handleNewChunk)

  // Pause/resume LLM threads based on recording state
  useEffect(() => {
    if (!understandingActive) return
    if (isRecording) {
      window.electronAPI.resumeUnderstandingSession().catch(console.error)
    } else {
      window.electronAPI.pauseUnderstandingSession().catch(console.error)
    }
  }, [isRecording, understandingActive])

  const handleStart = useCallback(async () => {
    try { await start() } catch { /* surfaced via captureError */ }
  }, [start])

  const handleClear = useCallback(() => {
    setTranscripts({})
    setDetectedLanguage(null)
    clearUnderstanding()
  }, [clearUnderstanding])

  const handleSave = useCallback(async () => {
    const values = Object.values(transcripts)
    if (values.length === 0) return
    const content = values.length === 1 ? values[0] : values.join('\n\n---\n\n')
    if (!await window.electronAPI.saveFile(content)) alert(s.err_save_transcript_failed)
  }, [transcripts, s.err_save_transcript_failed])

  const selectedModels = useMemo(() => models.filter((m) => m.selected), [models])
  const hasWhisperModels = selectedModels.length > 0 && selectedModels.every((m) => m.exists && m.downloadPct === undefined)
  const isModelReady = hasWhisperModels
  const initializationError = modelsError || systemStatsError || understandingError || ollamaError
  const activeError = initializationError || captureError || transcriptionError
  const status = useMemo<'idle' | 'recording' | 'transcribing' | 'error'>(() => {
    if (activeError) return 'error'
    if (isRecording) return 'recording'
    if (isTranscribing) return 'transcribing'
    return 'idle'
  }, [activeError, isRecording, isTranscribing])

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', ['--fs' as string]: `${fontSize}px` }}
    >
      <Toolbar
        status={status}
        errorMessage={activeError}
        onStart={handleStart}
        onStop={() => { stop(); cancelTranscription() }}
        onClear={handleClear}
        onSave={handleSave}
        onToggleHistory={() => setShowHistory((v) => !v)}
        historyOpen={showHistory}
        disabled={!isModelReady}
        fontSize={fontSize}
        onFontSizeDecrease={() => handleFontSizeChange(-1)}
        onFontSizeReset={() => handleFontSizeChange(0)}
        onFontSizeIncrease={() => handleFontSizeChange(1)}
      />

      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}

      <div
        className="flex items-center gap-4 px-4 border-b"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', height: 36 }}
      >
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={toggleMicMute}
            title={micMuted ? s.tip_unmute_mic : s.tip_mute_mic}
            className="p-1.5 rounded-md transition-opacity hover:opacity-70"
            style={{
              backgroundColor: micMuted ? 'rgba(255,69,58,0.15)' : 'var(--bg-tertiary)',
              color: micMuted ? 'var(--color-error)' : 'var(--text-secondary)',
              border: `1px solid ${micMuted ? 'var(--color-error)' : 'var(--border-color)'}`,
            }}
          >
            {micMuted ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            )}
          </button>
          <button
            onClick={toggleSpeakerMute}
            title={speakerMuted ? s.tip_unmute_speaker : s.tip_mute_speaker}
            className="p-1.5 rounded-md transition-opacity hover:opacity-70"
            style={{
              backgroundColor: speakerMuted ? 'rgba(255,69,58,0.15)' : 'var(--bg-tertiary)',
              color: speakerMuted ? 'var(--color-error)' : 'var(--text-secondary)',
              border: `1px solid ${speakerMuted ? 'var(--color-error)' : 'var(--border-color)'}`,
            }}
          >
            {speakerMuted ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
        </div>

        <AudioMeter level={audioLevel} isActive={isRecording} wide />
        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-shrink-0 pl-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(48,209,88,0.08)', color: 'rgb(48,209,88)', border: '1px solid rgba(48,209,88,0.2)' }}
          >
            whisper turbo
          </span>

          {detectedLanguage && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono uppercase"
              style={{
                backgroundColor: 'rgba(10,132,255,0.12)',
                color: 'var(--color-primary)',
                border: '1px solid rgba(10,132,255,0.25)',
                letterSpacing: '0.05em',
              }}
              title={s.label_detected_language(detectedLanguage)}
            >
              {detectedLanguage.slice(0, 2)}
            </span>
          )}

          <div className="relative" ref={ollamaPickerRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowModelPicker(false); setShowOllamaPicker((v) => !v) }}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
              title="AI understanding model"
            >
              <span>{ollamaModel || 'Ollama'}</span>
            </button>
            {showOllamaPicker && (
              <OllamaManager
                models={ollamaModels}
                currentModel={ollamaModel}
                onSetModel={(m) => { setOllamaModel(m) }}
                onRefresh={ollamaRefresh}
                onClose={() => setShowOllamaPicker(false)}
              />
            )}
          </div>

          {systemStats && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {s.label_gb_free(String(Math.round(systemStats.freeMb / 1024 * 10) / 10))}
            </span>
          )}

        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div style={{ width: understandingWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <UnderstandingPanel
            questionContext={questionContext}
            answerContext={answerContext}
            threadStatuses={threadStatuses}
            liveCharsOffset={liveCharsOffset}
            isActive={understandingActive}
          />
        </div>
        {/* Draggable resize divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          className="flex-shrink-0 transition-colors hover:bg-blue-500"
          style={{ width: 4, cursor: 'col-resize', backgroundColor: 'var(--border-color)' }}
        />
        <TranscriptColumns
          transcripts={transcripts}
          selectedModels={selectedModels}
          onMerge={handleMerge}
          onChangeTranscripts={setTranscripts}
          mergeError={mergeError}
        />
      </div>
    </div>
  )
}

export default App
