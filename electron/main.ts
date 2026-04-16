import { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences, session, dialog, shell, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { spawn, ChildProcess, execFile } from 'child_process'
import fs from 'fs'
import https from 'https'
import http from 'http'
import os from 'os'
import { IPC_GET_DESKTOP_SOURCE_ID, IPC_TRANSCRIBE, IPC_SAVE_FILE } from './ipc-channels.js'
import { logger } from './logger.js'

// Validate model name: alphanumeric plus common Ollama separators such as
// dots, colons, dashes, underscores, and slashes for namespaced models.
function isValidModelName(name: string): boolean {
  return /^[a-zA-Z0-9.:_\-/]+$/.test(name)
}

// ---------------------------------------------------------------------------
// Ollama auto-start helpers
// ---------------------------------------------------------------------------

let ollamaProcess:     ChildProcess | null = null
let ollamaFastProcess: ChildProcess | null = null

const OLLAMA_FAST_PORT = 11435

function checkOllamaRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get('http://localhost:11434', (res) => {
      resolve(res.statusCode !== undefined)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => { req.destroy(); resolve(false) })
  })
}

function checkOllamaFastRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${OLLAMA_FAST_PORT}`, (res) => {
      resolve(res.statusCode !== undefined)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => { req.destroy(); resolve(false) })
  })
}

async function waitForOllama(attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await checkOllamaRunning()) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function waitForOllamaFast(attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await checkOllamaFastRunning()) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function ensureOllama(): Promise<boolean> {
  if (await checkOllamaRunning()) return true
  try {
    ollamaProcess = spawn('ollama', ['serve'], {
      detached: false,
      stdio: 'ignore',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    })
    ollamaProcess.on('error', () => { ollamaProcess = null })
    return await waitForOllama()
  } catch {
    return false
  }
}

// Kill whatever process is listening on OLLAMA_FAST_PORT (handles both
// self-spawned and externally-started instances).
async function stopOllamaFast(): Promise<void> {
  if (ollamaFastProcess) {
    ollamaFastProcess.kill()
    ollamaFastProcess = null
  }
  // Kill the process listening on the port (server only, not clients)
  await new Promise<void>(resolve => {
    execFile('lsof', ['-ti', `tcp:${OLLAMA_FAST_PORT}`, '-sTCP:LISTEN'], (err, stdout) => {
      if (err || !stdout.trim()) return resolve()
      const pids = stdout.trim().split('\n').filter(Boolean)
      for (const pid of pids) {
        const n = parseInt(pid, 10)
        if (!isNaN(n) && n !== process.pid) {
          try { process.kill(n, 'SIGTERM') } catch {}
        }
      }
      setTimeout(resolve, 600)
    })
  })
}

// Starts a second Ollama instance on OLLAMA_FAST_PORT for the fast tier.
// No-op if already running. Returns true when ready.
async function ensureOllamaFast(): Promise<boolean> {
  if (await checkOllamaFastRunning()) return true
  try {
    ollamaFastProcess = spawn('ollama', ['serve'], {
      detached: false,
      stdio: 'ignore',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, OLLAMA_HOST: `127.0.0.1:${OLLAMA_FAST_PORT}` },
    })
    ollamaFastProcess.on('error', () => { ollamaFastProcess = null })
    ollamaFastProcess.on('exit', () => { ollamaFastProcess = null })
    return await waitForOllamaFast()
  } catch {
    return false
  }
}

// Warm up the fast model on the fast instance so it's loaded in GPU memory.
async function warmupFastModel(model: string): Promise<void> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], stream: false })
    const req = http.request(
      { hostname: 'localhost', port: OLLAMA_FAST_PORT, path: '/api/chat', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => { res.resume(); res.on('end', resolve); res.on('error', resolve) }
    )
    req.on('error', resolve)
    req.setTimeout(30_000, () => { req.destroy(); resolve() })
    req.write(body)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env from project root (dev) or app bundle root (prod)
// Precedence: existing process.env > .env file
;(function loadDotEnv() {
  const candidates = [
    path.join(__dirname, '../.env'),  // dist-electron/../.env  (dev)
    path.join(__dirname, '.env'),     // alongside main.js      (prod bundle)
  ]
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/)
      if (!match) continue
      const [, key, raw] = match
      if (process.env[key] !== undefined) continue  // don't overwrite shell env
      process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2')  // strip optional quotes
    }
    break  // stop after first .env found
  }
})()

const _require = createRequire(import.meta.url)
const whisperConstants = _require('nodejs-whisper/dist/constants.js')

// Models are stored in userData so the bundle stays read-only in packaged macOS apps.
// `app.getPath('userData')` is available synchronously once `app` is loaded.
const MODELS_DIR: string = path.join(app.getPath('userData'), 'whisper-models')
const TARGET_SAMPLE_RATE = 16000
const CONFIG_FILE = path.join(app.getPath('userData'), 'helper-config.json')

// Resolve the absolute path to the whisper-cli binary shipped with nodejs-whisper.
// Matches nodejs-whisper's own search order (see dist/whisper.js::getWhisperExecutablePath).
function resolveWhisperCliPath(): string {
  const execName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const candidates: string[] = []

  if (!isDev) {
    // Packaged app: extraResources lands at Contents/Resources/whisper/
    candidates.push(path.join(process.resourcesPath, 'whisper', execName))
  }

  // Dev mode: use nodejs-whisper's compiled binary
  const base: string = whisperConstants.WHISPER_CPP_PATH
  candidates.push(
    path.join(base, 'build', 'bin', execName),
    path.join(base, 'build', 'bin', 'Release', execName),
    path.join(base, 'build', 'bin', 'Debug', execName),
    path.join(base, 'build', execName),
    path.join(base, execName),
  )

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  logger.error('whisper-cli not found in candidates', candidates)
  return ''
}

// Run whisper-cli directly with an absolute --model path so models can live outside
// the app bundle (required for packaged/signed macOS apps where the bundle is read-only).
function runWhisperCli(args: {
  audioPath: string
  modelPath: string
  language: string
  outputJson: boolean
  outputText: boolean
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const exe = resolveWhisperCliPath()
    if (!exe) {
      reject(new Error('whisper-cli executable not found'))
      return
    }
    const cliArgs: string[] = ['-m', args.modelPath, '-f', args.audioPath, '-l', args.language || 'auto']
    if (args.outputText) cliArgs.push('-otxt')
    if (args.outputJson) cliArgs.push('-oj')
    const child = spawn(exe, cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        if (stdout.includes('error:')) reject(new Error('whisper.cpp error:\n' + stdout))
        else resolve(stdout)
      } else {
        reject(new Error(stderr || `whisper-cli exited with code ${code}`))
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelMeta {
  name: string
  label: string
  sizeMb: number
  stars: number
  ramMb: number
}

interface ModelInfo extends ModelMeta {
  exists: boolean
  downloading: boolean
  active: boolean
  selected: boolean
}

interface AppConfig {
  activeModel: string
  selectedModels: string[]
  ollamaModel: string
  fastOllamaModel: string
}

interface OllamaTag {
  name?: string
  size?: number
}

interface OllamaTagsResponse {
  models?: OllamaTag[]
}

// ---------------------------------------------------------------------------
// Known models
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'large-v3-turbo'

const KNOWN_MODELS: ModelMeta[] = [
  { name: 'large-v3-turbo', label: 'Large v3 Turbo', sizeMb: 1500, stars: 5, ramMb: 2600 },
]

const MODEL_URL = (name: string) =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`

