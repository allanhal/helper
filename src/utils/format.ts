/**
 * Formatting utilities for bytes, counts, and sizes.
 */

/**
 * Format megabytes to human-readable string.
 * Converts to GB when >= 1000 MB.
 */
export function formatMb(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`
}

/**
 * Format bytes to human-readable string.
 * Shows GB when >= 1 GB, otherwise MB.
 */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`
}

/**
 * Format a count with K/M suffixes.
 * 1_000_000 -> 1.0M, 1_000 -> 1.0k
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
