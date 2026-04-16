import { useState, useEffect } from 'react'
import { useI18n } from '../i18n'

export function useSystemStats(): { stats: SystemStats | null; error: string | null } {
  const { s } = useI18n()
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getSystemStats()
      .then((next) => {
        setStats(next)
        setError(null)
      })
      .catch((err) => {
        console.error('Failed to load system stats:', err)
        setError(s.err_system_stats_load)
      })
    const unsub = window.electronAPI.onSystemStats(setStats)
    return unsub
  }, [s.err_system_stats_load])

  return { stats, error }
}