const modelFile = (name: string) => path.join(MODELS_DIR, `ggml-${name}.bin`)

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null
const downloadingModels = new Set<string>()
let statsIntervalId: ReturnType<typeof setInterval> | null = null

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    return {
      activeModel: raw.activeModel ?? DEFAULT_MODEL,
      selectedModels: Array.isArray(raw.selectedModels) ? raw.selectedModels : [raw.activeModel ?? DEFAULT_MODEL],
      ollamaModel: raw.ollamaModel ?? 'qwen3:4b',
      fastOllamaModel: raw.fastOllamaModel ?? '',
    }
  } catch {
    return { activeModel: DEFAULT_MODEL, selectedModels: [DEFAULT_MODEL], ollamaModel: 'qwen3:4b', fastOllamaModel: '' }
  }
}

function saveConfig(cfg: AppConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'display-capture', 'screen'].includes(permission)
    callback(allowed)
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ['media', 'audioCapture', 'display-capture', 'screen'].includes(permission)
  })
}

function createWindow() {
  setupPermissions()
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
  const appIcon = nativeImage.createFromPath(iconPath)

  mainWindow = new BrowserWindow({
    title: 'Meeting Helper',
    width: 800,
    height: 620,
    minWidth: 600,
    minHeight: 480,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
  })

  if (app.dock) {
    app.dock.setIcon(appIcon)
  }

  // --- Security: Content Security Policy ---
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:5173 http://localhost:5173; img-src 'self' data:; font-src 'self' data:"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  // --- Security: Prevent navigation away from app ---
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isDev && url.startsWith('http://localhost:5173')) return
    e.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' as const }))

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    stopStatsInterval()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    startStatsInterval()
  })
}

// ---------------------------------------------------------------------------
// System stats
// ---------------------------------------------------------------------------

