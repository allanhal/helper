import { useI18n } from '../i18n'
import type { Lang } from '../i18n'

type AppStatus = 'idle' | 'recording' | 'transcribing' | 'error'

interface ToolbarProps {
  status: AppStatus
  errorMessage?: string | null
  onStart: () => void | Promise<void>
  onStop: () => void
  onClear: () => void
  onSave: () => void
  onToggleHistory: () => void
  historyOpen: boolean
  disabled?: boolean
  fontSize: number
  onFontSizeDecrease: () => void
  onFontSizeReset: () => void
  onFontSizeIncrease: () => void
}

const LANGS: { value: Lang; flag: string; label: string }[] = [
  { value: 'en', flag: '🇺🇸', label: 'EN' },
  { value: 'pt', flag: '🇧🇷', label: 'PT' },
]

export const Toolbar = ({
  status,
  errorMessage,
  onStart,
  onStop,
  onClear,
  onSave,
  onToggleHistory,
  historyOpen,
  disabled = false,
  fontSize,
  onFontSizeDecrease,
  onFontSizeReset,
  onFontSizeIncrease,
}: ToolbarProps) => {
  const { s, lang, setLang } = useI18n()

  return (
    <div
      className="border-b"
      style={{
        borderColor: 'var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {/* Full-width drag strip — no interactive children, always draggable */}
      <div
        style={{
          height: 10,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      />
    <div
      className="flex items-center px-4"
      style={{
        // Reserve space for macOS traffic lights (hiddenInset titlebar)
        paddingLeft: 80,
        height: 44,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* App title + version */}
      <div className="flex items-center gap-2">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
          <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" fill="currentColor"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.app_name}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>v{__APP_VERSION__}</span>
      </div>

      {/* Center: primary record/stop button */}
      <div
        className="flex-1 flex justify-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {status === 'idle' && (
          <button
            onClick={onStart}
            disabled={disabled}
            className="flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-semibold
              transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-success)', color: '#ffffff' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="9"/>
            </svg>
            {s.btn_record}
          </button>
        )}
        {status === 'recording' && (
          <button
            onClick={onStop}
            className="flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-semibold
              transition-all duration-150 active:scale-95"
            style={{ backgroundColor: 'var(--color-error)', color: '#ffffff' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"
              style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
              <rect x="4" y="4" width="16" height="16" rx="3"/>
            </svg>
            {s.btn_stop}
          </button>
        )}
        {status === 'transcribing' && (
          <button
            disabled
            className="flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-semibold opacity-70 cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-warning)', color: '#ffffff' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            {s.status_transcribing_btn}
          </button>
        )}
        {status === 'error' && (
          <button
            onClick={onStart}
            disabled={disabled}
            title={errorMessage ?? undefined}
            className="flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-semibold
              transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#3a1c1c', color: 'var(--color-error)', border: '1px solid var(--color-error)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="9"/>
            </svg>
            {s.btn_retry}
          </button>
        )}
      </div>

      {/* Right: secondary actions */}
      <div
        className="flex items-center gap-2 justify-end"
        style={{ WebkitAppRegion: 'no-drag', width: 'auto', minWidth: 160 } as React.CSSProperties}
      >
        {/* Font size controls — segmented group */}
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
          <button
            onClick={onFontSizeDecrease}
            title={s.tip_decrease_font}
            className="px-3 py-1 text-xs font-medium transition-opacity hover:opacity-70 border-r"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
          >A−</button>
          <button
            onClick={onFontSizeReset}
            title={s.tip_reset_font}
            className="px-3 py-1 text-xs font-medium transition-opacity hover:opacity-70 border-r"
            style={{ color: fontSize === 13 ? 'var(--color-primary)' : 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
          >A</button>
          <button
            onClick={onFontSizeIncrease}
            title={s.tip_increase_font}
            className="px-3 py-1 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
          >A+</button>
        </div>
        <button
          onClick={onClear}
          disabled={disabled}
          className="px-3 py-1 text-xs rounded-md font-medium transition-opacity hover:opacity-70
            disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          {s.btn_clear}
        </button>
        <button
          onClick={onSave}
          disabled={disabled}
          className="px-3 py-1 text-xs rounded-md font-medium transition-opacity hover:opacity-70
            disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: '#60aeff', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
        >
          {s.btn_save}
        </button>

        <button
          onClick={onToggleHistory}
          title={s.tip_session_history}
          className="p-1.5 rounded-md transition-opacity hover:opacity-70"
          style={{
            backgroundColor: historyOpen ? 'var(--color-primary)' : 'var(--bg-tertiary)',
            color: historyOpen ? '#ffffff' : 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
          }}
        >
          {/* Clock/history icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>

        {/* Language switcher */}
        <div className="relative flex items-center"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
          <span className="pointer-events-none pl-2" style={{ fontSize: 13, lineHeight: 1 }}>
            {LANGS.find(l => l.value === lang)?.flag}
          </span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            title={s.tip_change_language}
            className="appearance-none pl-1 pr-5 py-1 text-xs font-medium bg-transparent outline-none cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            {LANGS.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-1.5" width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ color: 'var(--text-tertiary)' }}>
            <polyline points="2,3 5,7 8,3" />
          </svg>
        </div>
      </div>
    </div>
    </div>
  )
}
