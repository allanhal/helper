import { useState, useCallback, useEffect, useRef } from 'react'
import { useI18n } from '../i18n'

const TARGET_SAMPLE_RATE = 16000
const CHUNK_DURATION_SECONDS = 3
const REQUIRED_SAMPLES = TARGET_SAMPLE_RATE * CHUNK_DURATION_SECONDS
// Chunks with RMS below this threshold are treated as silence and skipped.
// 0.015 catches ambient noise (fan hum, HVAC) that 0.01 would let through,
// while still capturing quiet speech.
const SILENCE_THRESHOLD = 0.015
// High-pass filter cutoff (~80Hz) — removes low-frequency hum/rumble
const HP_ALPHA = 0.995
const AUDIO_DEBUG = import.meta.env.VITE_AUDIO_DEBUG === '1'
const AUDIO_DEBUG_FLUSH_INTERVAL = 32

export interface AudioDevice {
  deviceId: string
  label: string
  type: 'system' | 'input'
}

interface AudioDebugStats {
  processedBuffers: number
  emittedChunks: number
  skippedSilentChunks: number
  rmsSum: number
  maxRms: number
}

const EMPTY_AUDIO_DEBUG_STATS: AudioDebugStats = {
  processedBuffers: 0,
  emittedChunks: 0,
  skippedSilentChunks: 0,
  rmsSum: 0,
  maxRms: 0,
}

