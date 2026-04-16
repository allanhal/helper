import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

interface TranscriptColumnsProps {
  transcripts: Record<string, string>
  selectedModels: ModelState[]
  onMerge: (results: TranscribeResult[]) => Promise<void>
  onChangeTranscripts: (t: Record<string, string>) => void
  mergeError?: string | null
  flex?: number
}

export function TranscriptColumns({ transcripts, selectedModels, onMerge, onChangeTranscripts, mergeError, flex }: TranscriptColumnsProps) {
  const { s } = useI18n()
  const popularOllamaModels = [
    { name: 'llama3.2',       label: 'Llama 3.2',      sizeMb: 2000, desc: s.popular_model_desc_llama32 },
    { name: 'llama3.2:1b',    label: 'Llama 3.2 1B',   sizeMb: 1300, desc: s.popular_model_desc_llama32_1b },
    { name: 'gemma3:4b',      label: 'Gemma 3 4B',     sizeMb: 2500, desc: s.popular_model_desc_gemma34b },
    { name: 'qwen3:4b',       label: 'Qwen 3 4B',      sizeMb: 2500, desc: s.popular_model_desc_qwen34b },
  ]
  // merged key exists but is empty string = streaming in progress
  const isMerging = 'merged' in transcripts && transcripts.merged === ''
  const isMerged = 'merged' in transcripts && transcripts.merged !== ''
  const modelKeys = (isMerging || isMerged) ? ['merged'] : selectedModels.map(m => m.name)


  const [ollamaModel, setOllamaModel] = useState('llama3.2')
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: number }>>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [pullInput, setPullInput] = useState('')
  const [showPullInput, setShowPullInput] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getOllamaModel().then(m => { if (m) setOllamaModel(m) })
  }, [])

  const loadOllamaModels = useCallback(async () => {
    setLoadingModels(true)
    const models = await window.electronAPI.getOllamaModels()
    setOllamaModels(models)
    setLoadingModels(false)
  }, [])

  useEffect(() => {
    void loadOllamaModels()
  }, [loadOllamaModels])

  const handlePull = useCallback(async () => {
    if (!pullInput.trim()) return
    setPulling(true)
    setPullError(null)
    const res = await window.electronAPI.pullOllamaModel(pullInput.trim())
    if (res.ok) {
      await loadOllamaModels()
      setOllamaModel(pullInput.trim())
      window.electronAPI.setOllamaModel(pullInput.trim())
      setPullInput('')
      setShowPullInput(false)
    } else {
      setPullError(res.reason ?? s.err_pull_failed)
    }
    setPulling(false)
  }, [pullInput, loadOllamaModels, s.err_pull_failed])

  const handleMergeClick = useCallback(async () => {
    const results = Object.entries(transcripts)
      .filter(([, text]) => text.trim())
      .map(([model, text]) => ({ model, text }))
    if (results.length === 0) return
    await onMerge(results)
  }, [transcripts, onMerge])

  const canMerge = !isMerging && !isMerged && Object.values(transcripts).some(t => t.trim()) && selectedModels.length > 1

  return (
    <div className="flex flex-col overflow-hidden" style={{ flex: flex ?? 1 }}>
      {/* Merge bar */}
      {(canMerge || isMerging || isMerged || !!mergeError) && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 border-b flex-shrink-0 flex-wrap"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* Status label */}
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {isMerging
              ? s.status_merging
              : isMerged
              ? s.label_merged_result
              : s.msg_parallel_models(selectedModels.length)}
          </span>
          <div className="flex-1" />

          {/* Error message */}
          {mergeError && (
            <span className="text-xs" style={{ color: 'var(--color-error)' }}>
              {mergeError}
            </span>
          )}

          {/* Ollama model selector + merge button — only when canMerge */}
          {canMerge && (
            <>
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                {s.label_merge_model}
              </span>
              {/* Ollama model selector */}
              <div className="flex items-center gap-1">
                {ollamaModels.length > 0 ? (
                  <select
                    value={ollamaModel}
                    onChange={(e) => {
                      setOllamaModel(e.target.value)
                      window.electronAPI.setOllamaModel(e.target.value)
                    }}
                    className="text-xs px-2 py-0.5 rounded border outline-none"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-color)',
                      maxWidth: 160,
                    }}
                    aria-label={s.aria_ollama_merge}
                  >
                    {ollamaModels.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {loadingModels ? s.status_loading : s.status_ollama_not_running}
                  </span>
                )}
                {/* Refresh button */}
                <button
                  onClick={loadOllamaModels}
                  className="px-1.5 py-0.5 text-xs rounded transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label={s.aria_refresh_models}
                  title={s.tip_refresh_models}
                >&#x21BB;</button>
                {/* Pull new model toggle */}
                <button
                  onClick={() => {
                    setPullError(null)
                    setShowPullInput((v) => !v)
                  }}
                  className="px-1.5 py-0.5 text-xs rounded transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label={s.aria_pull_model}
                  title={s.tip_pull_model}
                >+</button>
              </div>

              <button
                onClick={handleMergeClick}
                className="px-3 py-1 text-xs rounded-md font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
              >
                {s.btn_merge_ai}
              </button>
            </>
          )}

          {/* Streaming indicator */}
          {isMerging && (
            <span className="text-xs animate-pulse" style={{ color: 'var(--text-tertiary)' }}>
              {s.status_generating_ollama}
            </span>
          )}

          {/* Back to columns button */}
          {isMerged && (
            <button
              onClick={() => onChangeTranscripts(
                Object.fromEntries(Object.entries(transcripts).filter(([k]) => k !== 'merged'))
              )}
              className="px-3 py-1 text-xs rounded-md font-medium transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {s.btn_back_columns}
            </button>
          )}
        </div>
      )}

      {/* Popular models panel */}
      {showPullInput && (
        <div
          className="mx-4 mb-2 rounded-lg border overflow-hidden flex-shrink-0"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {s.section_popular_models}
            </span>
            <button
              onClick={() => { setShowPullInput(false); setPullError(null) }}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label={s.btn_close}
            >×</button>
          </div>

          {/* Model list */}
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {popularOllamaModels.map((m) => {
              const installed = ollamaModels.some((om) => om.name === m.name || om.name.startsWith(m.name + ':'))
              const isSelected = ollamaModel === m.name
              return (
                <div
                  key={m.name}
                  className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {m.label}
                      </span>
                      <span
                        className="px-1 rounded flex-shrink-0"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', fontSize: '0.6rem' }}
                      >
                        {m.sizeMb >= 1000 ? `${(m.sizeMb / 1000).toFixed(1)} GB` : `${m.sizeMb} MB`}
                      </span>
                      {installed && (
                        <span
                          className="px-1 rounded flex-shrink-0"
                          style={{ backgroundColor: 'rgba(48,209,88,0.15)', color: 'var(--color-success)', fontSize: '0.6rem' }}
                        >
                          {s.badge_installed}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{m.desc}</p>
                  </div>
                  {installed ? (
                    <button
                      onClick={() => {
                        setOllamaModel(m.name)
                        window.electronAPI.setOllamaModel(m.name)
                        setShowPullInput(false)
                      }}
                      disabled={isSelected}
                      className="px-2 py-0.5 text-xs rounded font-medium flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                    >
                      {isSelected ? s.btn_active : s.btn_use}
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        setPulling(true)
                        setPullError(null)
                        const res = await window.electronAPI.pullOllamaModel(m.name)
                        if (res.ok) {
                          await loadOllamaModels()
                          setOllamaModel(m.name)
                          window.electronAPI.setOllamaModel(m.name)
                          setShowPullInput(false)
                        } else {
                          setPullError(res.reason ?? s.err_pull_failed)
                        }
                        setPulling(false)
                      }}
                      disabled={pulling}
                      className="px-2 py-0.5 text-xs rounded font-medium flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
                    >
                      {pulling ? '\u2026' : s.btn_pull_size(m.sizeMb >= 1000 ? `${(m.sizeMb / 1000).toFixed(1)}GB` : `${m.sizeMb}MB`)}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {pullError && (
            <div
              className="px-3 py-2 border-t"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(255,59,48,0.06)' }}
            >
              <p className="text-xs" style={{ color: 'var(--color-error)' }}>
                {pullError}
              </p>
            </div>
          )}

          {/* Manual input row */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-t"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{s.label_or_enter_name}</span>
            <input
              value={pullInput}
              onChange={(e) => setPullInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePull()}
              placeholder={s.placeholder_model_name}
              className="flex-1 text-xs px-2 py-0.5 rounded border outline-none"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-color)',
              }}
            />
            <button
              onClick={handlePull}
              disabled={pulling || !pullInput.trim()}
              className="px-2 py-0.5 text-xs rounded font-medium transition-opacity hover:opacity-80 disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
            >
              {pulling ? s.status_pulling : s.btn_pull_plain}
            </button>
          </div>
        </div>
      )}

      {/* Columns */}
      <div className="flex-1 flex overflow-hidden">
        {modelKeys.map((key) => {
          const label = (isMerging || isMerged) ? s.label_merged : (selectedModels.find(m => m.name === key)?.label ?? key)
          const text = transcripts[key] ?? ''
          return (
            <div
              key={key}
              className="flex-1 flex flex-col overflow-hidden border-r"
              style={{ borderColor: 'var(--border-color)' }}
            >
              {/* Column header — only show when more than one column */}
              {modelKeys.length > 1 && (
                <div
                  className="px-4 py-1.5 border-b flex-shrink-0 flex items-center gap-2"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <span className="font-medium" style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs)' }}>
                    {label}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs)' }}>
                    {text.trim().split(/\s+/).filter(Boolean).length} {s.label_words_count}
                  </span>
                </div>
              )}
              <AutoScrollTextarea
                value={text}
                onChange={(e) => onChangeTranscripts({ ...transcripts, [key]: e.target.value })}
                placeholder={key === 'merged' ? s.placeholder_generating : s.placeholder_transcription(label)}
              />
            </div>
          )
        })}

        {/* Empty state when no models selected and no transcripts */}
        {modelKeys.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {s.msg_select_model_start}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function AutoScrollTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const userScrolledUp = useRef(false)

  // Detect manual scroll up
  const handleScroll = () => {
    const el = ref.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    userScrolledUp.current = !atBottom
  }

  useEffect(() => {
    if (userScrolledUp.current) return
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onScroll={handleScroll}
      className="flex-1 w-full resize-none outline-none px-4 py-3 leading-relaxed"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'inherit',
        fontSize: 'var(--fs)',
      }}
      spellCheck={false}
      placeholder={placeholder}
    />
  )
}
