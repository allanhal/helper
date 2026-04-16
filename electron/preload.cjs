const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info (synchronous, no IPC needed)
  platform: process.platform,
  // Audio
  getDesktopSourceId: () => ipcRenderer.invoke('get-desktop-source-id'),
  transcribe: (samples) => ipcRenderer.invoke('transcribe', samples),
  mergeTranscripts: (results) => ipcRenderer.invoke('merge-transcripts', results),
  saveFile: (content) => ipcRenderer.invoke('save-file', content),
  openScreenRecordingSettings: () => ipcRenderer.invoke('open-screen-recording-settings'),
  getPermissionStatus: () => ipcRenderer.invoke('get-permission-status'),
  // Logging
  log: (level, message, data) => ipcRenderer.invoke('log', level, message, data),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  // Model management
  getAllModels: () => ipcRenderer.invoke('get-all-models'),
  setActiveModel: (name) => ipcRenderer.invoke('set-active-model', name),
  downloadModel: (name) => ipcRenderer.invoke('download-model', name),
  deleteModel: (name) => ipcRenderer.invoke('delete-model', name),
  importModelFile: (srcPath) => ipcRenderer.invoke('import-model-file', srcPath),
  ensureDefaultModel: () => ipcRenderer.invoke('ensure-default-model'),
  // Model selection
  toggleModelSelected: (name) => ipcRenderer.invoke('toggle-model-selected', name),
  // System stats
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  onSystemStats: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('system-stats', handler)
    return () => ipcRenderer.removeListener('system-stats', handler)
  },
  // Ollama model config
  getOllamaModel: () => ipcRenderer.invoke('get-ollama-model'),
  setOllamaModel: (model) => ipcRenderer.invoke('set-ollama-model', model),
  getOllamaModels: () => ipcRenderer.invoke('get-ollama-models'),
  pullOllamaModel: (name) => ipcRenderer.invoke('pull-ollama-model', name),
  // Push events
  onDownloadProgress: (cb) => {
    const handler = (_e, p) => cb(p)
    ipcRenderer.on('model-download-progress', handler)
    return () => ipcRenderer.removeListener('model-download-progress', handler)
  },
  onModelDownloadComplete: (cb) => {
    const handler = (_e, p) => cb(p)
    ipcRenderer.on('model-download-complete', handler)
    return () => ipcRenderer.removeListener('model-download-complete', handler)
  },
  onMergeChunk: (cb) => {
    const handler = (_e, text) => cb(text)
    ipcRenderer.on('merge-chunk', handler)
    return () => ipcRenderer.removeListener('merge-chunk', handler)
  },
  onMergeDone: (cb) => {
    const handler = (_e, result) => cb(result)
    ipcRenderer.on('merge-done', handler)
    return () => ipcRenderer.removeListener('merge-done', handler)
  },
  // Live Understanding
  startUnderstandingSession: (model) => ipcRenderer.invoke('start-understanding-session', model),
  stopUnderstandingSession: () => ipcRenderer.invoke('stop-understanding-session'),
  pushTranscriptChunk: (text) => ipcRenderer.invoke('push-transcript-chunk', text),
  clearUnderstanding: () => ipcRenderer.invoke('clear-understanding'),
  resumeUnderstandingSession: () => ipcRenderer.invoke('resume-understanding-session'),
  pauseUnderstandingSession: () => ipcRenderer.invoke('pause-understanding-session'),
  onQuestionDetected: (cb) => {
    const handler = (_e, ctx) => cb(ctx)
    ipcRenderer.on('understanding-question', handler)
    return () => ipcRenderer.removeListener('understanding-question', handler)
  },
  onAnswerGenerated: (cb) => {
    const handler = (_e, ctx) => cb(ctx)
    ipcRenderer.on('understanding-answer', handler)
    return () => ipcRenderer.removeListener('understanding-answer', handler)
  },
  onThreadsStatus: (cb) => {
    const handler = (_e, statuses) => cb(statuses)
    ipcRenderer.on('threads-status', handler)
    return () => ipcRenderer.removeListener('threads-status', handler)
  },
  // Sessions DB
  dbGetSessions: (topicFilter) => ipcRenderer.invoke('db:getSessions', topicFilter),
  dbGetSession: (id) => ipcRenderer.invoke('db:getSession', id),
  dbDeleteSession: (id) => ipcRenderer.invoke('db:deleteSession', id),
  dbGetTopics: () => ipcRenderer.invoke('db:getTopics'),
  dbUpdateActionDone: (id, done) => ipcRenderer.invoke('db:updateActionDone', id, done),
})
