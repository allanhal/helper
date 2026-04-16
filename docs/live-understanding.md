# Live Understanding — Feature Plan

> Real-time meeting intelligence: summarization, action items, topic detection, and Q&A
> running entirely locally via Ollama. No cloud, no cost.

---

## What It Does

As audio is transcribed, a parallel AI pipeline continuously reads the growing transcript and maintains a live structured understanding of the conversation:

| Output | Description |
|---|---|
| **Summary** | Rolling 2–3 paragraph summary of everything said so far |
| **Action Items** | Tasks with owner and deadline extracted as they're mentioned |
| **Topics** | List of subjects discussed, updated as conversation shifts |
| **Key Decisions** | Decisions made, not just discussed |
| **Q&A** | User can ask ad-hoc questions about the transcript at any time |

Two display modes:
- **Sidebar panel** — docked next to the transcript columns
- **Floating overlay** — transparent window that floats above any app, even fullscreen ones

---

## Architecture Decision: Context Strategy

### Chosen approach: Summary Compression (Refine pattern)

Instead of sending the full growing transcript on each analysis cycle (too long) or just the last chunk (loses history), we maintain a **structured state object** (`MeetingContext`) that is updated incrementally:

```typescript
interface MeetingContext {
  summary: string          // max ~200 words, updated each cycle
  action_items: ActionItem[]
  topics: string[]
  key_decisions: string[]
  last_updated_at: number
  chunk_count: number
}

interface ActionItem {
  task: string
  owner?: string
  deadline?: string
}
```

Each analysis cycle sends:
```
[MeetingContext: ~500 tokens]
  + [last 2 raw transcript chunks: ~200 tokens]   ← always keep recent raw text
  + [task prompt: ~200 tokens]
= ~900 tokens per call
```

This gives 50–80% token reduction vs full accumulation while keeping coherent history.
The last 2 raw chunks are always included verbatim — this lets the model correct
any drift in the rolling summary against ground truth.

**Why not full accumulation?** A 1-hour meeting at 150 words/min = ~9,000 words (~12k tokens).
LLMs suffer "lost-in-the-middle" degradation after ~60–70% of their context window. Quality
degrades after 45–60 minutes. The Refine pattern avoids this entirely.

**Why not sliding window?** Loses historical context — earlier decisions, recurring themes,
and action items disappear from view.

### Error drift prevention

- Hard 200-word limit on `summary` field (forces compression, prevents unbounded growth)
- Always include 2 raw chunks verbatim (ground truth anchor)
- Every 10 analysis cycles (~15–20 min): run a reconciliation call reading all chunk
  summaries from SQLite and producing a clean consolidated state
- Store all raw chunks in SQLite so full post-meeting analysis is always possible

---

## Architecture Decision: When to Trigger Analysis

### Chosen approach: Compound trigger (word count + silence debounce)

Do **not** trigger on every 30-second whisper chunk — that's only ~75 words,
too little for meaningful analysis and doubles the Ollama load.

```typescript
const WORD_THRESHOLD = 150     // ~60-90 seconds of speech
const CHUNK_THRESHOLD = 3      // fallback: 3 chunks max before forcing analysis
const SILENCE_DEBOUNCE_MS = 5000  // 5s silence = natural pause = trigger early

let pendingChunks: string[] = []
let silenceTimer: NodeJS.Timeout | null = null

function onNewTranscriptChunk(text: string) {
  pendingChunks.push(text)
  displayRawText(text)  // show in overlay immediately, no waiting for LLM

  clearTimeout(silenceTimer!)
  silenceTimer = setTimeout(triggerAnalysis, SILENCE_DEBOUNCE_MS)

  const wordCount = pendingChunks.join(' ').split(/\s+/).length
  if (wordCount >= WORD_THRESHOLD || pendingChunks.length >= CHUNK_THRESHOLD) {
    clearTimeout(silenceTimer!)
    triggerAnalysis()
  }
}
```

**Key UX principle:** Raw transcript text appears in the overlay **immediately** as chunks
arrive. The LLM enrichment (summary, action items, etc.) fills in asynchronously 3–8 seconds
later. The user always sees something, never a blank loading state.

