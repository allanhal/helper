# Helper — Electron Rewrite Plan

## Goal

Rewrite the macOS "Helper" app (currently Swift/SwiftUI) as an Electron app.
The app listens to **microphone input** and **system audio output** simultaneously,
transcribes both locally using **Whisper** (via whisper.cpp), and displays a
live editable transcript the user can save to disk.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | **Electron 33+** | Native macOS APIs via Node.js; access to `desktopCapturer` for system audio |
| UI | **React 18 + Vite** | Fast iteration, component-based, familiar |
| Styling | **Tailwind CSS** | Utility-first, zero config for desktop |
| Transcription | **nodejs-whisper** (whisper.cpp binding) | Local, on-device, no API key needed |
| IPC | Electron `contextBridge` + `ipcRenderer/ipcMain` | Secure renderer↔main communication |
| Packaging | **electron-builder** | Creates .dmg / .app for macOS |

---

## Project Structure

```
helper-electron/
├── package.json
├── electron/
│   ├── main.ts          # Main process: window, IPC handlers, whisper worker
│   ├── preload.ts       # contextBridge — exposes safe APIs to renderer
│   └── whisper.ts       # whisper.cpp wrapper (nodejs-whisper)
├── src/
│   ├── main.tsx         # React entry
│   ├── App.tsx          # Root component
│   ├── components/
│   │   ├── Toolbar.tsx
│   │   ├── TranscriptEditor.tsx
│   │   └── StatusBar.tsx
│   └── hooks/
│       ├── useAudioCapture.ts   # Mic + system audio via Web Audio API
│       └── useTranscription.ts  # Sends chunks to main via IPC, receives text
├── vite.config.ts
└── electron-builder.yml
```

---

## Audio Capture Strategy

### Microphone
Use standard `getUserMedia`. macOS will prompt for Microphone permission (TCC).

```ts
const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
```

### System Audio (speakers output)
Use Electron's `desktopCapturer`. macOS will prompt for Screen Recording permission (TCC).

**Important**: Chromium on macOS requires a video track when requesting desktop audio.
Request both, then discard the video track.

```ts
// In main process — renderer cannot call desktopCapturer directly
ipcMain.handle('get-desktop-source-id', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] })
  return sources[0]?.id  // first display
})

// In renderer
const sourceId = await window.electronAPI.getDesktopSourceId()
const sysStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
    },
  },
  video: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
    },
  },
})
// Drop video — only keep audio
sysStream.getVideoTracks().forEach(t => t.stop())
```

### Mixing & Chunking
Use the Web Audio API `AudioContext` to merge both streams into one, collect
PCM Float32 samples, and emit 3-second chunks to the transcription layer.

```ts
const ctx = new AudioContext({ sampleRate: 16000 })
const micSource = ctx.createMediaStreamSource(micStream)
const sysSource = ctx.createMediaStreamSource(sysStream)
const merger    = ctx.createChannelMerger(1)
micSource.connect(merger, 0, 0)
sysSource.connect(merger, 0, 0)

// ScriptProcessorNode (or AudioWorklet) collects Float32 samples
// Accumulate → emit chunk every 3 seconds (48000 frames @ 16kHz)
```

---

## Transcription Pipeline

`nodejs-whisper` wraps whisper.cpp and runs entirely on-device.

### Install
```bash
npm install nodejs-whisper
npx nodejs-whisper download  # downloads ggml-base.en.bin model (~142MB)
```

### Usage (main process)
```ts
import { nodewhisper } from 'nodejs-whisper'
import * as fs from 'fs'
import * as path from 'path'

async function transcribeChunk(samples: Float32Array): Promise<string> {
  // whisper.cpp expects a WAV file — write tmp file, transcribe, delete
  const tmpPath = path.join(app.getPath('temp'), `chunk-${Date.now()}.wav`)
  writeWav(tmpPath, samples, 16000)  // helper: encode PCM → WAV

  const result = await nodewhisper(tmpPath, {
    modelName: 'base.en',
    autoDownloadModelName: 'base.en',
    removeWavFileAfterTranscription: true,
    withCuda: false,
    whisperOptions: {
      outputInText: true,
      language: 'auto',
    },
  })
  return result?.trim() ?? ''
}
```

