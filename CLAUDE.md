# Helper — Electron Meeting Assistant

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS (Vite, `src/`)
- **Backend**: Electron main process + TypeScript (`electron/`)
- **Database**: SQLite via `better-sqlite3`
- **Package manager**: `pnpm` — always use `pnpm`, never `npm`
- **Local AI**: Ollama (`localhost:11434`) — no cloud dependency

## Build

```bash
pnpm dev              # starts Vite + builds electron + launches app
pnpm build:electron   # compile electron/ only (faster, for main process changes)
pnpm build            # full build (frontend + electron)
```

`pnpm dev` does NOT hot-reload the Electron main process. After editing anything in `electron/`, you must **fully restart `pnpm dev`** for changes to take effect.

## TypeScript Check After Every Edit

- Electron files (`electron/`): `pnpm tsc -p electron/tsconfig.json --noEmit`
- Frontend files (`src/`): `pnpm tsc --noEmit`

A PostToolUse hook in `.claude/settings.json` runs this automatically after each edit.

---

## Ollama / LLM Integration

### Architecture

`electron/live-understanding.ts` runs 2 concurrent Q&A threads:

| Thread ID  | Label    | Trigger | Purpose |
|------------|----------|---------|---------|
| `question` | Question | Every ~200 new chars of transcript | Detect questions in recent transcript |
| `answer`   | Answer   | When question thread detects a new question | Generate helpful answer using last ~4000 chars of context |

Both threads call Ollama at `localhost:11434` and use `ollamaChatStructured` (JSON schema mode) or `ollamaChat` (plain text). Character-based triggers (not time-based intervals).

### Model-Specific Behaviors & Fallbacks

Different models have different quirks. The code defensively handles all of them:

#### Markdown code fences around JSON (`gemma4`, some `llama` variants)

Some models ignore the `format` schema and wrap their JSON in markdown:
```
```json
{ "summary": "...", ... }
```
```

**Fix**: `stripJsonFences()` in `live-understanding.ts` strips ` ```json ` and ` ``` ` before `JSON.parse`. Applied in `ollamaChatStructured` response handling.

#### Structured output failures / retries

When a model returns garbage, errors, or doesn't respect `format`, catch blocks trigger `scheduleRetry()` with exponential backoff (5s → 15s → 30s, max 3 attempts). On retry, the thread tries again — if the model eventually respects the format, it recovers.

#### Extended thinking / `<think>` tags (`qwen3`, `deepseek-r1`)

Models with chain-of-thought emit `<think>...</think>` blocks before the actual response.

**Fix**: `stripThinkTags()` removes them. `think: false` is also sent in the request options to disable extended thinking where supported.

#### Slow responses / timeouts

Large models on low-RAM machines can take >60s to respond.

**Fix**: 60s timeout per request (`req.setTimeout(60_000, ...)`). On timeout, thread errors and retries with backoff. Answer thread uses last ~4000 chars of context (`ANSWER_CONTEXT_CHARS`).

### Adding Support for a New Model

When a new model behaves unexpectedly:

1. **Check the error dot tooltip** — hover over the red thread dot to see the raw error
2. **Check the terminal** — `pnpm dev` terminal shows `[live-understanding] <thread> thread error: <msg>`
3. **Common issues and where to fix**:

| Symptom | Likely cause | Fix location |
|---------|-------------|--------------|
| `Model returned invalid JSON` | Markdown fences or garbage output | `stripJsonFences()` in `ollamaChatStructured` |
| `Too few parameter values` | Null/invalid data reaching SQLite | Ensure `?? null` for all bound params in `db.ts` |
| `Ollama timed out` | Model too slow for context size | Reduce `ANSWER_CONTEXT_CHARS` or truncate input earlier |
| `Model not found` | Wrong model name | Update via UI model selector |
| Thread stays red after retries | Persistent model error | Check Ollama logs: `ollama logs` |

### Error Message Mapping

The `friendlyError()` function in `live-understanding.ts` maps raw errors to readable labels:

| Raw error contains | Displayed as |
|--------------------|-------------|
| `ECONNREFUSED` | `Ollama not running` |
| `timeout` | `Ollama timed out` |
| `not valid JSON` / `Unexpected token` / `SyntaxError` | `Model returned invalid JSON` |
| `model` + `not found` | `Model not found` |
| `ENOTFOUND` / `ECONNRESET` | `Network error` |
| anything else | Raw message, truncated to 60 chars |

---

## Database

SQLite via `better-sqlite3`. All writes go through `upsertSession` in `electron/db.ts`.

**Important**: `better-sqlite3` throws `"Too few parameter values were provided"` if any bound parameter is `undefined` (not `null`). Always use `?? null` when a field may be missing, and guard against undefined IDs before calling `.run()`.

