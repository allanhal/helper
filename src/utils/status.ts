/**
 * Shared status definitions and utilities.
 */

export type Status = 'idle' | 'recording' | 'transcribing' | 'error'

/**
 * Get the dot color for a status (used in legacy status bar).
 */
export function getStatusDotColor(status: Status): string {
  switch (status) {
    case 'recording':
    case 'error':
      return 'var(--color-error)'
    case 'transcribing':
      return 'var(--color-warning)'
    default:
      return 'var(--text-tertiary)'
  }
}

/**
 * Check if status is error.
 */
export function isErrorStatus(status: Status): boolean {
  return status === 'error'
}

/**
 * Check if status is recording.
 */
export function isRecordingStatus(status: Status): boolean {
  return status === 'recording'
}
