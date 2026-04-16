import { useState, useEffect, useCallback } from 'react'
import { useIPC } from './useIPC'
import { useI18n } from '../i18n'

/**
 * Hook for managing Ollama model configuration and list.
 * Consolidates duplicated getOllamaModel/getOllamaModels patterns.
 */
export function useOllama() {
  const { invokeStrict } = useIPC()
  const { s } = useI18n()
  
  const [model, setModel] = useState<string>('')
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [list, current] = await Promise.all([
        invokeStrict<Array<{ name: string; size: number }>>('getOllamaModels'),
        invokeStrict<string>('getOllamaModel'),
      ])
      setModels(list)
      setModel(current)
      setError(null)
    } catch (err) {
      console.error('Failed to load Ollama models:', err)
      setModels([])
      setError(s.err_ollama_models_load)
    } finally {
      setLoading(false)
    }
  }, [invokeStrict, s.err_ollama_models_load])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setCurrent = useCallback(async (name: string) => {
    try {
      const result = await invokeStrict<{ ok: boolean; reason?: string }>('setOllamaModel', name)
      if (!result?.ok) {
        throw new Error(result?.reason ?? s.err_ollama_model_set)
      }
      setModel(name)
    } catch (err) {
      console.error('Failed to set Ollama model:', err)
      throw err
    }
  }, [invokeStrict, s.err_ollama_model_set])

  return {
    model,
    models,
    loading,
    error,
    refresh,
    setCurrent,
  }
}
