import { useEffect, useRef, useState } from 'react'

interface Props {
  model: string
  onDone: () => void
}

type Status = 'pending' | 'downloading' | 'done' | 'error'

/** Sliding-window sample for speed calculation. */
interface Sample { t: number; bytes: number }
const SPEED_WINDOW_MS = 3000
const ETA_WINDOW_MS = 15000    // longer history so ETA doesn't jitter
const ETA_UPDATE_MS = 1000     // refresh ETA label at most 1/s
const ETA_EMA_ALPHA = 0.2      // smoothing for averaged speed

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 MB'
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB'
  return mb.toFixed(1) + ' MB'
}

function formatPair(downloaded: number, total: number): string {
  if (!total || !Number.isFinite(total)) return formatSize(downloaded)
  const totalMb = total / 1024 / 1024
  const useGb = totalMb >= 1024
  if (useGb) {
    return (downloaded / 1024 / 1024 / 1024).toFixed(2)
      + ' / '
      + (total / 1024 / 1024 / 1024).toFixed(2)
      + ' GB'
  }
  return (downloaded / 1024 / 1024).toFixed(1)
    + ' / '
    + totalMb.toFixed(1)
    + ' MB'
}

function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '-- MB/s'
  const mbps = bytesPerSec / 1024 / 1024
  if (mbps >= 10) return mbps.toFixed(1) + ' MB/s'
  if (mbps >= 1) return mbps.toFixed(2) + ' MB/s'
  return (bytesPerSec / 1024).toFixed(0) + ' KB/s'
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '~--:--'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `~${h}:${pad(m)}:${pad(sec)}`
  return `~${pad(m)}:${pad(sec)}`
}

/**
 * Fullscreen first-run UI: downloads the default whisper model before
 * the main app renders. Shows animated progress, live speed and ETA.
 */
