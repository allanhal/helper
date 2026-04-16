# Documentation

All project documentation lives in `/docs/`.

## Files

- [app.md](./app.md) — Complete app reference: all features, UI panels, audio pipeline, understanding engine, data layer, and architecture
- [live-understanding.md](./live-understanding.md) — Original design notes: context strategy, trigger logic, model evaluation, Ollama API patterns
- [transcriber_options.md](./transcriber_options.md) — Local STT backend options for Portuguese, ranked by effort
- [ui_guidelines.md](./ui_guidelines.md) — Accessibility contrast rules, design tokens, component conventions
- [todo.md](./todo.md) — Tracked technical debt and pending refactors

## Convention

Any new documentation — architecture decisions, setup guides, model evaluations, integration notes — goes in `/docs/` as a markdown file. Do not scatter docs across the repo root or inside `src/`.
