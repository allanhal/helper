import { useState, useCallback, useRef } from 'react'
import { useI18n } from '../i18n'

export function useTranscription() {
  const { s } = useI18n()
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queueRef = useRef<Float32Array[]>([])
  const processingRef = useRef(false)

  const enqueueChunk = useCallback((chunk: Float32Array, onResult: (results: TranscribeResult[]) => void) => {
    queueRef.current.push(chunk)
    if (processingRef.current) return
    processingRef.current = true
    setError(null)

    ;(async () => {
      while (queueRef.current.length > 0 && processingRef.current) {
        setIsTranscribing(true)
        const c = queueRef.current.shift()!
        try {
          const results = await window.electronAPI.transcribe(c)
          onResult(results)
        } catch (err: any) {
          const message = err.message || s.err_transcription_failed
          window.electronAPI.log('error', 'Transcription error', message)
          setError(message)
        } finally {
          if (queueRef.current.length === 0) {
            setIsTranscribing(false)
            processingRef.current = false
          }
        }
      }
    })()
  }, [s.err_transcription_failed])

  const cancelTranscription = useCallback(() => {
    queueRef.current = []
    processingRef.current = false
    setIsTranscribing(false)
    setError(null)
  }, [])

  return {
    enqueueChunk,
    cancelTranscription,
    isTranscribing,
    error,
  }
}
