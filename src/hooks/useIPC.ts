import { useCallback, useEffect } from 'react'

/**
 * Hook to safely call Electron IPC methods with consistent error handling.
 * @returns Functions for invoking IPC calls that throw errors instead of swallowing them.
 */
export function useIPC() {
  const invoke = useCallback(async <T = unknown>(method: string, ...args: unknown[]): Promise<T> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (window.electronAPI as any)[method](...args)
    return result as T
  }, [])

  const invokeStrict = useCallback(async <T = unknown>(method: string, ...args: unknown[]): Promise<T> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (window.electronAPI as any)[method](...args)
      return result as T
    } catch (err) {
      console.error(`IPC error (${method}):`, err)
      throw err
    }
  }, [])

  return { invoke, invokeStrict }
}

/**
 * Hook for subscribing to Electron IPC events with automatic cleanup.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSubscription<T extends (...args: any[]) => any>(channel: string, handler: T): () => void {
  const wrappedHandler = useCallback((...args: Parameters<T>) => {
    handler(...args)
  }, [handler])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (window.electronAPI as any)[channel](wrappedHandler)
    return () => unsubscribe()
  }, [channel, wrappedHandler])

  return wrappedHandler
}
