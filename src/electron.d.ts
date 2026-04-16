declare global {
  const __APP_VERSION__: string
  interface TranscribeResult {
    model: string
    text: string
    language?: string
  }

  interface ModelInfo {
    name: string
    label: string
    sizeMb: number
    ramMb: number
    stars: number
    source?: 'local'
    exists: boolean
    downloading: boolean
    active: boolean
    selected: boolean
  }

  interface SystemStats {
    freeMb: number
    totalMb: number
    processMb: number
    cpuCount: number
  }

  /** ModelInfo extended with transient UI-only download state */
  interface ModelState extends ModelInfo {
    downloadPct?: number
    downloadError?: string
  }

  interface DownloadProgress {
    model: string
    pct: number       // 0–100, -1 = error
    mb?: number
    totalMb?: number
    /** Exact bytes received so far (added for fine-grained speed/ETA UI). */
    bytesDownloaded?: number
    /** Exact total bytes from Content-Length (0 if unknown). */
    totalBytes?: number
    done?: boolean
    error?: string
  }

  interface ModelDownloadComplete {
    model: string
    ok: boolean
    error?: string
  }

  interface QuestionContext {
    has_question: boolean
    question: string
    last_updated_at: number
  }

  interface AnswerContext {
    question: string
    answer: string
    confidence: number
    last_updated_at: number
  }

  type ThreadId = 'question' | 'answer'

  interface ThreadStatus {
    id: ThreadId
    label: string
    running: boolean
    last_ran_at: number | null
    last_duration_ms: number | null
    error: string | null
    trigger_chars: number
    chars_since_last: number
    model: string
    call_count: number
    input_tokens: number
    output_tokens: number
    last_prompt_chars: number
    last_response_chars: number
  }

  interface StoredActionItem {
    id: number
    task: string
    owner: string | null
    deadline: string | null
    done: boolean
  }

  interface StoredSession {
    id: string
    started_at: number
    ended_at: number | null
    summary: string
    chunk_count: number
    topics: string[]
    action_items: StoredActionItem[]
    key_decisions: string[]
  }

  interface ElectronAPI {
    // Audio
    getDesktopSourceId: () => Promise<string | null>
    transcribe: (samples: Float32Array) => Promise<TranscribeResult[]>
    mergeTranscripts: (results: TranscribeResult[]) => Promise<{ ok: boolean; reason?: string }>
    saveFile: (content: string) => Promise<boolean>
    openScreenRecordingSettings: () => Promise<void>
    getPermissionStatus: () => Promise<{ mic: string; screen: string }>
    // Logging
    log: (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => Promise<void>
    getLogPath: () => Promise<string>
    // Model management
    getAllModels: () => Promise<ModelInfo[]>
    setActiveModel: (name: string) => Promise<{ ok: boolean; reason?: string }>
    toggleModelSelected: (name: string) => Promise<{ ok: boolean; reason?: string }>
    downloadModel: (name: string) => Promise<{ ok: boolean; alreadyExists?: boolean; reason?: string }>
    deleteModel: (name: string) => Promise<{ ok: boolean; reason?: string }>
    importModelFile: (srcPath: string) => Promise<{ ok: boolean; name?: string; reason?: string }>
    ensureDefaultModel: () => Promise<{ present: boolean; model: string }>
    // System stats
    getSystemStats: () => Promise<SystemStats>
    onSystemStats: (cb: (s: SystemStats) => void) => () => void
    // Ollama model config
    getOllamaModel: () => Promise<string>
    setOllamaModel: (model: string) => Promise<{ ok: boolean }>
    getOllamaModels: () => Promise<Array<{ name: string; size: number }>>
    pullOllamaModel: (name: string) => Promise<{ ok: boolean; reason?: string }>
    // Push events
    onDownloadProgress: (cb: (p: DownloadProgress) => void) => () => void
    onModelDownloadComplete: (cb: (p: ModelDownloadComplete) => void) => () => void
    onMergeChunk: (cb: (text: string) => void) => () => void
    onMergeDone: (cb: (result: { ok: boolean; reason?: string }) => void) => () => void
    // Live Understanding
    startUnderstandingSession: (model?: string) => Promise<{ ok: boolean }>
    stopUnderstandingSession: () => Promise<{ ok: boolean }>
    pushTranscriptChunk: (text: string) => Promise<{ ok: boolean }>
    clearUnderstanding: () => Promise<{ ok: boolean }>
    resumeUnderstandingSession: () => Promise<{ ok: boolean }>
    pauseUnderstandingSession: () => Promise<{ ok: boolean }>
    onQuestionDetected:  (cb: (ctx: QuestionContext | null) => void) => () => void
    onAnswerGenerated:   (cb: (ctx: AnswerContext | null) => void) => () => void
    onThreadsStatus:     (cb: (statuses: ThreadStatus[]) => void) => () => void
    // Sessions DB
    dbGetSessions: (topicFilter?: string) => Promise<StoredSession[]>
    dbGetSession: (id: string) => Promise<StoredSession | null>
    dbDeleteSession: (id: string) => Promise<{ ok: boolean }>
    dbGetTopics: () => Promise<Array<{ name: string; count: number }>>
    dbUpdateActionDone: (id: number, done: boolean) => Promise<{ ok: boolean }>
  }

  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
