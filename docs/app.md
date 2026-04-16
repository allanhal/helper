# Helper — Complete App Reference

> Local-first meeting intelligence. Records mic + system audio, transcribes with Whisper, and runs three parallel AI threads (via Ollama) that continuously summarize, extract action items, detect topics, and monitor open questions — all on-device, no cloud.

---

## Table of Contents

1. [What Helper Does](#1-what-helper-does)
2. [Requirements & Setup](#2-requirements--setup)
3. [Running the App](#3-running-the-app)
4. [UI Overview](#4-ui-overview)
5. [Audio Strip](#5-audio-strip)
6. [Transcript Columns](#6-transcript-columns)
7. [Live Understanding Panel](#7-live-understanding-panel)
8. [Session History Panel](#8-session-history-panel)
9. [Models Panel](#9-models-panel)
10. [Transcription Engine](#10-transcription-engine)
11. [Live Understanding Engine](#11-live-understanding-engine)
12. [Data Layer — SQLite](#12-data-layer--sqlite)
13. [Font Size](#13-font-size)
14. [Architecture Diagram](#14-architecture-diagram)

---

## 1. What Helper Does

Helper is a macOS desktop app that sits in the background during any conversation — meetings, calls, interviews, lectures — and:

- **Captures audio** from both your microphone and system output (whatever is playing through your speakers) simultaneously
- **Transcribes** everything in real time using local Whisper models
- **Understands** the conversation through three parallel AI analysis threads that produce a live rolling summary, action items, topics, and key decisions
- **Monitors** open questions and pending topics that haven't been addressed yet
- **Persists** every session to a local SQLite database for later review
- **Merges** multi-model transcripts into a single clean version using a local Ollama model

Everything runs locally. No audio, transcript, or analysis data ever leaves your machine.

---

## 2. Requirements & Setup

### System

- macOS (Apple Silicon or Intel)
- [Ollama](https://ollama.com) installed and at least one model pulled — recommended: `qwen3:4b`

```bash
ollama pull qwen3:4b
```

### Install dependencies

```bash
pnpm install
```

The `postinstall` script automatically rebuilds `better-sqlite3` for the correct Electron ABI. If you switch Electron versions, run:

```bash
pnpm rebuild
```

### Whisper models

On first use, go to **Models** (gear icon in the toolbar) and download at least one Whisper model. The `small` model (~460 MB) is a good starting point; `large-v3-turbo` (~1.5 GB) gives significantly better accuracy for non-English languages.

---

## 3. Running the App

```bash
# Development (hot-reload for renderer, restarts main process on electron/ changes)
pnpm dev

# Production build + package
pnpm dist
```

The dev server starts Vite for the renderer and Electron for the main process concurrently.

---

## 4. UI Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar: [Helper logo] [Record/Stop] [A− A+] [Clear][Save] [⏱][⚙] │
├──────────────────────────────────────────────────────────────┤
│  Audio strip: [🎤 mute][🔊 mute]  ▌▌▌ waveform  [model pills]  │
├─────────────────────────┬────────────────────────────────────┤
│                         │                                    │
│   Live Understanding    │      Transcript Columns            │
│   (left panel, flex 3)  │      (right area, flex 2)          │
│                         │                                    │
│  SUMMARY                │  [whisper-small]    [whisper-large] │
│  Action Items | Topics  │  ┌──────────────┐ ┌─────────────┐ │
│  Key Decisions          │  │  transcript  │ │  transcript │ │
│  Ask a question         │  │  text area   │ │  text area  │ │
│                         │  └──────────────┘ └─────────────┘ │
└─────────────────────────┴────────────────────────────────────┘
```

The **Session History** and **Models** panels open as full-width strips between the toolbar and the main content area.

---

## 5. Audio Strip

The thin bar directly below the toolbar shows real-time audio status and lets you control what gets captured.

### Mute controls

| Button | What it does |
|---|---|
| **🎤 (microphone)** | Mutes/unmutes your microphone input. Red background = muted. |
| **🔊 (speaker)** | Mutes/unmutes system audio (whatever is playing through your speakers). Red background = muted. |

Muting is non-destructive — the stream stays open, the audio track is just disabled. You can toggle freely mid-recording without restarting the session.

### Waveform

The `AudioMeter` shows a real-time bar graph of the mixed audio level. The signal is high-pass filtered (80 Hz cutoff) before metering, so low-frequency hum from desk vibration or HVAC doesn't cause false activity. The level display is smoothed with a fast attack / slow decay envelope to be readable without flickering.

### Model pills

Clickable pills showing which Whisper model(s) are currently selected. Click any pill to open the model picker dropdown, where you can select a different model or trigger a download. Multiple models can be selected simultaneously — each gets its own transcript column.

### Ollama model pill

Shows which Ollama model is being used for live understanding and transcript merging. Click to switch models. Only models that are already pulled in Ollama appear in the list.

### Free memory

Displays current free system RAM (in GB). Useful for judging whether you can run a larger model without swapping.

---

## 6. Transcript Columns

The main content area displays one scrollable text column per selected Whisper model.

### How it works

Audio is captured at 16 kHz, mixed from mic + system sources, filtered, and accumulated into **3-second chunks**. Silent chunks (RMS below 0.01) are discarded to prevent Whisper hallucination on silence. Each non-silent chunk is sent to every selected model simultaneously. New text appends to the bottom; the view auto-scrolls unless you've manually scrolled up.

The textarea is fully editable — you can correct transcription errors inline at any time.

### Column header

Shown when more than one model is active. Displays the model name and a live word count.

### Merge bar

Appears when two or more models are producing transcripts. Lets you consolidate them into a single clean version using a local Ollama model.

**To merge:**
1. Select an Ollama merge model from the dropdown (or pull a new one with the `+` button)
2. Click **Merge with AI** — the merged result streams in from Ollama token by token
3. Use **Back to columns** to return to the individual model view

The Ollama merge model list is separate from the understanding model — you can use a different (larger, slower) model specifically for post-recording merging.

### Empty state

If no models are selected, the area shows "Select a model to start transcribing" with no columns rendered.

---

## 7. Live Understanding Panel

The left panel runs continuously while a session is active, analyzing the transcript through three independent AI threads.

### Header

| Element | Meaning |
|---|---|
| **Live Understanding** title | Panel label |
| **LIVE** badge (green) | Understanding session is active |
| Timestamp | Time of the most recent analysis update across all threads |
| Thread status dots (**Now / All / Q&A**) | One dot per analysis thread. Green = completed recently. Orange = running. Red = error. Hover for last run time or error message. |
| **⚙ settings** | Opens the Ollama model selector for this panel |

### Thread indicators

Three threads run in parallel:

| Dot label | Thread | Purpose | Frequency |
|---|---|---|---|
| **Now** | Latest | Fast incremental update from the last few transcript chunks | Every chunk (~3s), or after 3s of silence |
| **All** | Overall | Full re-read of the entire transcript to correct drift | Every 90 seconds |
| **Q&A** | Response | Detects open questions and pending topics in recent speech | Every 10 seconds |

### Summary section

A rolling 2–3 paragraph summary of everything discussed so far. Produced by the **Latest** thread on each cycle and corrected periodically by the **Overall** thread. The display merges both: Overall's version is authoritative for history; Latest extends it with the most recent content.

### Action Items

Concrete tasks extracted from the conversation. Each item has:
- A task description
- Optional owner (`@name`)
- Optional deadline
- A checkbox — check to mark done (persisted to SQLite when the session ends)

Items are de-duplicated across Latest and Overall thread outputs.

### Open Questions *(Response thread)*

Questions that were explicitly asked in the conversation but have not yet received an answer. Only genuinely unanswered questions appear here — the AI is instructed to remove items once they've been addressed.

### Pending Topics *(Response thread)*

Topics or points the other party raised that you haven't responded to yet. Same strictness rule: addressed topics are removed automatically.

### Topics

Subjects discussed in the conversation, shown as pills. You can:
- **Remove** any topic by clicking the `×` on its pill
- **Add** a topic manually by typing in the `+ add topic` inline input and pressing Enter
- **Pin** a topic — once you've added or kept any topic, those are "pinned" and the AI is instructed to always include them in subsequent analysis passes, even if it would otherwise drop them

Pinned topics are visually distinguished with a blue tint and border.

### Key Decisions

Decisions that were made (not just discussed). Displayed as a bulleted list.

### Ask

A free-form question field. Type any question about the current meeting and press Enter or click **Ask**. The question is answered against the full transcript accumulated so far (not just the rolling summary), using the Ollama model at temperature 0.3. The answer appears below the input. Asking does not interrupt or affect the background analysis threads.

### Settings (gear icon)

Opens a small inline settings panel for Live Understanding:

- **Ollama model** — select which model the three analysis threads use. Changes take effect on the next trigger cycle.

---

## 8. Session History Panel

Opens as a full-width strip when you click the **⏱ clock** icon in the toolbar. Shows all past recorded sessions stored in the local SQLite database.

### Topic filter chips

A single-row horizontal-scroll strip at the top of the header. Click any topic chip to filter the session list to only sessions tagged with that topic. Click the active chip again (or the **✕ clear** button) to remove the filter.

### Session list (left column)

Shows all sessions ordered newest first. Each row displays:
- **Date + time** of the session start
- **Duration** (e.g. `12m`) if the session has ended
- **Summary preview** — first two lines of the AI summary
- **Topic tags** — up to three topic pills; `+N` if there are more

Click a row to open that session's detail in the right pane. The selected row gets a blue left-border accent.

**To delete a session:** hover over the row and click the `×` that appears in the top-right corner of the item.

**Bulk delete:** check the checkbox on one or more rows (or use **Select all** at the top of the list), then click the **Delete N** button in the red bulk-action bar that appears.

### Session detail (right pane)

Shows the full content of the selected session:

- **Metadata bar** — start/end time, duration pill or "in progress" badge, segment count
- **Summary** — full text of the AI-generated summary
- **Action Items** — full list with owner/deadline and checkboxes (checking persists to the database immediately)
- **Key Decisions** — bulleted list
- **Topics** — all topic pills for this session

When both Action Items and Key Decisions are present they render side-by-side in a two-column grid to use space efficiently.

---

## 9. Models Panel

Opens as a full-width strip when you click the **⚙ gear** icon in the toolbar.

### Whisper models (WhisperKit / whisper.cpp)

Lists all known Whisper models with their size, RAM requirements, and star rating. For each model:

| Control | Action |
|---|---|
| **Download** button | Downloads the model binary (~460 MB to ~3 GB depending on model) |
| **Select / deselect** | Toggles the model as active — active models each get their own transcript column |
| **Delete** | Removes the model file from disk |
| Progress bar | Shown during download with % complete |
| Error message | Shown if a download fails |

Only downloaded models can be selected. Multiple models can be selected simultaneously for side-by-side comparison.

### ONNX models

A separate section for HuggingFace ONNX Whisper models (run via `@xenova/transformers`). These run entirely in the renderer process — no native binary required.

| Control | Action |
|---|---|
| **Download** | Pulls the ONNX model files from HuggingFace |
| **Remove** | Deletes the model and its cached files |

### Import

Drag-and-drop or click to import a `ggml-<model>.bin` file you've downloaded manually. The file must follow the naming convention `ggml-<model>.bin`.

### HuggingFace Browser

The **Browse HuggingFace** button opens a full browser for discovering and downloading Whisper-compatible ONNX models directly from HuggingFace. You can:
- Search by keyword or repo ID
- Browse individual model repos and their file listings
- Trigger downloads with progress tracking
- Save a HuggingFace API token (for private/gated models)

### System stats

The panel footer shows current free RAM and model-level RAM estimates so you can judge which models will fit.

---

## 10. Transcription Engine

### Audio pipeline

```
Microphone ─────────────────────────────────┐
                                             ├── AudioContext (16 kHz) ──▶ ScriptProcessor
System audio (desktop capture) ─────────────┘         │
                                                        ▼
                                              High-pass filter (80 Hz)
                                                        │
                                                        ▼
                                              Silence gate (RMS < 0.01 → skip)
                                                        │
                                                        ▼
                                              Accumulate until 3s × 16 kHz = 48,000 samples
                                                        │
                                                        ▼
                                              Send chunk to each selected model
```

Key parameters:

| Parameter | Value | Reason |
|---|---|---|
| Sample rate | 16,000 Hz | Whisper's native rate |
| Chunk size | 3 seconds | Balance between latency and Whisper context |
| Silence threshold (RMS) | 0.01 | Prevents Whisper from hallucinating on silence |
| High-pass cutoff | ~80 Hz (α = 0.995) | Removes desk/HVAC hum without affecting speech |

### Whisper backends

The app supports three backends, selectable via the Models panel:

| Backend | Library | GPU | Notes |
|---|---|---|---|
| **whisper.cpp (CPU)** | `nodejs-whisper` | No — ARM NEON | Default. Models download automatically. |
| **ONNX** | `@xenova/transformers` | No | Runs in renderer process. No native binary. |
| **HuggingFace ONNX** | `@xenova/transformers` | No | Custom models from HuggingFace hub. |

For best Portuguese accuracy, use `large-v3-turbo` (~1.5 GB) or its quantized variant `large-v3-turbo-q5_0` (~547 MB, must be imported manually).

---

## 11. Live Understanding Engine

Three threads run in parallel inside `electron/live-understanding.ts`. They share the same transcript buffer (`allChunks`) and Ollama model but operate independently.

### Thread 1 — Latest (fast, incremental)

- **Trigger:** every incoming chunk, or after 3 seconds of silence
- **Input:** previous `MeetingContext` JSON + new chunks only (~900 tokens total)
- **Output:** updated `MeetingContext` (summary, action items, topics, key decisions)
- **Purpose:** low-latency live updates. Shows results within 3–6 seconds of speech on M1.

### Thread 2 — Overall (deep, periodic)

- **Trigger:** every 90 seconds, only if new chunks have arrived since last run
- **Input:** full transcript (up to 12,000 characters)
- **Output:** `MeetingContext` — same shape but produced from scratch, not incrementally
- **Purpose:** corrects any drift or errors introduced by the incremental Latest thread. Acts as the authoritative source for history.

The UI merges Latest and Overall: Overall is authoritative for past content; Latest extends it with the most recent speech. When Latest is ahead of Overall by more than 2 chunks, the Latest summary is prepended to give the user the freshest view.

### Thread 3 — Response (conversation monitor)

- **Trigger:** every 10 seconds, only if new chunks have arrived
- **Input:** last 6,000 characters of transcript
- **Output:** `ResponseContext` — open questions, pending topics
- **Purpose:** tracks what the other party asked or raised that hasn't been addressed yet. Only genuinely unanswered/unaddressed items appear.

### Topic validation

After each Latest or Overall run, candidate topics go through a separate validation call that checks each topic against the actual transcript. This filters out vague terms like "meeting" or "discussion" and ensures every displayed topic corresponds to something actually discussed.

### Context schema

```typescript
interface MeetingContext {
  summary: string          // max 1,500 chars (Latest) / 2,000 chars (Overall)
  action_items: ActionItem[]
  topics: string[]
  key_decisions: string[]
  last_updated_at: number  // timestamp
  chunk_count: number
}

interface ActionItem {
  task: string
  owner?: string
  deadline?: string
}

interface ResponseContext {
  open_questions: string[]
  pending_topics: string[]
  last_updated_at: number
}
```

### Ollama communication

All analysis calls go to `http://localhost:11434/api/chat` using grammar-constrained structured output (`format` parameter). This guarantees syntactically valid JSON on every response — no parsing fallbacks needed.

The app auto-starts Ollama if it isn't already running (via `ollama serve`). If Ollama can't be reached within 10 seconds of launch, analysis threads silently skip cycles and retry on the next trigger.

### Recommended models

| Model | Size | Speed (M1 Pro) | Use case |
|---|---|---|---|
| `qwen3:4b` | ~2.3 GB | ~60 tok/s | Default — good balance of speed and quality |
| `qwen3:8b` | ~4.7 GB | ~35 tok/s | Better reasoning, slower |
| `llama3.2` | ~2.0 GB | ~65 tok/s | Fast alternative |

Avoid `gemma3` on Apple Silicon due to a known Ollama structured-output bug (#12360).

---

## 12. Data Layer — SQLite

All session data is persisted to `~/Library/Application Support/helper-electron/sessions.db` using `better-sqlite3` with WAL journal mode.

### Schema

```sql
sessions        — one row per recording session (id, started_at, ended_at, summary, chunk_count)
topics          — normalised topic strings, case-insensitive unique
session_topics  — M:N junction (session_id ↔ topic_id) with index on topic_id
action_items    — per-session tasks (task, owner, deadline, done)
key_decisions   — per-session decisions
```

### Write strategy

All writes go through a single `upsertSession` transaction. When a session's action items are refreshed by a new analysis cycle, the `done` state of existing items is preserved by matching on task text — checking off an item stays checked even if the AI rewrites the task list.

Topic associations are fully replaced on each upsert (delete junction rows, re-insert). Topic strings themselves are never deleted from the `topics` table, so filter chips remain stable across sessions.

### When sessions are saved

The Understanding engine saves the current session to SQLite:
- At the end of each Overall thread run (every 90 seconds)
- When the session is stopped

---

## 13. Font Size

The toolbar provides **A−** and **A+** buttons that scale all content text across every panel. The size steps from 10px to 18px in 1px increments. The preference is saved to `localStorage` and restored on next launch.

Affected text: transcript textarea, column headers, Understanding Panel body text, History Panel session list and detail view.

Not affected: toolbar buttons, badges, and other fixed UI chrome.

---

## 14. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer Process (React + Vite)                                    │
│                                                                     │
│  useAudioCapture ──► ScriptProcessor ──► 3s chunks ──► useTranscription │
│                            │                               │        │
│                        AudioMeter                    IPC: transcribe │
│                                                            │        │
│  UnderstandingPanel ◄── IPC events ◄────────────────────────────────┤
│  HistoryPanel        ◄── IPC: db-get-*                              │
│  TranscriptColumns   ◄── IPC: merge-chunk / merge-done              │
└────────────────────────────────────────────────────────────────────┘
                              │ IPC (contextBridge)
┌─────────────────────────────────────────────────────────────────────┐
│  Main Process (Electron / Node.js)                                  │
│                                                                     │
│  ipcMain                                                            │
│   ├── transcribe ──► nodejs-whisper (whisper.cpp) ──► text result   │
│   ├── push-transcript-chunk ──► live-understanding.ts               │
│   │     ├── Thread 1: Latest (every chunk, ~3-6s latency)           │
│   │     ├── Thread 2: Overall (every 90s, full re-read)             │
│   │     └── Thread 3: Response (every 10s, open questions)          │
│   ├── merge-transcripts ──► Ollama /api/chat (streaming)            │
│   ├── ask-question ──► Ollama /api/chat (Q&A)                       │
│   ├── db-* ──► better-sqlite3 (sessions.db)                         │
│   └── download-model / delete-model / toggle-model-selected         │
│                                                                     │
│  Ollama (localhost:11434) — auto-started if not running             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Docs index

All documentation lives in `/docs/`. Do not scatter docs to the repo root or inside `src/`.

| File | Contents |
|---|---|
| `app.md` | This file — complete app and architecture reference |
| `live-understanding.md` | Original design notes: context strategy, model evaluation, trigger logic |
| `transcriber_options.md` | STT backend options for Portuguese, ranked by effort |
| `ui_guidelines.md` | Accessibility contrast rules, design tokens, component conventions |
