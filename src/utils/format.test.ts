import { describe, expect, it } from 'vitest'
import { formatBytes, formatCount, formatMb } from './format'

describe('formatMb', () => {
  it('keeps values below 1000 in MB', () => {
    expect(formatMb(999)).toBe('999 MB')
  })

  it('converts values at or above 1000 MB to GB', () => {
    expect(formatMb(1500)).toBe('1.5 GB')
  })
})

describe('formatBytes', () => {
  it('formats sub-gigabyte values in MB', () => {
    expect(formatBytes(540_000_000)).toBe('540 MB')
  })

  it('formats gigabyte values in GB', () => {
    expect(formatBytes(2_400_000_000)).toBe('2.4 GB')
  })
})

describe('formatCount', () => {
  it('keeps small counts unchanged', () => {
    expect(formatCount(42)).toBe('42')
  })

  it('formats thousands with a k suffix', () => {
    expect(formatCount(1_250)).toBe('1.3k')
  })

  it('formats millions with an M suffix', () => {
    expect(formatCount(2_500_000)).toBe('2.5M')
  })
})