IPC flow:
```
Renderer (audio chunk as Float32Array)
  → ipcRenderer.invoke('transcribe', chunk)
  → main: transcribeChunk(chunk) → string
  → return text to renderer
  → renderer appends to transcript
```

---

## Permissions on macOS

Electron apps on macOS still go through TCC. You must declare usage strings in
`Info.plist` (embedded via electron-builder) and call the permission APIs.

### electron-builder.yml (macOS section)
```yaml
mac:
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    NSMicrophoneUsageDescription: "Helper listens to your microphone to transcribe speech."
    NSScreenCaptureUsageDescription: "Helper captures system audio output to transcribe what plays on your speakers."
```

### build/entitlements.mac.plist
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
  <key>com.apple.security.device.audio-input</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
</dict>
</plist>
```

> Note: App Sandbox must be OFF (same as the Swift version) for Screen Recording
> to work with `desktopCapturer`.

### Requesting permissions at runtime
```ts
import { systemPreferences } from 'electron'

// In main process before starting capture
await systemPreferences.askForMediaAccess('microphone')
// Screen Recording has no programmatic request API — handled by OS on first use
```

---

## UI Components

### App.tsx (state machine)
```
states: idle | loading | recording | transcribing | error
```

### Toolbar
- Record / Stop button
- Clear button
- Save button (triggers `ipcRenderer.invoke('save-file', text)`)

### TranscriptEditor
- `<textarea>` or `contentEditable` div
- Appends new text as chunks arrive
- User can freely edit

### StatusBar
- Current state label
- Word count
- Model loading progress bar (shown during first-run model download)

---

## Key Differences vs Swift App

| | Swift (current) | Electron (new) |
|---|---|---|
| Whisper acceleration | CoreML (GPU) | CPU only (whisper.cpp) |
| System audio API | ScreenCaptureKit | desktopCapturer + getUserMedia |
| App bundle size | ~small | ~200MB (Chromium) |
| Cross-platform | macOS only | macOS, Windows, Linux |
| Chunk → WAV | In-memory Float32 | Temp WAV file on disk |
| TCC permissions | Same | Same |

---

## Build & Run

```bash
# Install deps
npm install

# Development (hot reload)
npm run dev        # starts Vite + Electron concurrently

# Production build
npm run build      # Vite build
npm run dist       # electron-builder → dist/Helper.dmg
```

---

## First Steps for New Session

1. `npm create vite@latest helper-electron -- --template react-ts`
2. `npm install electron electron-builder concurrently wait-on`
3. `npm install nodejs-whisper`
4. `npm install -D @types/node tailwindcss`
5. Create `electron/main.ts` with window creation + IPC handlers
6. Create `electron/preload.ts` with `contextBridge`
7. Implement `useAudioCapture.ts` hook (mic + desktop audio)
8. Implement `useTranscription.ts` hook (IPC to main → whisper)
9. Build UI components (Toolbar, TranscriptEditor, StatusBar)
10. Configure `electron-builder.yml` with macOS entitlements + Info.plist keys
11. Test permissions flow (mic dialog, screen recording dialog)
12. Package with `npm run dist`

---

## Notes

- `nodejs-whisper` writes temp WAV files to disk per chunk — ensure cleanup on stop
- On first run, model download (~142MB for base.en) blocks transcription; show a progress bar
- `desktopCapturer` must be called from the **main process** (security restriction in Electron 20+)
- whisper.cpp is CPU-bound; 3-second chunks at base.en model typically transcribe in ~1–2s on M-series Mac
- Silence detection before sending to whisper saves CPU (compute RMS in renderer before IPC call)