export function useAudioCapture(onChunk: (chunk: Float32Array) => void) {
  const { s } = useI18n()
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [micMuted, setMicMuted] = useState(false)
  const [speakerMuted, setSpeakerMuted] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const systemStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const accumulationRef = useRef<Float32Array[]>([])

  const audioDebugStatsRef = useRef<AudioDebugStats>({ ...EMPTY_AUDIO_DEBUG_STATS })
  const smoothedLevelRef = useRef(0)
  const hpPrevInputRef = useRef(0)
  const hpPrevOutputRef = useRef(0)

  const flushAudioDebugStats = useCallback((reason: 'interval' | 'stop') => {
    if (!AUDIO_DEBUG) return

    const stats = audioDebugStatsRef.current
    if (stats.processedBuffers === 0 && stats.emittedChunks === 0 && stats.skippedSilentChunks === 0) return

    window.electronAPI.log('info', 'Audio debug summary', {
      reason,
      processedBuffers: stats.processedBuffers,
      emittedChunks: stats.emittedChunks,
      skippedSilentChunks: stats.skippedSilentChunks,
      avgRms: stats.processedBuffers > 0 ? (stats.rmsSum / stats.processedBuffers).toFixed(6) : '0.000000',
      maxRms: stats.maxRms.toFixed(6),
    })

    audioDebugStatsRef.current = { ...EMPTY_AUDIO_DEBUG_STATS }
  }, [])

  const processAudio = useCallback(
    (inputData: Float32Array) => {
      // High-pass filter: y[n] = α * (y[n-1] + x[n] - x[n-1])
      const filtered = new Float32Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        filtered[i] = HP_ALPHA * (hpPrevOutputRef.current + inputData[i] - hpPrevInputRef.current)
        hpPrevInputRef.current = inputData[i]
        hpPrevOutputRef.current = filtered[i]
      }

      // Compute RMS on filtered audio
      let sum = 0
      for (let i = 0; i < filtered.length; i++) sum += filtered[i] * filtered[i]
      const rms = Math.sqrt(sum / filtered.length)

      // Update audio level meter (smoothed)
      const target = Math.min(1, rms * 6)
      smoothedLevelRef.current = target > smoothedLevelRef.current
        ? target * 0.8 + smoothedLevelRef.current * 0.2
        : target * 0.1 + smoothedLevelRef.current * 0.9
      setAudioLevel(smoothedLevelRef.current)

      if (AUDIO_DEBUG) {
        const stats = audioDebugStatsRef.current
        stats.processedBuffers++
        stats.rmsSum += rms
        stats.maxRms = Math.max(stats.maxRms, rms)
        if (stats.processedBuffers % AUDIO_DEBUG_FLUSH_INTERVAL === 0) {
          flushAudioDebugStats('interval')
        }
      }

      accumulationRef.current.push(filtered)
      let total = 0
      for (const arr of accumulationRef.current) total += arr.length

      while (total >= REQUIRED_SAMPLES) {
        const chunk = new Float32Array(REQUIRED_SAMPLES)
        let copied = 0
        const idx = 0
        while (copied < REQUIRED_SAMPLES) {
          const arr = accumulationRef.current[idx]
          const remaining = REQUIRED_SAMPLES - copied
          if (arr.length <= remaining) {
            chunk.set(arr, copied)
            copied += arr.length
            accumulationRef.current.splice(idx, 1)
          } else {
            chunk.set(arr.subarray(0, remaining), copied)
            accumulationRef.current[idx] = arr.subarray(remaining)
            copied += remaining
            break
          }
        }
        total -= REQUIRED_SAMPLES

        // Skip chunk if it's mostly silence — avoids Whisper hallucinations
        let chunkSum = 0
        for (let i = 0; i < chunk.length; i++) chunkSum += chunk[i] * chunk[i]
        const chunkRms = Math.sqrt(chunkSum / chunk.length)
        if (chunkRms >= SILENCE_THRESHOLD) {
          if (AUDIO_DEBUG) audioDebugStatsRef.current.emittedChunks++
          onChunk(chunk)
        } else {
          if (AUDIO_DEBUG) audioDebugStatsRef.current.skippedSilentChunks++
        }
      }
    },
    [flushAudioDebugStats, onChunk]
  )

  const start = useCallback(async () => {
    setError(null)
    audioDebugStatsRef.current = { ...EMPTY_AUDIO_DEBUG_STATS }

    try {
      const audioContext = new window.AudioContext({
        sampleRate: TARGET_SAMPLE_RATE,
      })
      audioContextRef.current = audioContext

      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      // Silent gain — ScriptProcessorNode requires destination connection to fire
      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(audioContext.destination)

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        processAudio(event.inputBuffer.getChannelData(0))
      }

      // --- System audio (speaker output) ---
      try {
        const sourceId = await window.electronAPI.getDesktopSourceId()
        const sysStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
            },
          } as any,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
            },
          } as any,
        })
        sysStream.getVideoTracks().forEach(t => t.stop())
        // Apply current mute state
        sysStream.getAudioTracks().forEach(t => { t.enabled = !speakerMuted })
        systemStreamRef.current = sysStream
        const sysSource = audioContext.createMediaStreamSource(sysStream)
        sysSource.connect(processor)
        window.electronAPI.log('info', 'System audio stream started')
      } catch (err: any) {
        window.electronAPI.log('warn', 'System audio unavailable: ' + err.message)
        if (err.message?.includes('SCREEN_PERMISSION_REQUIRED')) {
          window.electronAPI.log('info', 'Opening Screen Recording settings for user')
          window.electronAPI.openScreenRecordingSettings()
        }
      }

      // --- Microphone ---
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        })
        // Apply current mute state
        micStream.getAudioTracks().forEach(t => { t.enabled = !micMuted })
        micStreamRef.current = micStream
        const micSource = audioContext.createMediaStreamSource(micStream)
        micSource.connect(processor)
        const tracks = micStream.getAudioTracks()
        const label = tracks[0]?.label ?? 'unknown'
        const settings = tracks[0]?.getSettings()
        window.electronAPI.log('info', `Mic stream started: "${label}" sampleRate=${settings?.sampleRate} channelCount=${settings?.channelCount}`)
      } catch (err: any) {
        window.electronAPI.log('error', 'Mic unavailable: ' + err.message)
      }

      const hasSys = !!systemStreamRef.current
      const hasMic = !!micStreamRef.current
      window.electronAPI.log('info', `Audio sources: system=${hasSys} mic=${hasMic}`)

      if (!hasSys && !hasMic) {
        throw new Error(s.err_no_audio_sources)
      }

      setIsRecording(true)
      window.electronAPI.log('info', 'Recording started')
    } catch (err: any) {
      const message = err.message || s.err_audio_capture_start
      window.electronAPI.log('error', 'Audio capture failed', message)
      setError(message)
      throw err
    }
  }, [processAudio, micMuted, speakerMuted, s.err_audio_capture_start, s.err_no_audio_sources])

  const stop = useCallback(() => {
    flushAudioDebugStats('stop')
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(t => t.stop())
      systemStreamRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    accumulationRef.current = []
    setAudioLevel(0)
    setIsRecording(false)
  }, [flushAudioDebugStats])

  const toggleMicMute = useCallback(() => {
    setMicMuted(prev => {
      const next = !prev
      micStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next })
      return next
    })
  }, [])

  const toggleSpeakerMute = useCallback(() => {
    setSpeakerMuted(prev => {
      const next = !prev
      systemStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next })
      return next
    })
  }, [])

  useEffect(() => {
    return () => { stop() }
  }, [stop])

  return {
    start,
    stop,
    isRecording,
    error,
    audioLevel,
    micMuted,
    speakerMuted,
    toggleMicMute,
    toggleSpeakerMute,
    // kept for compatibility, no longer used by UI
    audioDevices: [] as AudioDevice[],
    selectedDeviceId: '__system__',
    setSelectedDeviceId: () => {},
  }
}
