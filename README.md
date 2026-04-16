# Meeting Helper

A macOS desktop app that captures microphone + system audio, transcribes locally with Whisper, and uses Ollama LLM for real-time Q&A detection. 100% private — no cloud, no API keys.

![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)
![CI](https://github.com/allanhal/helper/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-v1.0.17-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)

<!-- TODO: Add app screenshot -->

## Features

- **Dual audio capture** — microphone + system audio simultaneously via Web Audio API + Electron `desktopCapturer`
- **Local transcription** — Whisper.cpp via `nodejs-whisper`, fully on-device
- **Live Q&A detection** — Ollama detects questions in the transcript and generates helpful answers
- **Editable transcript** — edit freely before saving
- **Session history** — browse, search, and revisit past sessions (SQLite)
- **Multi-language** — English and Portuguese UI, auto-detects transcript language
- **Silence detection** — skips silent chunks (RMS threshold + high-pass filter), saves processing
- **Model management** — pull, select, and manage Ollama models from the UI
- **First-run wizard** — guides you through downloading the Whisper model on first launch

## Download

Download the latest DMG from [Releases](https://github.com/allanhal/helper/releases) or from [meetinghelper.vercel.app](https://meetinghelper.vercel.app).

On first run, the app downloads the `base.en` Whisper model (~142MB) automatically.

### macOS Permissions

Two system permissions are required:

1. **Microphone** — System Settings > Privacy & Security > Microphone
2. **Screen Recording** — System Settings > Privacy & Security > Screen Recording (required by macOS for `desktopCapturer`, even for audio-only capture)

The app prompts on first use.

## Requirements

- **macOS** 12+
- **8GB+ RAM** recommended
- **Ollama** installed and running ([ollama.com](https://ollama.com))

## Development

### Prerequisites

- **Node.js** 22+
- **pnpm**
- **Ollama** ([ollama.com](https://ollama.com))
- **Xcode Command Line Tools** (`xcode-select --install`)

### Quick Start

```bash
git clone https://github.com/allanhal/helper.git
cd helper
pnpm install
ollama pull gemma4:e4b
pnpm dev
```

> **Note:** `pnpm dev` does NOT hot-reload the Electron main process. After editing anything in `electron/`, you must fully restart `pnpm dev` for changes to take effect.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Shell | Electron 41 |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Build | Vite 8 |
| Transcription | nodejs-whisper (whisper.cpp) |
| AI Analysis | Ollama (localhost, any compatible model) |
| Database | SQLite via better-sqlite3 |
| Packaging | electron-builder |

## Project Structure

```
helper/
├── electron/                    # Main process (Node.js)
│   ├── main.ts                  # App init, IPC handlers, Ollama management
│   ├── preload.cjs              # Secure context bridge
│   ├── db.ts                    # SQLite database layer
│   ├── live-understanding.ts    # 2-thread Q&A engine (question + answer)
│   ├── ipc-channels.ts          # IPC message constants
│   └── logger.ts                # Logging
├── src/                         # Renderer process (React)
│   ├── App.tsx                  # Root component + state management
│   ├── i18n.tsx                 # Internationalization (EN/PT)
│   ├── components/
│   │   ├── Toolbar.tsx          # Record/Stop/Clear/Save + status dots
│   │   ├── TranscriptColumns.tsx # Editable live transcript
│   │   ├── UnderstandingPanel.tsx # Q&A display
│   │   ├── HistoryPanel.tsx     # Session history + search
│   │   ├── OllamaManager.tsx    # Model selection UI
│   │   ├── FirstRunDownload.tsx # Model download wizard
│   │   ├── AudioMeter.tsx       # Audio level visualization
│   │   └── ErrorBoundary.tsx    # Error handling
│   └── hooks/
│       ├── useAudioCapture.ts   # Mic + system audio + silence detection
│       ├── useTranscription.ts  # Whisper transcription pipeline
│       ├── useUnderstanding.ts  # Live LLM analysis
│       ├── useOllama.ts         # Ollama model management
│       ├── useModels.ts         # Whisper model state
│       ├── useSystemStats.ts    # RAM/disk monitoring
│       └── useStorage.ts        # localStorage persistence
├── landing/                     # Marketing page (Next.js, deployed to Vercel)
├── scripts/                     # Release automation
├── build/                       # macOS entitlements
├── electron-builder.yml
├── vite.config.ts
└── package.json
```

## How It Works

### Audio Pipeline

```
Mic (getUserMedia) ──┐
                     ├── ChannelMergerNode ── 3s chunks @ 16kHz
System (desktopCapturer) ─┘          │
                                     ▼
                          Silence detection (RMS > 0.015)
                                     │ (skip silent chunks)
                                     ▼
                          Write temp WAV → whisper-cli → text
                                     │
                                     ▼
                          Live transcript + append to session
```

### Q&A Engine

Two concurrent threads in `live-understanding.ts`:

| Thread | Trigger | What it does |
|--------|---------|-------------|
| **Question** | Every ~200 new chars | Scans recent transcript for questions being asked |
| **Answer** | When question detected | Analyzes last ~4000 chars to formulate a helpful answer |

Both call Ollama on `localhost:11434` with structured JSON output. Defensive handling for model quirks (markdown fences, think tags, timeouts).

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Vite dev server + Electron (no HMR for main process) |
| `pnpm build` | Full build (frontend + electron) |
| `pnpm build:electron` | Rebuild electron/ only |
| `pnpm dist` | Build + package DMG |
| `pnpm release` | Full release pipeline |
| `pnpm test` | Run tests (Vitest) |
| `pnpm lint` | ESLint |

## Roadmap

See the [project board](https://github.com/users/allanhal/projects/1) for planned features and current progress.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit issues, suggest features, and open pull requests. All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, please see [SECURITY.md](SECURITY.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

# Meeting Helper

Aplicativo de desktop para macOS que captura audio do microfone + sistema, transcreve localmente com Whisper e usa Ollama LLM para deteccao de perguntas e respostas em tempo real. 100% privado — sem nuvem, sem chaves de API.

![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)
![CI](https://github.com/allanhal/helper/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-v1.0.17-green.svg)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)

<!-- TODO: Adicionar screenshot do app -->

## Funcionalidades

- **Captura de audio dupla** — microfone + audio do sistema simultaneamente via Web Audio API + Electron `desktopCapturer`
- **Transcricao local** — Whisper.cpp via `nodejs-whisper`, totalmente no dispositivo
- **Deteccao de perguntas ao vivo** — Ollama detecta perguntas na transcricao e gera respostas uteis
- **Transcricao editavel** — edite livremente antes de salvar
- **Historico de sessoes** — navegue, pesquise e revisite sessoes anteriores (SQLite)
- **Multi-idioma** — interface em Ingles e Portugues, detecta automaticamente o idioma da transcricao
- **Deteccao de silencio** — pula trechos silenciosos (limiar RMS + filtro passa-alta), economiza processamento
- **Gerenciamento de modelos** — baixe, selecione e gerencie modelos Ollama pela interface
- **Assistente de primeira execucao** — guia voce no download do modelo Whisper na primeira execucao

## Download

Baixe o DMG mais recente em [Releases](https://github.com/allanhal/helper/releases) ou em [meetinghelper.vercel.app](https://meetinghelper.vercel.app).

Na primeira execucao, o app baixa o modelo Whisper `base.en` (~142MB) automaticamente.

### Permissoes do macOS

Duas permissoes do sistema sao necessarias:

1. **Microfone** — Ajustes do Sistema > Privacidade e Seguranca > Microfone
2. **Gravacao de Tela** — Ajustes do Sistema > Privacidade e Seguranca > Gravacao de Tela (exigido pelo macOS para `desktopCapturer`, mesmo para captura apenas de audio)

O app solicita na primeira utilizacao.

## Requisitos

- **macOS** 12+
- **8GB+ RAM** recomendado
- **Ollama** instalado e em execucao ([ollama.com](https://ollama.com))

## Desenvolvimento

### Pre-requisitos

- **Node.js** 22+
- **pnpm**
- **Ollama** ([ollama.com](https://ollama.com))
- **Xcode Command Line Tools** (`xcode-select --install`)

### Inicio Rapido

```bash
git clone https://github.com/allanhal/helper.git
cd helper
pnpm install
ollama pull gemma4:e4b
pnpm dev
```

> **Nota:** `pnpm dev` NAO faz hot-reload do processo principal do Electron. Apos editar qualquer arquivo em `electron/`, voce precisa reiniciar completamente o `pnpm dev` para que as alteracoes tenham efeito.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para o guia completo de contribuicao.

## Stack Tecnologica

| Camada | Tecnologia |
|--------|------------|
| Shell | Electron 41 |
| UI | React 19 + TypeScript |
| Estilo | Tailwind CSS 4 |
| Build | Vite 8 |
| Transcricao | nodejs-whisper (whisper.cpp) |
| Analise IA | Ollama (localhost, qualquer modelo compativel) |
| Banco de dados | SQLite via better-sqlite3 |
| Empacotamento | electron-builder |

## Estrutura do Projeto

```
helper/
├── electron/                    # Processo principal (Node.js)
│   ├── main.ts                  # Inicializacao, handlers IPC, gerenciamento Ollama
│   ├── preload.cjs              # Context bridge seguro
│   ├── db.ts                    # Camada de banco de dados SQLite
│   ├── live-understanding.ts    # Motor Q&A com 2 threads (pergunta + resposta)
│   ├── ipc-channels.ts          # Constantes de mensagens IPC
│   └── logger.ts                # Logging
├── src/                         # Processo renderer (React)
│   ├── App.tsx                  # Componente raiz + gerenciamento de estado
│   ├── i18n.tsx                 # Internacionalizacao (EN/PT)
│   ├── components/
│   │   ├── Toolbar.tsx          # Gravar/Parar/Limpar/Salvar + indicadores de status
│   │   ├── TranscriptColumns.tsx # Transcricao editavel ao vivo
│   │   ├── UnderstandingPanel.tsx # Exibicao de perguntas e respostas
│   │   ├── HistoryPanel.tsx     # Historico de sessoes + busca
│   │   ├── OllamaManager.tsx    # Interface de selecao de modelos
│   │   ├── FirstRunDownload.tsx # Assistente de download de modelos
│   │   ├── AudioMeter.tsx       # Visualizacao de nivel de audio
│   │   └── ErrorBoundary.tsx    # Tratamento de erros
│   └── hooks/
│       ├── useAudioCapture.ts   # Mic + audio do sistema + deteccao de silencio
│       ├── useTranscription.ts  # Pipeline de transcricao Whisper
│       ├── useUnderstanding.ts  # Analise LLM ao vivo
│       ├── useOllama.ts         # Gerenciamento de modelos Ollama
│       ├── useModels.ts         # Estado dos modelos Whisper
│       ├── useSystemStats.ts    # Monitoramento de RAM/disco
│       └── useStorage.ts        # Persistencia via localStorage
├── landing/                     # Pagina de marketing (Next.js, deploy no Vercel)
├── scripts/                     # Automacao de releases
├── build/                       # Entitlements do macOS
├── electron-builder.yml
├── vite.config.ts
└── package.json
```

## Como Funciona

### Pipeline de Audio

```
Mic (getUserMedia) ──┐
                     ├── ChannelMergerNode ── chunks de 3s @ 16kHz
System (desktopCapturer) ─┘          │
                                     ▼
                          Deteccao de silencio (RMS > 0.015)
                                     │ (pula trechos silenciosos)
                                     ▼
                          Grava WAV temporario → whisper-cli → texto
                                     │
                                     ▼
                          Transcricao ao vivo + adiciona a sessao
```

### Motor de Perguntas e Respostas

Duas threads concorrentes em `live-understanding.ts`:

| Thread | Gatilho | O que faz |
|--------|---------|-----------|
| **Pergunta** | A cada ~200 novos caracteres | Analisa a transcricao recente em busca de perguntas |
| **Resposta** | Quando uma pergunta e detectada | Analisa os ultimos ~4000 caracteres para formular uma resposta util |

Ambas chamam Ollama em `localhost:11434` com saida JSON estruturada. Tratamento defensivo para peculiaridades de modelos (code fences em markdown, tags think, timeouts).

## Scripts

| Comando | Finalidade |
|---------|------------|
| `pnpm dev` | Servidor dev Vite + Electron (sem HMR para processo principal) |
| `pnpm build` | Build completo (frontend + electron) |
| `pnpm build:electron` | Rebuild apenas do electron/ |
| `pnpm dist` | Build + empacotamento DMG |
| `pnpm release` | Pipeline completo de release |
| `pnpm test` | Executar testes (Vitest) |
| `pnpm lint` | ESLint |

## Roadmap

Veja o [quadro do projeto](https://github.com/users/allanhal/projects/1) para funcionalidades planejadas e progresso atual.

## Contribuindo

Contribuicoes sao bem-vindas! Leia [CONTRIBUTING.md](CONTRIBUTING.md) para diretrizes sobre como abrir issues, sugerir funcionalidades e enviar pull requests. Todos os contribuidores devem seguir nosso [Codigo de Conduta](CODE_OF_CONDUCT.md).

## Seguranca

Para reportar uma vulnerabilidade, consulte [SECURITY.md](SECURITY.md).

## Licenca

Apache 2.0 — veja [LICENSE](LICENSE).