function getSystemStats() {
  const totalMb   = Math.round(os.totalmem() / 1024 / 1024)
  const processMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
  const cpuCount  = os.cpus().length

  let freeMb = Math.round(os.freemem() / 1024 / 1024)

  // On macOS, os.freemem() only counts truly-free pages. Activity Monitor's
  // "Free" also includes speculative pages. Parse vm_stat to get a consistent number.
  if (process.platform === 'darwin') {
    try {
      const { execSync } = _require('child_process')
      const vmstat = execSync('vm_stat', { encoding: 'utf8', timeout: 500 }) as string
      const pageMatch = vmstat.match(/page size of (\d+) bytes/)
      const pageSize  = pageMatch ? parseInt(pageMatch[1], 10) : 16384

      const extract = (label: string): number => {
        const m = vmstat.match(new RegExp(`${label}:\\s+(\\d+)`))
        return m ? parseInt(m[1], 10) : 0
      }

      const freePages        = extract('Pages free')
      const speculativePages = extract('Pages speculative')
      // free + speculative matches Activity Monitor's "Free" column
      freeMb = Math.round((freePages + speculativePages) * pageSize / 1024 / 1024)
    } catch { /* fall through to os.freemem() value */ }
  }

  return { freeMb, totalMb, processMb, cpuCount }
}

function startStatsInterval() {
  stopStatsInterval()
  statsIntervalId = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-stats', getSystemStats())
    }
  }, 3000)
}

function stopStatsInterval() {
  if (statsIntervalId !== null) {
    clearInterval(statsIntervalId)
    statsIntervalId = null
  }
}

// ---------------------------------------------------------------------------
// Shared download helper
// ---------------------------------------------------------------------------

function friendlyDownloadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'ENOTFOUND' || /ENOTFOUND/.test(raw)) return 'No internet connection — check your network'
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(raw)) return 'Connection refused by huggingface.co'
  if (code === 'ECONNRESET' || /ECONNRESET/.test(raw)) return 'Connection reset — network unstable'
  if (code === 'ETIMEDOUT' || /timeout/i.test(raw)) return 'Download timed out — try again'
  if (code === 'ENOSPC') return 'Not enough disk space'
  if (code === 'EACCES' || code === 'EPERM') return 'Permission denied writing model file'
  if (code === 'ENOENT' && /models/.test(raw)) return 'Models directory missing — reinstall whisper.cpp'
  const http = raw.match(/^HTTP (\d+)/)
  if (http) {
    const status = http[1]
    if (status === '404') return 'Model file not found on huggingface.co (HTTP 404)'
    if (status === '403') return 'Access forbidden by huggingface.co (HTTP 403)'
    if (status.startsWith('5')) return `huggingface.co server error (HTTP ${status}) — try again later`
    return `Download failed (HTTP ${status})`
  }
  return raw || 'Download failed — unknown error'
}

function downloadFileWithProgress(
  url: string,
  dest: string,
  modelKey: string,
  headers?: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
    } catch (err) {
      const msg = friendlyDownloadError(err)
      mainWindow?.webContents.send('model-download-progress', { model: modelKey, pct: -1, error: msg })
      reject(new Error(msg))
      return
    }

    const fail = (err: unknown) => {
      const msg = friendlyDownloadError(err)
      mainWindow?.webContents.send('model-download-progress', { model: modelKey, pct: -1, error: msg })
      reject(err instanceof Error ? err : new Error(msg))
    }

    const tmp = dest + '.download'
    let resumeFrom = 0
    try {
      if (fs.existsSync(tmp)) resumeFrom = fs.statSync(tmp).size
    } catch { /* treat as fresh */ }

    const followRedirects = (u: string, hops = 0) => {
      if (hops > 10) {
        fail(new Error('Too many redirects'))
        return
      }
      const mod = u.startsWith('https') ? https : http
      const reqHeaders: Record<string, string> = { ...(headers ?? {}) }
      if (resumeFrom > 0) reqHeaders['Range'] = `bytes=${resumeFrom}-`
      const req = mod.get(u, { headers: reqHeaders }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode!)) {
          followRedirects(res.headers.location!, hops + 1)
          return
        }
        const status = res.statusCode ?? 0
        // 200 = server ignored Range → must restart from 0.
        // 206 = partial content → append.
        // 416 = Range not satisfiable → stale/complete partial, wipe & retry fresh.
        if (status === 416) {
          try { fs.unlinkSync(tmp) } catch { /* ignore */ }
          resumeFrom = 0
          res.resume()
          followRedirects(u, hops)
          return
        }
        if (status !== 200 && status !== 206) {
          fail(new Error(`HTTP ${status}`))
          return
        }

        const contentLength = parseInt(res.headers['content-length'] || '0', 10)
        let total = 0
        let appending = false

        if (status === 206) {
          appending = true
          // Content-Range: bytes START-END/TOTAL
          const cr = res.headers['content-range']
          const m = typeof cr === 'string' ? cr.match(/\/(\d+)\s*$/) : null
          total = m ? parseInt(m[1], 10) : (resumeFrom + contentLength)
        } else {
          // 200 — server ignored Range, start over
          appending = false
          resumeFrom = 0
          total = contentLength
        }

        let received = resumeFrom
        const stream = fs.createWriteStream(tmp, appending ? { flags: 'a' } : { flags: 'w' })

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          stream.write(chunk)
          const pct = total ? Math.round((received / total) * 100) : 0
          mainWindow?.webContents.send('model-download-progress', {
            model: modelKey,
            pct,
            mb: Math.round(received / 1024 / 1024),
            totalMb: total ? Math.round(total / 1024 / 1024) : 1500,
            bytesDownloaded: received,
            totalBytes: total || 0,
          })
        })

        res.on('end', () => {
          stream.end(() => {
            try {
              fs.renameSync(tmp, dest)
            } catch (err) {
              fail(err)
              return
            }
            mainWindow?.webContents.send('model-download-progress', {
              model: modelKey, pct: 100, done: true,
            })
            resolve()
          })
        })

        stream.on('error', (err) => {
          // Keep partial file on disk so user can resume next launch.
          fail(err)
        })

        res.on('error', (err) => {
          stream.destroy()
          // Keep partial file — allows resume on next launch.
          fail(err)
        })
      })

      req.setTimeout(60_000, () => {
        req.destroy(new Error('Download request timeout'))
      })

      req.on('error', (err) => {
        fail(err)
      })
    }

    mainWindow?.webContents.send('model-download-progress', {
      model: modelKey, pct: 0, mb: Math.round(resumeFrom / 1024 / 1024), totalMb: 1500,
      bytesDownloaded: resumeFrom, totalBytes: 0,
    })
    followRedirects(url)
  })
}

