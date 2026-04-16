# Roadmap

This document tracks planned features and improvements for Meeting Helper. For the full board view, see the [GitHub Project](https://github.com/users/allanhal/projects/1).

## Windows Support

### Phase 1 — Critical Blockers

- [ ] **Platform guards for macOS permission APIs** ([#1](https://github.com/allanhal/helper/issues/1))
  Wrap `systemPreferences` calls in `process.platform` guards, replace macOS-specific `x-apple.systempreferences:` with `ms-settings:` on Windows.

- [ ] **Cross-compile whisper binary for Windows** ([#2](https://github.com/allanhal/helper/issues/2))
  Compile `whisper-cli.exe` for Windows x64, bundle `.dll` instead of `.dylib`, update path resolution.

- [ ] **Replace lsof with cross-platform process lookup** ([#3](https://github.com/allanhal/helper/issues/3))
  `stopOllamaFast()` uses `lsof` (Unix-only). Add Windows path using `netstat -ano` or PowerShell.

### Phase 2 — Build & Validation

- [ ] **electron-builder config for Windows targets** ([#4](https://github.com/allanhal/helper/issues/4))
  Add NSIS installer + portable build, platform-conditional `extraResources`.

- [ ] **End-to-end testing on Windows** ([#7](https://github.com/allanhal/helper/issues/7))
  Full test pass: UI, audio capture, Whisper, Ollama, SQLite, installer lifecycle.

### Phase 3 — Polish & Distribution

- [ ] **Window chrome and UX adjustments** ([#5](https://github.com/allanhal/helper/issues/5))
  Conditional window config per platform, tray icon, quit/reopen lifecycle.

- [ ] **Release script and CI/CD for multi-platform builds** ([#6](https://github.com/allanhal/helper/issues/6))
  Update release scripts, upload Windows installer, landing page Windows download, multi-platform CI.

## Open Source & Community

- [ ] **Test suite** — Add unit and integration tests (currently typecheck-only verification)
- [ ] **Agent-agnostic documentation** — Adapt CLAUDE.md to be useful for any AI coding agent, not just Claude
- [ ] **App screenshots and feature gallery** — Professional screenshots, demo video, feature clips for landing page and README
- [ ] **Homebrew Cask** — Submit a Homebrew Cask formula for macOS distribution via `brew install --cask meeting-helper`

## Linux Support

- [ ] **Linux platform support** — Electron supports Linux; main blockers are `desktopCapturer` audio behavior on PulseAudio/PipeWire and packaging (AppImage/deb/rpm). Contributions welcome.

## Future Ideas

- [ ] **Speaker diarization** — Identify who is speaking in multi-person meetings
- [ ] **Meeting summaries** — Auto-generate structured meeting summaries at session end
- [ ] **Export formats** — Export transcripts as Markdown, PDF, SRT subtitles
- [ ] **Keyboard shortcuts** — Global hotkeys for start/stop recording
