import { useState, useCallback, useEffect } from 'react'
import { useConfirm } from './useConfirm'
import { useI18n } from '../i18n'

export function useModels() {
  const { s } = useI18n()
  const [models, setModels] = useState<ModelState[]>([])
  const [error, setError] = useState<string | null>(null)
  const { confirmDelete } = useConfirm()

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.getAllModels()
      setError(null)
      setModels((prev) =>
        list.map((m): ModelState => {
          const existing = prev.find((p) => p.name === m.name)
          return { ...m, downloadPct: existing?.downloadPct, downloadError: existing?.downloadError }
        })
      )
    } catch (err) {
      console.error('Failed to load models:', err)
      setError(s.err_whisper_models_load)
    }
  }, [s.err_whisper_models_load])

  useEffect(() => {
    void refresh()
    const unsub = window.electronAPI.onDownloadProgress((p) => {
      setModels((prev) => {
        const isKnownModel = prev.some((m) => m.name === p.model)
        if (!isKnownModel) return prev
        return prev.map((m): ModelState => {
          if (m.name !== p.model) return m
          if (p.done) return { ...m, exists: true, downloadPct: undefined, downloadError: undefined }
          if (p.pct === -1) return { ...m, downloadPct: undefined, downloadError: p.error }
          return { ...m, downloadPct: p.pct }
        })
      })
      if (p.done) void refresh()
    })
    return unsub
  }, [refresh])

  const download = useCallback(async (name: string) => {
    setModels((prev) => prev.map((m) => m.name === name ? { ...m, downloadPct: 0 } : m))
    await window.electronAPI.downloadModel(name).catch(console.error)
  }, [])

  const remove = useCallback(async (name: string) => {
    if (!confirmDelete(`"${name}" model file`)) return
    const res = await window.electronAPI.deleteModel(name)
    if (res.ok) void refresh()
  }, [confirmDelete, refresh])

  const toggleSelected = useCallback(async (name: string) => {
    await window.electronAPI.toggleModelSelected(name)
    void refresh()
  }, [refresh])

  return { models, error, refresh, download, remove, toggleSelected }
}