export function FirstRunDownload({ model, onDone }: Props) {
  const [bytesDownloaded, setBytesDownloaded] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [pct, setPct] = useState(0)
  const [status, setStatus] = useState<Status>('pending')
  const [error, setError] = useState<string | null>(null)
  const [speed, setSpeed] = useState(0) // bytes/sec (instant, for display)
  const [etaSec, setEtaSec] = useState<number>(NaN)
  const [fading, setFading] = useState(false)

  const samplesRef = useRef<Sample[]>([])
  const etaSamplesRef = useRef<Sample[]>([])
  const emaRef = useRef<number>(0)
  const lastEtaUpdateRef = useRef<number>(0)
  const unsubProgressRef = useRef<(() => void) | null>(null)
  const unsubCompleteRef = useRef<(() => void) | null>(null)

  const subscribe = () => {
    unsubProgressRef.current?.()
    unsubCompleteRef.current?.()

    unsubProgressRef.current = window.electronAPI.onDownloadProgress((p) => {
      if (p.model !== model) return
      if (p.error) {
        setStatus('error')
        setError(p.error)
        return
      }
      if (p.done) {
        setPct(100)
        setStatus('done')
        setFading(true)
        setTimeout(onDone, 600)
        return
      }

      // Prefer exact byte counts; fall back to MB values.
      const downloaded = typeof p.bytesDownloaded === 'number'
        ? p.bytesDownloaded
        : typeof p.mb === 'number' ? p.mb * 1024 * 1024 : 0
      const total = typeof p.totalBytes === 'number' && p.totalBytes > 0
        ? p.totalBytes
        : typeof p.totalMb === 'number' && p.totalMb > 0 ? p.totalMb * 1024 * 1024 : 0

      if (Number.isFinite(downloaded) && downloaded >= 0) setBytesDownloaded(downloaded)
      if (Number.isFinite(total) && total > 0) setTotalBytes(total)

      if (typeof p.pct === 'number' && p.pct >= 0) {
        setPct(p.pct)
      } else if (total > 0 && downloaded > 0) {
        setPct(Math.round((downloaded / total) * 100))
      }

      if (status !== 'downloading') setStatus('downloading')

      // Sliding-window instant speed (3s) for display.
      const now = Date.now()
      const samples = samplesRef.current
      samples.push({ t: now, bytes: downloaded })
      while (samples.length > 1 && now - samples[0].t > SPEED_WINDOW_MS) samples.shift()
      if (samples.length >= 2) {
        const first = samples[0]
        const last = samples[samples.length - 1]
        const dt = (last.t - first.t) / 1000
        const db = last.bytes - first.bytes
        if (dt > 0 && db >= 0) setSpeed(db / dt)
      }

      // Longer window (15s) averaged + EMA-smoothed speed for ETA.
      const etaSamples = etaSamplesRef.current
      etaSamples.push({ t: now, bytes: downloaded })
      while (etaSamples.length > 1 && now - etaSamples[0].t > ETA_WINDOW_MS) etaSamples.shift()
      if (etaSamples.length >= 2) {
        const first = etaSamples[0]
        const last = etaSamples[etaSamples.length - 1]
        const dt = (last.t - first.t) / 1000
        const db = last.bytes - first.bytes
        if (dt > 0 && db >= 0) {
          const windowAvg = db / dt
          emaRef.current = emaRef.current === 0
            ? windowAvg
            : ETA_EMA_ALPHA * windowAvg + (1 - ETA_EMA_ALPHA) * emaRef.current

          if (now - lastEtaUpdateRef.current >= ETA_UPDATE_MS) {
            lastEtaUpdateRef.current = now
            if (total > 0 && emaRef.current > 0) {
              setEtaSec(Math.max(0, total - downloaded) / emaRef.current)
            }
          }
        }
      }
    })

    unsubCompleteRef.current = window.electronAPI.onModelDownloadComplete((c) => {
      if (c.model !== model) return
      if (c.ok) {
        setStatus('done')
        setPct(100)
        setFading(true)
        setTimeout(onDone, 600)
      } else {
        setStatus('error')
        setError(c.error ?? 'Download failed')
      }
    })
  }

  useEffect(() => {
    subscribe()
    return () => {
      unsubProgressRef.current?.()
      unsubCompleteRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const retry = () => {
    setError(null)
    setPct(0)
    setBytesDownloaded(0)
    setSpeed(0)
    setEtaSec(NaN)
    samplesRef.current = []
    etaSamplesRef.current = []
    emaRef.current = 0
    lastEtaUpdateRef.current = 0
    setStatus('downloading')
    subscribe()
    window.electronAPI.ensureDefaultModel().catch((e: Error) => {
      setStatus('error')
      setError(e.message)
    })
  }

  const indeterminate =
    (status === 'pending' || status === 'downloading') &&
    (bytesDownloaded === 0 || totalBytes === 0)

  const statusLabel =
    status === 'pending'     ? 'Preparing\u2026'  :
    status === 'downloading' ? 'Downloading\u2026' :
    status === 'done'        ? 'Ready'             :
                               'Error'

  const barColor =
    status === 'error' ? 'var(--color-error)' : 'var(--color-primary)'

  return (
    <div
      className="h-screen flex flex-col items-center justify-center px-6"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        transition: 'opacity 500ms ease',
        opacity: fading ? 0 : 1,
      }}
    >
      <div
        className="mb-6 text-center"
        style={{ color: 'var(--text-primary)' }}
      >
        <div className="text-2xl font-semibold tracking-tight">Meeting Helper</div>
      </div>

      <div
        className="w-full rounded-2xl p-7"
        style={{
          maxWidth: 520,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {model}
          </h2>
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{
              color: status === 'error' ? 'var(--color-error)' : 'var(--color-primary)',
            }}
          >
            {statusLabel}
          </span>
        </div>
        <p
          className="text-sm mb-6"
          style={{ color: 'var(--text-primary)', opacity: 0.85 }}
        >
          Setting up your transcription model &mdash; this only happens once.
        </p>

        {/* Progress bar */}
        <div
          className="relative h-2.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Downloading ${model}`}
        >
          {indeterminate ? (
            <div
              className="absolute inset-y-0"
              style={{
                width: '40%',
                backgroundColor: barColor,
                borderRadius: 'var(--radius-full)',
                animation: 'firstrun-shimmer 1.4s ease-in-out infinite',
              }}
            />
          ) : (
            <div
              className="h-full"
              style={{
                width: `${Math.max(1, Math.min(100, pct))}%`,
                backgroundColor: barColor,
                borderRadius: 'var(--radius-full)',
                transition: 'width 250ms ease',
              }}
            />
          )}
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 items-center gap-3">
          <div
            className="text-sm tabular-nums text-left"
            style={{ color: 'var(--text-primary)' }}
          >
            {totalBytes > 0
              ? formatPair(bytesDownloaded, totalBytes)
              : formatSize(bytesDownloaded)}
          </div>
          <div
            className="text-3xl font-semibold tabular-nums text-center"
            style={{ color: 'var(--text-primary)' }}
          >
            {indeterminate ? '--' : `${pct}%`}
          </div>
          <div
            className="text-sm tabular-nums text-right leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            <div>{formatSpeed(speed)}</div>
            <div style={{ opacity: 0.8 }}>{formatEta(etaSec)}</div>
          </div>
        </div>

        {status === 'error' && (
          <div
            className="mt-6 rounded-lg p-4 flex flex-col gap-3"
            style={{
              backgroundColor: 'rgba(255, 69, 58, 0.12)',
              border: '1px solid var(--color-error)',
            }}
            role="alert"
          >
            <div
              className="text-sm"
              style={{ color: 'var(--color-error)' }}
            >
              {error ?? 'Download failed.'}
            </div>
            <div>
              <button
                type="button"
                onClick={retry}
                className="px-4 py-2 text-sm font-medium rounded-md focus:outline-none"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: '#FFFFFF',
                  border: '1px solid transparent',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow =
                    '0 0 0 3px rgba(10, 132, 255, 0.45)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes firstrun-shimmer {
          0%   { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}