// ---------------------------------------------------------------------------
// Whisper model download
// ---------------------------------------------------------------------------

const inFlightDownloads = new Map<string, Promise<void>>()

function downloadModelByName(name: string): Promise<void> {
  const existing = inFlightDownloads.get(name)
  if (existing) return existing
  downloadingModels.add(name)
  const url = MODEL_URL(name)
  const dest = modelFile(name)
  logger.info('Downloading model', { name, url })
  const p = downloadFileWithProgress(url, dest, name)
    .then(() => {
      logger.info('Model downloaded', { name, dest })
    })
    .catch((err) => {
      logger.error('Model download failed', { name, err })
      throw err
    })
    .finally(() => {
      downloadingModels.delete(name)
      inFlightDownloads.delete(name)
    })
  inFlightDownloads.set(name, p)
  return p
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  logger.info('App starting', { isDev, platform: process.platform })
  logger.info('Log file location', logger.getLogPath())

  // Ensure the writable whisper models directory exists (userData path).
  try {
    fs.mkdirSync(MODELS_DIR, { recursive: true })
    logger.info('Whisper models dir', MODELS_DIR)
  } catch (e) {
    logger.error('Failed to create models dir', { MODELS_DIR, e })
  }

  createWindow()

  // Request mic permission AFTER window exists so the dialog appears on top
  try {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    logger.info('Microphone permission', { granted })
  } catch (e) {
    logger.error('Microphone access denied', e)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (ollamaProcess)     { ollamaProcess.kill();     ollamaProcess     = null }
  if (ollamaFastProcess) { ollamaFastProcess.kill(); ollamaFastProcess = null }
})

// ---------------------------------------------------------------------------
// IPC: Logging
// ---------------------------------------------------------------------------

ipcMain.handle('log', (_e, level: string, message: string, data?: unknown) => {
  if (typeof level !== 'string' || typeof message !== 'string') return
  const safeLevel = ['error', 'warn', 'info'].includes(level) ? level : 'info'
  const safeMsg = String(message).slice(0, 2000)
  if (safeLevel === 'error') logger.error(`[renderer] ${safeMsg}`, data)
  else if (safeLevel === 'warn') logger.warn(`[renderer] ${safeMsg}`, data)
  else logger.info(`[renderer] ${safeMsg}`, data)
})

ipcMain.handle('get-log-path', () => logger.getLogPath())

// ---------------------------------------------------------------------------
// IPC: System
// ---------------------------------------------------------------------------

ipcMain.handle('open-screen-recording-settings', () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
})

ipcMain.handle('get-system-stats', () => getSystemStats())

// ---------------------------------------------------------------------------
// IPC: Model management
// ---------------------------------------------------------------------------

ipcMain.handle('get-all-models', (): ModelInfo[] => {
  const cfg = loadConfig()
  return KNOWN_MODELS.map(m => ({
    ...m,
    source: 'local' as const,
    exists: fs.existsSync(modelFile(m.name)),
    downloading: downloadingModels.has(m.name),
    active: m.name === cfg.activeModel,
    selected: cfg.selectedModels.includes(m.name),
  }))
})

