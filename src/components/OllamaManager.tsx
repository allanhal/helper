import { useEffect, useRef } from 'react'
import { formatBytes } from '../utils/format'

interface Props {
  models: Array<{ name: string; size: number }>
  currentModel: string
  onSetModel: (m: string) => void
  onRefresh: () => void
  onClose: () => void
}

export function OllamaManager({ models, currentModel, onSetModel, onRefresh, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sorted = models.slice().sort((a, b) => b.size - a.size)

  useEffect(() => {
    if (!scrollRef.current) return
    const selected = scrollRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
    if (selected) selected.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [models.length])

  return (
    <div
      className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden"
      style={{ width: 280, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Ollama Model</span>
        <button onClick={onClose} className="px-2 text-xs hover:opacity-70" style={{ color: 'var(--text-tertiary)' }}>x</button>
      </div>

      {/* Model list */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {sorted.length === 0 ? (
          <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>No models — Ollama not running?</p>
        ) : sorted.map(m => {
          const isSelected = m.name === currentModel
          return (
            <button
              key={m.name}
              data-selected={isSelected ? 'true' : 'false'}
              onClick={() => { onSetModel(m.name); onClose() }}
              className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs hover:opacity-70 transition-opacity"
              style={{ color: isSelected ? 'var(--color-success)' : 'var(--text-primary)' }}
            >
              <span className="rounded-full flex-shrink-0"
                style={{ width: 6, height: 6, backgroundColor: isSelected ? 'var(--color-success)' : 'var(--border-color)' }} />
              <span className="flex-1 font-mono truncate">{m.name}</span>
              {m.size > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: '0.6rem', flexShrink: 0 }}>{formatBytes(m.size)}</span>}
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex justify-end px-2 py-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <button onClick={onRefresh} className="text-xs hover:opacity-70 transition-opacity" style={{ color: 'var(--text-tertiary)' }}>
          ↻ refresh
        </button>
      </div>
    </div>
  )
}