**DMG must ship empty**: The built DMG must NEVER contain user data — no `.db` files, no `.wav` audio, no transcription text, no config JSON. All user data lives in `app.getPath('userData')` at runtime, never in the project tree or build output. If adding new data files or storage, always write to `userData` or `temp` paths, never to the app bundle. Before any release, verify no data files leaked into `dist/`, `dist-electron/`, or `release/`.

---

## Versioning (SemVer)

This project follows [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`.

| Level | When to use | Examples |
|-------|-------------|---------|
| **PATCH** (`X.X.+1`) | Bug fixes, typos, dependency bumps, build fixes, config tweaks | Fix crash on empty transcript, update Tailwind, fix DMG packaging |
| **MINOR** (`X.+1.0`) | New features, new UI panels, new model support — backward-compatible | Add action-items detection, add Portuguese UI, support new Ollama model |
| **MAJOR** (`+1.0.0`) | Breaking changes that require user action or data migration | DB schema migration, config format change, drop macOS 13 support |

### Agent Rules for Version Bumps

- **Default to PATCH** for any fix, refactor, or build improvement.
- **Use MINOR** only when adding user-visible functionality.
- **Use MAJOR** only when existing users would need to take action (re-import data, update config, etc.).
- When in doubt, ask. Over-bumping minor/major is worse than under-bumping.
- The bump happens via `scripts/bump-version.mjs`:
  ```bash
  node scripts/bump-version.mjs              # patch (default)
  node scripts/bump-version.mjs --minor      # new feature
  node scripts/bump-version.mjs --major      # breaking change
  ```
- `pnpm dist` calls bump-version automatically (defaults to patch).
- To override for a release: edit the `dist` script or call bump-version manually before `pnpm build`.

---

## Release & Distribution

### One-Command Release

```bash
source landing/.env.local && pnpm release
```

This runs `scripts/release.mjs` which does everything:
1. Bumps patch version automatically
2. Builds frontend + electron
3. Packages DMG via electron-builder
4. Uploads DMG to Vercel Blob (versioned filename, e.g. `Meeting Helper-1.0.15-arm64.dmg`)
5. Updates landing page `DOWNLOAD_URL` and version badges
6. Commits and pushes (triggers Vercel auto-deploy to meetinghelper.vercel.app)

### Prerequisites

- **Blob token**: `cd landing && vercel env pull .env.local --environment production`
- The `.env.local` file contains `BLOB_READ_WRITE_TOKEN` needed for uploads

### Manual Steps (if needed)

```bash
pnpm dist                                     # build + package DMG only (no upload)
source landing/.env.local && node scripts/upload-dmg.mjs "release/Meeting Helper-<ver>-arm64.dmg"
```

`scripts/upload-dmg.mjs` deletes old DMGs from blob, uploads with versioned filename, and updates landing page DOWNLOAD_URL automatically.

**Note**: Releases are also available on [GitHub Releases](https://github.com/allanhal/helper/releases). The release script publishes to Vercel Blob for the landing page download link, but tagged releases on GitHub serve as an additional distribution channel and provide release notes history.

---

## Landing Page Rules

- **Never reference the GitHub repo** — the repo is private. No links, mentions, or references to GitHub anywhere on the landing page (`landing/`). This includes URLs, "View on GitHub" buttons, "Open Source" badges, footer links, and alt text.
- Download links should point to the download section (`#download`) or a direct file URL (e.g. Vercel Blob), never to GitHub Releases.

<!-- TODO: When the repo goes public, revisit these rules — the landing page should then link to the GitHub repo and may reference open source status. Until then, keep the rules above strictly enforced. -->

---

## Bug Fix Rules

1. **Always verify end-to-end** after fixing a bug: DB layer → API/emitter → UI. Fixing one layer and missing another is a common failure pattern in this codebase.
2. **Never remove fallback behavior** — add alternatives alongside existing code, don't replace.
3. **Defensive data handling at model output boundaries** — never trust model JSON structure. Validate shape and types before using data anywhere (especially DB writes).

---

## Open Source

- **License**: Apache 2.0 (see `LICENSE` in the repo root)
- **Roadmap**: https://github.com/users/allanhal/projects/1
- **Contributing**: External contributions must follow the guidelines in `CONTRIBUTING.md`. Review that file before submitting or reviewing PRs.
- **PR review checklist**: When reviewing pull requests, verify that CI passes — this includes lint, typecheck, and build steps.
- **Testing**: Automated tests are on the roadmap. Currently the project relies on typecheck-only verification (`pnpm tsc --noEmit`). When tests are added, this section should be updated with run commands and coverage expectations.