// Check if the default whisper model is present; renderer gates the UI
// on this for the first-run download flow.
ipcMain.handle('ensure-default-model', async () => {
  const present = fs.existsSync(modelFile(DEFAULT_MODEL))
  if (!present) {
    // Fire-and-forget — progress is streamed via 'model-download-progress'
    downloadModelByName(DEFAULT_MODEL)
      .then(() => {
        mainWindow?.webContents.send('model-download-complete', { model: DEFAULT_MODEL, ok: true })
      })
      .catch((err: Error) => {
        mainWindow?.webContents.send('model-download-complete', { model: DEFAULT_MODEL, ok: false, error: friendlyDownloadError(err) })
      })
  }
  return { present, model: DEFAULT_MODEL }
})

ipcMain.handle('set-active-model', (_e, name: string) => {
  if (!KNOWN_MODELS.find(m => m.name === name)) return { ok: false, reason: 'Unknown model' }
  if (!fs.existsSync(modelFile(name))) return { ok: false, reason: 'Model not downloaded' }
  const cfg = loadConfig()
  cfg.activeModel = name
  saveConfig(cfg)
  logger.info('Active model set', name)
  return { ok: true }
})

ipcMain.handle('toggle-model-selected', (_e, name: string) => {
  if (!KNOWN_MODELS.find(m => m.name === name)) return { ok: false, reason: 'Unknown model' }
  const cfg = loadConfig()
  const idx = cfg.selectedModels.indexOf(name)
  if (idx === -1) {
    cfg.selectedModels.push(name)
  } else {
    cfg.selectedModels.splice(idx, 1)
  }
  saveConfig(cfg)
  logger.info('Model selection toggled', { name, selected: idx === -1 })
  return { ok: true }
})

ipcMain.handle('download-model', async (_e, name: string) => {
  if (!KNOWN_MODELS.find(m => m.name === name)) return { ok: false, reason: 'Unknown model' }
  if (fs.existsSync(modelFile(name))) return { ok: true, alreadyExists: true }
  downloadModelByName(name).catch(err => logger.error('Download failed', { name, err }))
  return { ok: true }
})

ipcMain.handle('delete-model', (_e, name: string) => {
  if (downloadingModels.has(name)) return { ok: false, reason: 'Download in progress' }
  const file = modelFile(name)
  if (fs.existsSync(file)) { fs.unlinkSync(file); logger.info('Model deleted', name) }
  const cfg = loadConfig()
  // Remove from selected list
  cfg.selectedModels = cfg.selectedModels.filter(n => n !== name)
  // If active model was deleted, fall back
  if (cfg.activeModel === name) {
    const fallback = KNOWN_MODELS.find(m => fs.existsSync(modelFile(m.name)))
    cfg.activeModel = fallback?.name ?? 'large-v3-turbo'
    if (!cfg.selectedModels.includes(cfg.activeModel)) {
      cfg.selectedModels.push(cfg.activeModel)
    }
  }
  saveConfig(cfg)
  return { ok: true }
})

// Import a .bin file dropped by the user
ipcMain.handle('import-model-file', async (_e, srcPath: string) => {
  const basename = path.basename(srcPath)
  const match = basename.match(/^ggml-(.+)\.bin$/)
  if (!match) return { ok: false, reason: 'File must be named ggml-<model>.bin' }
  const name = match[1]
  const dest = modelFile(name)
  try {
    fs.copyFileSync(srcPath, dest)
    logger.info('Model imported', { name, srcPath, dest })
    return { ok: true, name }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'Unknown import error'
    return { ok: false, reason }
  }
})

// ---------------------------------------------------------------------------
// IPC: Desktop capturer
// ---------------------------------------------------------------------------

ipcMain.handle(IPC_GET_DESKTOP_SOURCE_ID, async () => {
  // Always call desktopCapturer.getSources() — this is what triggers macOS to
  // register the app in Screen & System Audio Recording permissions.
  // Checking getMediaAccessStatus('screen') first and bailing would prevent
  // macOS from ever showing the app in System Settings.
  const sources = await desktopCapturer.getSources({ types: ['screen'] })

  if (process.platform === 'darwin') {
    const screenAccess = systemPreferences.getMediaAccessStatus('screen')
    if (screenAccess !== 'granted') {
      throw new Error('SCREEN_PERMISSION_REQUIRED')
    }
  }

  if (!sources.length) throw new Error('No screen sources found')
  return sources[0].id
})

ipcMain.handle('get-permission-status', () => {
  const mic = systemPreferences.getMediaAccessStatus('microphone')
  const screen = systemPreferences.getMediaAccessStatus('screen')
  return { mic, screen }
})

// ---------------------------------------------------------------------------
// WAV writer & transcript cleaner
// ---------------------------------------------------------------------------

