import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStorage } from './useStorage'

describe('useStorage', () => {
  it('returns the default value when storage is empty', () => {
    const { result } = renderHook(() => useStorage('font-size', 13))

    expect(result.current[0]).toBe(13)
    expect(localStorage.getItem('font-size')).toBe('13')
  })

  it('hydrates from localStorage when valid JSON exists', () => {
    localStorage.setItem('theme', JSON.stringify('dark'))

    const { result } = renderHook(() => useStorage('theme', 'light'))

    expect(result.current[0]).toBe('dark')
  })

  it('falls back to the default value when stored JSON is invalid', () => {
    localStorage.setItem('counter', '{oops')

    const { result } = renderHook(() => useStorage('counter', 5))

    expect(result.current[0]).toBe(5)
  })

  it('persists direct updates to localStorage', () => {
    const { result } = renderHook(() => useStorage('counter', 1))

    act(() => {
      result.current[1](7)
    })

    expect(result.current[0]).toBe(7)
    expect(localStorage.getItem('counter')).toBe('7')
  })

  it('persists functional updates to localStorage', () => {
    const { result } = renderHook(() => useStorage('counter', 1))

    act(() => {
      result.current[1]((prev) => prev + 2)
    })

    expect(result.current[0]).toBe(3)
    expect(localStorage.getItem('counter')).toBe('3')
  })
})
