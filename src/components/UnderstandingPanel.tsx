import { useState, useRef, useEffect } from 'react'

interface QAEntry {
  question: string
  answer: string
  confidence: number
  timestamp: number
}

interface Props {
  questionContext: QuestionContext | null
  answerContext:   AnswerContext | null
  threadStatuses:  ThreadStatus[]
  liveCharsOffset: number
  isActive: boolean
}

export function UnderstandingPanel({ questionContext, answerContext, threadStatuses, liveCharsOffset, isActive }: Props) {
  const [history, setHistory]   = useState<QAEntry[]>([])
  const historyRef = useRef<HTMLDivElement>(null)

  // Append to history when a new answer arrives
  useEffect(() => {
    if (!answerContext?.answer || !answerContext?.question) return
    setHistory(prev => {
      // Don't duplicate the same question+answer
      const last = prev[prev.length - 1]
      if (last && last.question === answerContext.question && last.answer === answerContext.answer) return prev
      return [...prev, {
        question: answerContext.question,
        answer: answerContext.answer,
        confidence: answerContext.confidence,
        timestamp: answerContext.last_updated_at,
      }]
    })
  }, [answerContext])

  // Auto-scroll history to bottom
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [history])

  if (!isActive) {
    return (
      <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
        Understanding inactive
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 12, gap: 12 }}>
      {/* Thread status dots */}
      <ThreadDots statuses={threadStatuses} liveCharsOffset={liveCharsOffset} />

      {/* Current detection status */}
      {questionContext?.has_question && questionContext.question && !answerContext && (
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          padding: 10,
          border: '1px solid var(--border-color)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Question Detected — generating answer...
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {questionContext.question}
          </div>
        </div>
      )}

      {/* Q&A History */}
      <div ref={historyRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.length === 0 && !questionContext?.has_question && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            Listening for questions...
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} style={{
            background: 'rgba(48, 209, 88, 0.08)',
            borderRadius: 8,
            padding: 10,
            border: '1px solid rgba(48, 209, 88, 0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(48, 209, 88, 0.8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Q&A #{i + 1}
                {entry.confidence < 0.5 && (
                  <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>(low confidence)</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontStyle: 'italic' }}>
              Q: {entry.question}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {entry.answer}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Thread status dots
// ---------------------------------------------------------------------------

function ThreadDots({ statuses, liveCharsOffset }: { statuses: ThreadStatus[]; liveCharsOffset: number }) {
  if (statuses.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {statuses.map((t) => {
        const charsSince = t.id === 'question' ? t.chars_since_last + liveCharsOffset : t.chars_since_last
        const bg = t.error
          ? 'rgba(255,59,48,0.15)'
          : t.running
            ? 'rgba(255,159,10,0.15)'
            : t.last_ran_at
              ? 'rgba(48,209,88,0.15)'
              : 'var(--bg-tertiary)'
        const color = t.error
          ? 'rgb(255,59,48)'
          : t.running
            ? 'rgb(255,159,10)'
            : t.last_ran_at
              ? 'rgb(48,209,88)'
              : 'var(--text-secondary)'

        const tooltip = [
          `${t.label}: ${t.error ? t.error : t.running ? 'running' : t.last_ran_at ? 'done' : 'idle'}`,
          t.last_duration_ms ? `${t.last_duration_ms}ms` : null,
          t.trigger_chars > 0 ? `${charsSince}/${t.trigger_chars} chars` : null,
          `calls: ${t.call_count}`,
        ].filter(Boolean).join(' | ')

        return (
          <div
            key={t.id}
            title={tooltip}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: bg,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              color,
              fontWeight: 500,
            }}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: color,
              animation: t.running ? 'pulse 1s ease-in-out infinite' : undefined,
            }} />
            {t.label}
          </div>
        )
      })}
    </div>
  )
}
