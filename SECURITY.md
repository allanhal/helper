# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Meeting Helper, please report it responsibly:

1. **Use GitHub's private vulnerability reporting feature** on this repository. Navigate to the "Security" tab and select "Report a vulnerability."
2. **Do NOT open public issues** for security vulnerabilities. Public disclosure before a fix is available puts users at risk.
3. Provide as much detail as possible: steps to reproduce, affected versions, and potential impact.

### Response Timeline

- **Acknowledgment**: within 48 hours of your report.
- **Critical issues**: patch released within 14 days.
- **Non-critical issues**: addressed in the next scheduled release.

We will keep you informed of progress and credit you in the release notes (unless you prefer to remain anonymous).

## Scope

The following are considered valid security concerns for this project:

- **Data leaks** — transcript, audio, or session data exposed to unauthorized processes or written to unexpected locations.
- **IPC vulnerabilities** — exploitation of Electron IPC channels to access privileged main-process functionality from the renderer.
- **SQLite injection** — crafted input that manipulates database queries via the `better-sqlite3` layer.
- **Arbitrary code execution** — malformed Ollama model responses that lead to code execution outside the expected sandbox.
- **Privilege escalation** — any path that allows the renderer process or external input to gain main-process or OS-level privileges.
- **Insecure file permissions** — user data (audio, transcripts, database) stored with overly permissive file system permissions.

## Out of Scope

The following are **not** considered security vulnerabilities for this project:

- **Ollama model quality or accuracy** — hallucinations, wrong answers, or poor transcription quality are not security issues.
- **Local data access by the user themselves** — Meeting Helper is a local-only application by design. The user is expected to have full access to their own data.
- **Bugs that require physical access** to the machine — if an attacker already has physical access, the threat model is outside this application's control.
- **Issues in Ollama itself** — vulnerabilities in the Ollama runtime or models should be reported upstream to the [Ollama project](https://github.com/ollama/ollama).

## Security Design Principles

Meeting Helper is built with a local-first, privacy-focused architecture:

- **100% local processing** — no cloud services, no API keys, no telemetry, no analytics. Audio and transcription never leave your machine.
- **Local data storage** — audio recordings, transcripts, and session data are stored in `app.getPath('userData')`, never in the app bundle or build output.
- **Electron security hardening**:
  - `contextIsolation` enabled — renderer code cannot access Node.js or Electron internals directly.
  - `sandbox` enabled — renderer processes run with restricted OS-level permissions.
  - `nodeIntegration` disabled in the renderer — no direct access to Node.js APIs from frontend code.
- **Defensive data handling** — all model output is validated and sanitized before use, especially before database writes. Malformed JSON from Ollama is caught, stripped of artifacts (code fences, think tags), and rejected if it cannot be safely parsed.