function writeWav(filePath: string, samples: Float32Array, sampleRate: number) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVE', 8); buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2)
  }
  fs.writeFileSync(filePath, buffer)
}

function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]/g, '')
    .replace(/(?:\([^)]{0,60}\)|\[[^\]]{0,60}\])/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Maps language names (from live-understanding) to Whisper language codes.
// Only the most common ones — anything unknown falls back to 'auto'.
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  afrikaans: 'af', arabic: 'ar', armenian: 'hy', azerbaijani: 'az',
  belarusian: 'be', bengali: 'bn', bosnian: 'bs', bulgarian: 'bg',
  catalan: 'ca', chinese: 'zh', croatian: 'hr', czech: 'cs',
  danish: 'da', dutch: 'nl', english: 'en', estonian: 'et',
  finnish: 'fi', french: 'fr', galician: 'gl', german: 'de',
  greek: 'el', gujarati: 'gu', hebrew: 'he', hindi: 'hi',
  hungarian: 'hu', icelandic: 'is', indonesian: 'id', italian: 'it',
  japanese: 'ja', kannada: 'kn', kazakh: 'kk', korean: 'ko',
  latvian: 'lv', lithuanian: 'lt', macedonian: 'mk', malay: 'ms',
  maltese: 'mt', marathi: 'mr', mongolian: 'mn', nepali: 'ne',
  norwegian: 'no', persian: 'fa', polish: 'pl', portuguese: 'pt',
  punjabi: 'pa', romanian: 'ro', russian: 'ru', serbian: 'sr',
  slovak: 'sk', slovenian: 'sl', somali: 'so', spanish: 'es',
  swahili: 'sw', swedish: 'sv', tagalog: 'tl', tamil: 'ta',
  telugu: 'te', thai: 'th', turkish: 'tr', ukrainian: 'uk',
  urdu: 'ur', uzbek: 'uz', vietnamese: 'vi', welsh: 'cy',
}

function resolveWhisperLanguage(): string {
  try {
    // Dynamically import to avoid circular dependency at module load time
    const lu = _require('./live-understanding.js')
    const ctx = lu.getLanguageContext?.()
    if (ctx?.confirmed && ctx.language) {
      const code = LANGUAGE_NAME_TO_CODE[ctx.language.toLowerCase()]
      if (code) return code
    }
  } catch { /* best-effort */ }
  return 'auto'
}

// ---------------------------------------------------------------------------
// IPC: Transcribe — parallel across all selected models, then merge
// ---------------------------------------------------------------------------

ipcMain.handle(IPC_TRANSCRIBE, async (_e, samples: Float32Array) => {
  const cfg = loadConfig()
  const now = Date.now()

  // Resolve which selected models are available on disk
  const activeModels = cfg.selectedModels.filter(name => {
    const knownModel = KNOWN_MODELS.find(m => m.name === name)
    const file = fs.existsSync(modelFile(name))
    if (!knownModel) {
      // Could be a HF model — check by file path ggml-<name>.bin
    }
    return file
  })

  if (activeModels.length === 0) {
    logger.warn('No selected models available on disk', { selectedModels: cfg.selectedModels })
    return []
  }

  // Write one WAV per model so concurrent reads don't conflict
  const tmpFiles = activeModels.map(name => ({
    name,
    tmpPath: path.join(app.getPath('temp'), `chunk-${now}-${name}.wav`),
  }))

  for (const { tmpPath } of tmpFiles) {
    writeWav(tmpPath, samples, TARGET_SAMPLE_RATE)
  }

  // Use confirmed detected language to lock Whisper — prevents cross-language hallucinations
  const whisperLanguage = resolveWhisperLanguage()
  logger.info('Whisper language', { language: whisperLanguage })

  // Run whisper.cpp models in parallel
  const whisperPromises = tmpFiles.map(async ({ name, tmpPath }) => {
    let raw = ''
    try {
      raw = await runWhisperCli({
        audioPath: tmpPath,
        modelPath: modelFile(name),
        language: whisperLanguage,
        outputText: true,
        outputJson: true,
      })
    } finally {
      // Clean up the tmp WAV we wrote (previously nodewhisper removed it for us)
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch { /* best-effort */ }
    }

    // Read detected language from the JSON sidecar whisper-cli writes
    let language: string | undefined
    const jsonPath = tmpPath.replace(/\.wav$/, '.json')
    try {
      if (fs.existsSync(jsonPath)) {
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
        language = json?.result?.language as string | undefined
        fs.unlinkSync(jsonPath)
      }
    } catch { /* best-effort */ }

    return { name, text: cleanTranscript(raw ?? ''), language }
  })

  const allResults = await Promise.allSettled(whisperPromises)

  // Collect successful, non-empty results
  const successful: Array<{ name: string; text: string; language?: string }> = []
  for (const r of allResults) {
    if (r.status === 'fulfilled' && r.value.text) {
      successful.push(r.value)
    } else if (r.status === 'rejected') {
      logger.error('Transcription error from model', r.reason)
    }
  }

  logger.info('Parallel transcription results', successful.map(r => ({ model: r.name, chars: r.text.length })))

  if (successful.length === 0) return []

  const output = successful.map(r => ({ model: r.name, text: r.text, language: r.language }))
  logger.info('Transcription results per model', output.map(r => ({ model: r.model, words: r.text.split(/\s+/).filter(Boolean).length })))
  return output
})

