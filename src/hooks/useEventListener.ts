import { useEffect, useCallback } from 'react'

/**
 * Hook for adding event listeners with automatic cleanup.
 */
export function useEventListener<T extends Event = Event>(
  target: Window | Document | HTMLElement,
  type: string,
  handler: (event: T) => void,
  options?: boolean | AddEventListenerOptions
) {
  const boundHandler = useCallback((e: Event) => {
    handler(e as T)
  }, [handler])

  useEffect(() => {
    target.addEventListener(type, boundHandler, options)
    return () => {
      target.removeEventListener(type, boundHandler, options)
    }
  }, [target, type, boundHandler, options])
}
