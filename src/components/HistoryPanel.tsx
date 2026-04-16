import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../i18n'
import { useConfirm } from '../hooks/useConfirm'

interface Props {
  onClose: () => void
}

export function HistoryPanel({ onClose }: Props) {
  const { s: i18n } = useI18n()
  const { confirm } = useConfirm()
  const [topics, setTopics] = useState<Array<{ name: string; count: number }>>([])
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [selected, setSelected] = useState<StoredSession | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (topic?: string) => {
    setLoading(true)
    const [topicList, sessionList] = await Promise.all([
      window.electronAPI.dbGetTopics(),
      window.electronAPI.dbGetSessions(topic),
    ])
    setTopics(topicList)
    setSessions(sessionList)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleTopicClick = (name: string) => {
    const next = activeTopic === name ? null : name
    setActiveTopic(next)
    setSelected(null)
    setCheckedIds(new Set())
    load(next ?? undefined)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(i18n.msg_confirm_delete)) return
    await window.electronAPI.dbDeleteSession(id)
    if (selected?.id === id) setSelected(null)
    setCheckedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    load(activeTopic ?? undefined)
  }

  const handleDeleteChecked = async () => {
    if (!confirm(i18n.msg_confirm_delete_n(checkedIds.size))) return
    await Promise.all([...checkedIds].map((id) => window.electronAPI.dbDeleteSession(id)))
    if (selected && checkedIds.has(selected.id)) setSelected(null)
    setCheckedIds(new Set())
    load(activeTopic ?? undefined)
  }

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCheckedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const allChecked = sessions.length > 0 && sessions.every((sess) => checkedIds.has(sess.id))
  const toggleAll = () => setCheckedIds(allChecked ? new Set() : new Set(sessions.map((sess) => sess.id)))

  const handleToggleDone = async (actionId: number, done: boolean) => {
    await window.electronAPI.dbUpdateActionDone(actionId, !done)
    if (selected) {
      const updated = await window.electronAPI.dbGetSession(selected.id)
      if (updated) setSelected(updated)
    }
  }

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const fmtDuration = (start: number, end: number | null | undefined) => {
    if (!end) return null
    const mins = Math.round((end - start) / 60000)
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  return (
    <div
      className="flex flex-col border-b flex-shrink-0"
      style={{
        height: 440,
        borderColor: 'var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
        fontSize: 'var(--fs)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border-color)', height: 38 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)', fontSize: 'var(--fs)' }}>
            {i18n.section_session_history}
          </span>
          {topics.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
              {topics.map((t) => (
                <button
                  key={t.name}
                  onClick={() => handleTopicClick(t.name)}
                  className="flex-shrink-0 px-2 py-0.5 rounded-full transition-opacity hover:opacity-80 whitespace-nowrap"
                  style={{
                    fontSize: 'calc(var(--fs) - 1px)',
                    backgroundColor: activeTopic === t.name ? 'var(--color-primary)' : 'var(--bg-primary)',
                    color: activeTopic === t.name ? '#ffffff' : 'var(--text-secondary)',
                    border: `1px solid ${activeTopic === t.name ? 'var(--color-primary)' : 'var(--border-color)'}`,
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.name}
                  <span className="ml-1 opacity-60">{t.count}</span>
                </button>
              ))}
              {activeTopic && (
                <button
                  onClick={() => { setActiveTopic(null); setSelected(null); load() }}
                  className="flex-shrink-0 px-1.5 py-0.5 rounded transition-opacity hover:opacity-70"
                  style={{ fontSize: 'calc(var(--fs) - 1px)', color: 'var(--text-tertiary)' }}
                >
                  {i18n.btn_clear_filter}
                </button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-3 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1 }}
        >x</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: session list */}
        <div
          className="flex flex-col border-r overflow-hidden flex-shrink-0"
          style={{ width: 260, borderColor: 'var(--border-color)' }}
        >
          {checkedIds.size > 0 && (
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b flex-shrink-0"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(255,59,48,0.06)' }}
            >
              <span style={{ color: 'var(--text-secondary)', fontSize: 'calc(var(--fs) - 1px)' }}>
                {i18n.label_n_selected(checkedIds.size)}
              </span>
              <button
                onClick={handleDeleteChecked}
                className="px-2 py-0.5 rounded text-xs font-medium transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
              >
                {i18n.btn_delete_n(checkedIds.size)}
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-3" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs)' }}>{i18n.status_loading}</p>
            ) : sessions.length === 0 ? (
              <p className="p-3" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs)' }}>
                {activeTopic ? i18n.msg_no_sessions_topic(activeTopic) : i18n.msg_no_sessions}
              </p>
            ) : (
              <>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 border-b"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    style={{ accentColor: 'var(--color-primary)', width: 13, height: 13, cursor: 'pointer' }}
                    aria-label={i18n.aria_select_all_sessions}
                  />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 'calc(var(--fs) - 1px)' }}>
                    {i18n.label_select_all}
                  </span>
                </div>
                {sessions.map((sess) => {
                  const isSelected = selected?.id === sess.id
                  const isChecked = checkedIds.has(sess.id)
                  const dur = fmtDuration(sess.started_at, sess.ended_at)
                  return (
                    <div
                      key={sess.id}
                      className="flex items-stretch border-b group"
                      style={{
                        borderColor: 'var(--border-color)',
                        backgroundColor: isChecked ? 'rgba(255,59,48,0.05)' : isSelected ? 'rgba(0,122,255,0.08)' : 'transparent',
                        borderLeft: isChecked ? '2px solid var(--color-error)' : isSelected ? '2px solid var(--color-primary)' : '2px solid transparent',
                      }}
                    >
                      <div
                        className="flex items-start pt-3 pl-2 pr-1 flex-shrink-0"
                        onClick={(e) => toggleCheck(sess.id, e)}
                        style={{ cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          onClick={(e) => toggleCheck(sess.id, e)}
                          style={{ accentColor: 'var(--color-error)', width: 13, height: 13, cursor: 'pointer' }}
                          aria-label={i18n.aria_select_session}
                        />
                      </div>
                      <button
                        onClick={() => setSelected(sess)}
                        className="flex-1 text-left px-2 py-2.5 transition-colors hover:opacity-90 min-w-0"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="font-medium"
                            style={{ color: isSelected ? 'var(--color-primary)' : 'var(--text-secondary)', fontSize: 'calc(var(--fs) - 1px)' }}
                          >
                            {fmtDate(sess.started_at)}
                          </span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {dur && <span style={{ color: 'var(--text-tertiary)', fontSize: 'calc(var(--fs) - 2px)' }}>{dur}</span>}
                            <button
                              onClick={(e) => handleDelete(sess.id, e)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: 'var(--color-error)', fontSize: 14, lineHeight: 1 }}
                              aria-label={i18n.aria_delete_session}
                            >x</button>
                          </div>
                        </div>
                        {sess.summary ? (
                          <p className="mt-0.5 line-clamp-2" style={{ color: 'var(--text-primary)', fontSize: 'calc(var(--fs) - 1px)', lineHeight: 1.45 }}>
                            {sess.summary}
                          </p>
                        ) : (
                          <p className="mt-0.5" style={{ color: 'var(--text-tertiary)', fontSize: 'calc(var(--fs) - 1px)' }}>{i18n.msg_no_summary}</p>
                        )}
                        {sess.topics.length > 0 && (
                          <div className="flex gap-1 mt-1.5 overflow-hidden">
                            {sess.topics.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0 rounded-full whitespace-nowrap overflow-hidden text-ellipsis"
                                style={{ fontSize: 'calc(var(--fs) - 2px)', maxWidth: 80, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)' }}
                              >
                                {t}
                              </span>
                            ))}
                            {sess.topics.length > 3 && (
                              <span style={{ color: 'var(--text-tertiary)', fontSize: 'calc(var(--fs) - 2px)' }}>
                                +{sess.topics.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Right: session detail */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full">
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs)' }}>{i18n.msg_select_session}</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium" style={{ color: 'var(--text-primary)', fontSize: 'var(--fs)' }}>
                  {fmtDate(selected.started_at)}
                </span>
                {selected.ended_at ? (
                  <>
                    <span style={{ color: 'var(--text-tertiary)' }}>-&gt;</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs)' }}>{fmtDate(selected.ended_at)}</span>
                    {fmtDuration(selected.started_at, selected.ended_at) && (
                      <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 'calc(var(--fs) - 1px)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)' }}>
                        {fmtDuration(selected.started_at, selected.ended_at)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 'calc(var(--fs) - 1px)', backgroundColor: 'rgba(48,209,88,0.12)', color: 'var(--color-success)', border: '1px solid rgba(48,209,88,0.25)' }}>
                    {i18n.label_in_progress}
                  </span>
                )}
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'calc(var(--fs) - 1px)' }}>. {i18n.label_segments(selected.chunk_count)}</span>
              </div>

              {selected.summary && (
                <DetailSection title={i18n.section_summary}>
                  <p style={{ color: 'var(--text-primary)', lineHeight: 1.65, fontSize: 'var(--fs)' }}>{selected.summary}</p>
                </DetailSection>
              )}

              {selected.action_items.length > 0 && selected.key_decisions.length > 0 ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <DetailSection title={i18n.section_action_items} count={selected.action_items.length}>
                    <ActionItemList items={selected.action_items} onToggle={handleToggleDone} fontSize="var(--fs)" />
                  </DetailSection>
                  <DetailSection title={i18n.section_key_decisions} count={selected.key_decisions.length}>
                    <DecisionList decisions={selected.key_decisions} fontSize="var(--fs)" />
                  </DetailSection>
                </div>
              ) : (
                <>
                  {selected.action_items.length > 0 && (
                    <DetailSection title={i18n.section_action_items} count={selected.action_items.length}>
                      <ActionItemList items={selected.action_items} onToggle={handleToggleDone} fontSize="var(--fs)" />
                    </DetailSection>
                  )}
                  {selected.key_decisions.length > 0 && (
                    <DetailSection title={i18n.section_key_decisions} count={selected.key_decisions.length}>
                      <DecisionList decisions={selected.key_decisions} fontSize="var(--fs)" />
                    </DetailSection>
                  )}
                </>
              )}

              {selected.topics.length > 0 && (
                <DetailSection title={i18n.section_topics}>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.topics.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full" style={{ fontSize: 'var(--fs)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </DetailSection>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionItemList({ items, onToggle, fontSize }: {
  items: StoredSession['action_items']
  onToggle: (id: number, done: boolean) => void
  fontSize: string
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2" style={{ opacity: item.done ? 0.45 : 1 }}>
          <input type="checkbox" checked={item.done} onChange={() => onToggle(item.id, item.done)} className="mt-0.5 flex-shrink-0" style={{ accentColor: 'var(--color-primary)' }} />
          <div>
            <p style={{ color: 'var(--text-primary)', fontSize, textDecoration: item.done ? 'line-through' : 'none' }}>{item.task}</p>
            {(item.owner || item.deadline) && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'calc(var(--fs) - 1px)' }}>
                {[item.owner && `@${item.owner}`, item.deadline].filter(Boolean).join(' . ')}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function DecisionList({ decisions, fontSize }: { decisions: string[]; fontSize: string }) {
  return (
    <ul className="space-y-1">
      {decisions.map((d, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span style={{ color: 'var(--color-primary)', flexShrink: 0 }}>&#x25BA;</span>
          <span style={{ color: 'var(--text-primary)', fontSize }}>{d}</span>
        </li>
      ))}
    </ul>
  )
}

function DetailSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="font-semibold" style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span className="px-1.5 rounded-full" style={{ fontSize: 9, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-color)' }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