// ---------------------------------------------------------------------------
// IPC: Ollama model config
// ---------------------------------------------------------------------------

ipcMain.handle('get-ollama-model', () => {
  const cfg = loadConfig()
  return cfg.ollamaModel
})

ipcMain.handle('set-ollama-model', async (_e, model: string) => {
  if (!isValidModelName(model)) {
    return { ok: false, reason: 'Invalid model name' }
  }
  const cfg = loadConfig()
  cfg.ollamaModel = model
  saveConfig(cfg)
  // Propagate to the live-understanding module immediately so in-flight and
  // future LLM calls use the new model without restarting the session.
  const { setOllamaModel } = await import('./live-understanding.js')
  setOllamaModel(model)
  return { ok: true }
})

// Two-tier / fast model handlers removed — single model architecture now

ipcMain.handle('get-ollama-models', async () => {
  const running = await checkOllamaRunning()
  if (!running) return []
  return new Promise<Array<{ name: string; size: number }>>((resolve, reject) => {
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Ollama HTTP ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as OllamaTagsResponse
          const models = (json.models ?? []).map((m) => ({
            name: m.name ?? '',
            size: m.size ?? 0,
          }))
          resolve(models)
        } catch { reject(new Error('Invalid JSON from Ollama')) }
      })
      res.on('error', reject)
    })

    req.on('error', reject)

    setTimeout(() => {
      req.destroy()
      reject(new Error('Ollama request timeout'))
    }, 60000)
  })
})

ipcMain.handle('pull-ollama-model', async (_e, modelName: string) => {
  if (!isValidModelName(modelName)) {
    return { ok: false, reason: 'Invalid model name' }
  }
  const ready = await ensureOllama()
  if (!ready) return { ok: false, reason: 'Ollama not available' }
  return new Promise<{ ok: boolean; reason?: string }>((resolve, reject) => {
    const body = JSON.stringify({ name: modelName, stream: false })
    const req = http.request({
      hostname: 'localhost', port: 11434,
      path: '/api/pull', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      res.on('end', () => {
        resolve(res.statusCode === 200 ? { ok: true } : { ok: false, reason: `HTTP ${res.statusCode}` })
      })
      res.on('error', reject)
    })

    req.on('error', reject)

    const timer = setTimeout(() => {
      req.destroy()
      reject(new Error('Ollama pull timeout'))
    }, 60000)

    req.on('finish', () => clearTimeout(timer))

    req.write(body)
    req.end()
  })
})

// ---------------------------------------------------------------------------
// IPC: Merge transcripts via local Ollama (streaming)
// ---------------------------------------------------------------------------

ipcMain.handle('merge-transcripts', async (_e, results: Array<{model: string; text: string}>) => {
  const cfg = loadConfig()
  const model = cfg.ollamaModel || 'llama3.2'

  const ready = await ensureOllama()
  if (!ready) {
    mainWindow?.webContents.send('merge-done', { ok: false, reason: 'Could not start Ollama. Make sure it is installed (https://ollama.com).' })
    return { ok: false, reason: 'Could not start Ollama.' }
  }

  const prompt = `You are a transcription editor. Below are transcripts of the same audio from multiple speech-to-text models. Merge them into a single clean, accurate transcript. Prefer the more complete/accurate wording. Output only the final transcript text, nothing else.\n\n${results.map(r => `[${r.model}]:\n${r.text}`).join('\n\n')}`
  const body = JSON.stringify({ model, prompt, stream: true })

  const req = http.request({
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
  }, (res) => {
    let buffer = ''
    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // keep incomplete last line
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line)
          if (json.response) {
            mainWindow?.webContents.send('merge-chunk', json.response)
          }
          if (json.done) {
            mainWindow?.webContents.send('merge-done', { ok: true })
          }
        } catch { /* skip malformed lines */ }
      }
    })
    res.on('end', () => {
      // flush remaining buffer
      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer)
          if (json.response) mainWindow?.webContents.send('merge-chunk', json.response)
          if (json.done) mainWindow?.webContents.send('merge-done', { ok: true })
        } catch {
          mainWindow?.webContents.send('merge-done', { ok: false, reason: 'Invalid final merge chunk' })
        }
      }
    })
    res.on('error', (e: Error) => {
      mainWindow?.webContents.send('merge-done', { ok: false, reason: e.message })
    })
  })

  req.on('error', (e: Error) => {
    mainWindow?.webContents.send('merge-done', { ok: false, reason: e.message })
  })

  const timer = setTimeout(() => {
    req.destroy()
    mainWindow?.webContents.send('merge-done', { ok: false, reason: 'Merge timeout after 60s' })
  }, 60000)

  req.on('finish', () => clearTimeout(timer))
  req.on('close', () => clearTimeout(timer))

  req.write(body)
  req.end()

  return { ok: true } // streaming starts; result comes via push events
})

