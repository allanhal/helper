import { useMemo } from 'react'

/**
 * Format a date to locale string.
 */
export function formatDate(date: Date | number): string {
  const d = new Date(date)
  return d.toLocaleString()
}

/**
 * Format duration in seconds to human-readable string.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

/**
 * Hook for formatting date/time with memoization.
 */
export function useFormattedDate(timestamp: number | null | undefined): string {
  return useMemo(() => {
    if (timestamp == null) return ''
    return formatDate(timestamp)
  }, [timestamp])
}

/**
 * Hook for formatting duration with memoization.
 */
export function useFormattedDuration(seconds: number | null | undefined): string {
  return useMemo(() => {
    if (seconds == null) return ''
    return formatDuration(seconds)
  }, [seconds])
}
