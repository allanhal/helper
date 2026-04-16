# Transcriber Options for Portuguese STT

Ordered by ease of adoption. Current implementation uses `nodejs-whisper` with the `small` model.

---

## Option 1: `nodejs-whisper` + `large-v3-turbo` ← try this first

**Effort:** 2 lines changed. No new dependencies.

Change in `electron/main.ts`:

```ts
const result = await nodewhisper(tmpPath, {
  modelName: 'large-v3-turbo',
  autoDownloadModelName: 'large-v3-turbo',
  removeWavFileAfterTranscription: true,
  withCuda: false,
  whisperOptions: {
    outputInText: true,
    language: 'pt',
  },
})
```

- **Model size:** ~1.5 GB (downloaded automatically on first run)
- **Quality:** ~2× fewer errors vs `small` for Portuguese — much better with accents, proper nouns, and punctuation
- **GPU:** No Metal — runs on Apple Silicon CPU (ARM NEON), still fast
- **Quantized alternative:** `large-v3-turbo-q5_0` (~547 MB) must be downloaded manually from HuggingFace and passed as a file path instead of `autoDownloadModelName`

---

## Option 2: `smart-whisper` + `large-v3-turbo` (Metal GPU)

**Effort:** New package + manual model download + integration rewrite.

```bash
pnpm add smart-whisper
```

Download model manually:

```bash
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" \
  -o models/ggml-large-v3-turbo.bin
```

Usage in `electron/main.ts`:

```ts
import { Whisper } from 'smart-whisper'

const whisper = new Whisper('/path/to/ggml-large-v3-turbo.bin', { gpu: true })
const task = await whisper.transcribe(pcmFloat32Array, { language: 'pt' })
const segments = await task.result
await whisper.free()
```

- **Model size:** ~1.5 GB (manual download)
- **Quality:** Same as Option 1 (same underlying model)
- **GPU:** Metal acceleration on Apple Silicon — faster inference than Option 1
- **Note:** `{ gpu: true }` enables Metal automatically on macOS. Passes raw PCM Float32Array directly — no WAV file needed.

---

## Option 3: MLX Whisper via local Python server (fastest, most setup)

**Effort:** Python environment required. Not practical for distribution unless Python is bundled.

```bash
pip install mlx-whisper mlx-openai-server
mlx-openai-server launch --model-type whisper --model-path mlx-community/whisper-large-v3-turbo
```

Call from Electron:

```ts
const formData = new FormData()
formData.append('file', audioBlob, 'audio.wav')
formData.append('language', 'pt')

const res = await fetch('http://localhost:8000/v1/audio/transcriptions', {
  method: 'POST',
  body: formData,
})
const { text } = await res.json()
```

- **Model size:** ~1.5 GB (downloaded via HuggingFace on first run)
- **Quality:** Same model, same quality
- **GPU:** Uses Apple MLX framework — fastest option on Apple Silicon (~1.0s per chunk vs ~1.2s for whisper.cpp + CoreML)
- **Tradeoff:** Requires Python 3 + `mlx` installed on the machine

---

## Options ruled out

| Option | Reason skipped |
|---|---|
| `faster-whisper` | No Node.js binding; slower than whisper.cpp on Apple Silicon (no Metal support) |
| Distil-Whisper (official) | English-only |
| Parakeet (NVIDIA) | English-only |
| Cloud APIs (OpenAI, Deepgram) | Not local |

---

## Comparison summary

| Option | npm install | Metal GPU | Portuguese | Effort |
|---|---|---|---|---|
| `nodejs-whisper` + `large-v3-turbo` | Already installed | No (CPU ARM) | Yes | 2 lines |
| `smart-whisper` + `large-v3-turbo` | `pnpm add smart-whisper` | Yes | Yes | Low |
| MLX via local Python server | Python setup required | Yes (MLX/ANE) | Yes | High |