// ---------------------------------------------------------------------------
// IPC: Live Understanding
// ---------------------------------------------------------------------------

let activeSessionId: string | null = null
let activeSessionStartedAt: number = 0

ipcMain.handle('start-understanding-session', async (_e, model?: string) => {
  const { startSession, emitter } = await import('./live-understanding.js')
  const { upsertSession } = await import('./db.js')
  const cfg = loadConfig()

  activeSessionId = crypto.randomUUID()
  activeSessionStartedAt = Date.now()

  await startSession(model ?? cfg.ollamaModel ?? 'qwen3.5:4b')

  // Seed an empty row so the session exists immediately
  upsertSession(activeSessionId, activeSessionStartedAt, null, '', 0, [], [], [])

  emitter.removeAllListeners('understanding-question')
  emitter.removeAllListeners('understanding-answer')
  emitter.removeAllListeners('threads-status')

  emitter.on('understanding-question', (ctx) => {
    mainWindow?.webContents.send('understanding-question', ctx)
  })
  emitter.on('understanding-answer', (ctx) => {
    mainWindow?.webContents.send('understanding-answer', ctx)
  })
  emitter.on('threads-status', (statuses) => {
    mainWindow?.webContents.send('threads-status', statuses)
  })

  return { ok: true, sessionId: activeSessionId }
})

ipcMain.handle('stop-understanding-session', async () => {
  const { stopSession, emitter } = await import('./live-understanding.js')
  const { upsertSession } = await import('./db.js')
  stopSession()
  emitter.removeAllListeners('understanding-question')
  emitter.removeAllListeners('understanding-answer')
  emitter.removeAllListeners('threads-status')
  // Stamp ended_at with empty context (Q&A mode has no summary/topics)
  if (activeSessionId) {
    upsertSession(activeSessionId, activeSessionStartedAt, Date.now(),
      '', 0, [], [], [])
    activeSessionId = null
  }
  return { ok: true }
})

ipcMain.handle('push-transcript-chunk', async (_e, text: string) => {
  if (typeof text !== 'string' || text.length === 0) return { ok: false }
  const { pushChunk } = await import('./live-understanding.js')
  pushChunk(text)
  return { ok: true }
})

ipcMain.handle('clear-understanding', async () => {
  const { clearUnderstanding } = await import('./live-understanding.js')
  clearUnderstanding()
  return { ok: true }
})

ipcMain.handle('resume-understanding-session', async () => {
  const { resumeSession } = await import('./live-understanding.js')
  resumeSession()
  return { ok: true }
})

ipcMain.handle('pause-understanding-session', async () => {
  const { pauseSession } = await import('./live-understanding.js')
  await pauseSession()
  return { ok: true }
})

// ---------------------------------------------------------------------------
// IPC: Sessions DB
// ---------------------------------------------------------------------------

ipcMain.handle('db:getSessions', async (_e, topicFilter?: string) => {
  const { getSessions } = await import('./db.js')
  return getSessions(topicFilter)
})

ipcMain.handle('db:getSession', async (_e, id: string) => {
  if (typeof id !== 'string' || id.length === 0) return null
  const { getSession } = await import('./db.js')
  return getSession(id)
})

ipcMain.handle('db:deleteSession', async (_e, id: string) => {
  if (typeof id !== 'string' || id.length === 0) return { ok: false }
  const { deleteSession } = await import('./db.js')
  deleteSession(id)
  return { ok: true }
})

ipcMain.handle('db:getTopics', async () => {
  const { getTopics } = await import('./db.js')
  return getTopics()
})

ipcMain.handle('db:updateActionDone', async (_e, id: number, done: boolean) => {
  const { updateActionDone } = await import('./db.js')
  updateActionDone(id, done)
  return { ok: true }
})

// ---------------------------------------------------------------------------
// IPC: Save file
// ---------------------------------------------------------------------------

ipcMain.handle(IPC_SAVE_FILE, async (_e, content: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `transcript-${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  })
  if (canceled || !filePath) return false
  try { fs.writeFileSync(filePath, content, 'utf-8'); return true }
  catch (err) { logger.error('Save error', err); return false }
})
