# Changelog

All notable changes to Meeting Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.17] - 2026-04-16

### Added

- Initial open-source release
- Dual audio capture (microphone + system audio) via Web Audio API + Electron desktopCapturer
- Local transcription with Whisper.cpp via nodejs-whisper
- Live Q&A detection and answer generation powered by Ollama
- Editable transcript with real-time updates
- Session history with search (SQLite)
- Multi-language UI (English and Portuguese)
- Silence detection (RMS threshold + high-pass filter)
- Ollama model management from the UI
- First-run wizard for Whisper model download
- One-command release pipeline
- Landing page at meetinghelper.vercel.app