---

## Architecture Decision: Model Choice

### Primary: `qwen3:4b` — Secondary: `qwen3:8b`

**Why Qwen3:**
- Native support for 29+ languages including Brazilian Portuguese (trained on PT-BR data)
- Ties for #1 on structured JSON output benchmarks (Apple Silicon M3 Ultra)
- 32k context window (vs Llama3.2's 8k)
- 60 tok/s on M1 Pro → 900-token analysis call completes in ~4–6 seconds
- On M3/M4: ~100–140 tok/s → 2–4 seconds per call
- Supports "thinking mode" — disable for real-time (latency), enable for post-meeting Q&A

**Avoid:**
- `gemma3` — documented gibberish bug on some Apple Silicon configs (Ollama issue #12360)
- `phi4` (14B) — too slow on M1/M2 for real-time
- `mistral-small` (22B) — excellent quality but ~12 tok/s on M1, too slow

**Setup:**
```bash
ollama pull qwen3:4b   # real-time analysis (~4-6s per call)
ollama pull qwen3:8b   # post-meeting deep analysis / Q&A
```

**Future:** Ollama MLX backend (v0.19+) gives 2–3x speedup on Apple Silicon.
When available, switch to MLX variant for ~2s real-time calls.

---

## Architecture Decision: Ollama API — Structured Output

### Single call with JSON schema (grammar-constrained decoding)

Ollama uses GBNF grammar-based constrained decoding — at each token step, invalid tokens
are masked so output is **always** syntactically valid JSON matching the schema.

```typescript
// POST http://localhost:11434/api/chat
{
  model: 'qwen3:4b',
  messages: [
    {
      role: 'system',
      content: 'Você é um assistente de reuniões. Analise a transcrição e retorne JSON válido.\n' +
               'Contexto anterior: {rollingContextJSON}'
    },
    {
      role: 'user',
      content: 'Nova transcrição (últimos 90 segundos):\n{newChunks}\n\n' +
               'Extraia summary, action_items, topics, key_decisions.'
    }
  ],
  stream: false,           // structured output, not streaming
  options: { temperature: 0.1 },   // low temp for schema adherence
  format: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      action_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            task: { type: 'string' },
            owner: { type: 'string' },
            deadline: { type: 'string' }
          },
          required: ['task']
        }
      },
      topics: { type: 'array', items: { type: 'string' } },
      key_decisions: { type: 'array', items: { type: 'string' } }
    },
    required: ['summary', 'action_items', 'topics', 'key_decisions']
  }
}
```

**Why single call vs parallel calls?**
Ollama queues requests sequentially to the same model instance. Parallel calls increase
per-request latency 20–40% each and compete for VRAM. One well-structured prompt
handles all 4 tasks simultaneously in the same time it takes for one parallel call.

**Exception:** User-initiated Q&A questions are separate calls — never batched with the
regular analysis cycle.

---

## Architecture Decision: Floating Overlay (Electron)

### Electron BrowserWindow configuration

```typescript
const overlayWindow = new BrowserWindow({
  width: 380,
  height: 600,
  transparent: true,
  frame: false,
  hasShadow: false,
  resizable: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  type: 'panel',             // macOS panel type — floats without stealing focus
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.cjs')
  }
})

// Required for floating over fullscreen apps:
app.dock.hide()              // must be called before setAlwaysOnTop
overlayWindow.setAlwaysOnTop(true, 'screen-saver')   // 'screen-saver' level required
overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
```

**Window level note:** `'screen-saver'` is the highest practical level on macOS.
Alternatives: `'floating'` (below Dock, won't overlay fullscreen), `'pop-up-menu'`
(fallback if screen-saver has issues on some macOS versions).

### Click-through (pass mouse events to apps below)

```typescript
// Overlay is click-through by default
overlayWindow.setIgnoreMouseEvents(true, { forward: true })

// Re-enable on hover (renderer sends IPC on mouseenter/mouseleave)
ipcMain.on('overlay-enable-mouse', () =>
  overlayWindow.setIgnoreMouseEvents(false))
ipcMain.on('overlay-disable-mouse', () =>
  overlayWindow.setIgnoreMouseEvents(true, { forward: true }))
```

### Sidebar panel
The sidebar is a standard panel docked inside the main app window (a flex column
next to the TranscriptColumns area), not a separate BrowserWindow.

---

## Data Layer: SQLite

All transcript chunks, analysis results, and meeting sessions are stored in SQLite
(via `better-sqlite3`) for:
- Post-meeting full re-analysis
- Reconciliation calls (every 10 cycles)
- Q&A against the complete transcript, not just the rolling summary
- Session history / search

**Schema:**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER,
  ended_at INTEGER,
  title TEXT
);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  model TEXT,
  text TEXT,
  timestamp INTEGER
);

CREATE TABLE analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  chunk_count INTEGER,
  context_json TEXT,   -- full MeetingContext JSON
  timestamp INTEGER
);
```

---

## Implementation Plan (Phases)

### Phase 1 — Core pipeline
1. `electron/live-understanding.ts` — analysis engine
   - `MeetingContext` state management
   - Trigger logic (word count + silence debounce)
   - Ollama `/api/chat` call with JSON schema
   - Incremental state update
2. New IPC channels:
   - `start-understanding-session` / `stop-understanding-session`
   - `push-transcript-chunk` (feeds chunks into the pipeline)
   - `get-meeting-context` (returns current `MeetingContext`)
   - `ask-question` (ad-hoc Q&A)
   - Push event: `understanding-update` (streams updated context to renderer)
3. SQLite integration (`better-sqlite3`) — sessions + chunks + analysis tables
4. Hook into existing transcription flow: when `transcribe` IPC returns results,
   also forward each chunk to the understanding pipeline

### Phase 2 — Sidebar UI
1. `src/components/UnderstandingPanel.tsx`
   - Tabs: Summary | Action Items | Topics | Ask
   - Live-updating as `understanding-update` events arrive
   - Action items checkable (mark as done)
   - Q&A: text input + response area (streaming)
2. Toggle button in main toolbar
3. Docked as a right-side flex panel next to TranscriptColumns

### Phase 3 — Floating Overlay
1. `electron/overlay-window.ts` — BrowserWindow lifecycle
   - Create on demand, remember last position
   - `screen-saver` level + `visibleOnFullScreen`
   - Click-through with mouseenter/mouseleave IPC toggle
2. `src/overlay/` — separate Vite entry point for the overlay window
   - Compact view: summary + action items count + current topic
   - Draggable, resizable
   - Minimize to a small pill (just current topic)
3. Toolbar button to launch overlay; main app tracks if overlay is open

### Phase 4 — Model testing framework
1. In-app model comparison: run analysis on the same transcript snippet with
   multiple Ollama models, display results side-by-side
2. Metrics: response time, action item accuracy, summary coherence
3. Recommended models list in settings (pre-populated with qwen3:4b etc.)

---

## Reference Projects

| Project | Why Relevant |
|---|---|
| **Meetily** (github.com/Zackriya-Solutions/meetily) | Closest open-source equivalent: Whisper.cpp + Ollama + local SQLite, macOS, MIT |
| **LLM×MapReduce** (arxiv 2410.09342) | Structured information protocol for multi-chunk analysis |
| **Google ADK Context Compaction** | Production pattern for incremental context compression |
| **lintware/tool-calling-benchmark** | Apple Silicon structured output benchmarks by model |

---

## Open Questions (discuss before Phase 1)

1. **Context of meetings** — meetings, interviews, lectures, or calls? Affects prompt design.
   Action items make sense in meetings; key quotes matter more in interviews.
2. **Language setting** — always Portuguese, auto-detect, or user-selectable?
3. **Overlay position persistence** — per-session or global last-position?
4. **Q&A scope** — answer from transcript only, or let model use general knowledge too?
5. **Model testing** — which specific transcripts/scenarios to use for Phase 4 benchmarks?
