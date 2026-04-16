# Contributing to Meeting Helper

Thank you for your interest in contributing to Meeting Helper! This guide will help you get set up and submit your first pull request.

## Prerequisites

- **macOS 12+**
- **Node.js 22+** (use `.nvmrc`)
- **pnpm** (`npm install -g pnpm` or `corepack enable`) -- never use npm
- **Ollama** installed and running ([ollama.com](https://ollama.com))
- **Xcode Command Line Tools** (`xcode-select --install`) -- needed for `better-sqlite3` native compilation and `whisper.cpp` build

## Quick Start

```bash
git clone https://github.com/allanhal/helper.git
cd helper
pnpm install
ollama pull gemma4:e4b
pnpm dev
```

## Project Architecture

| Directory | Purpose |
|-----------|---------|
| `electron/` | Main process -- Node.js, SQLite, Ollama integration |
| `src/` | Renderer process -- React, UI components, hooks |
| `landing/` | Marketing page -- Next.js, deployed on Vercel |

**Important:** `pnpm dev` does **not** hot-reload the Electron main process. After editing any file in `electron/`, you must fully restart `pnpm dev` for changes to take effect.

## Code Style

- TypeScript strict mode
- ESLint -- run `pnpm lint`
- Tailwind CSS for all styling
- **pnpm only**, never npm

## Type Checking

Run these before submitting a PR:

- **Frontend (`src/`):** `pnpm tsc --noEmit`
- **Electron (`electron/`):** `pnpm tsc -p electron/tsconfig.json --noEmit`

## How to Submit a PR

1. Fork the repo
2. Create a branch from `main`
3. Keep PRs focused -- one feature or fix per PR
4. Ensure `pnpm lint` and type checks pass
5. Describe **what** changed and **why** in the PR description

## Important Quirks (for LLM/Model Work)

If you are working on the Ollama/LLM integration layer, refer to `CLAUDE.md` for detailed model-specific behaviors. Key highlights:

- `stripJsonFences()` handles models that wrap JSON output in markdown code fences (e.g., gemma4)
- `stripThinkTags()` handles models with chain-of-thought that emit `<think>` blocks (e.g., qwen3, deepseek-r1)
- Always use `?? null` for SQLite bound parameters -- `better-sqlite3` throws on `undefined`

## Roadmap

See the project board: [Meeting Helper Roadmap](https://github.com/users/allanhal/projects/1)

---

# Contribuindo com o Meeting Helper

Obrigado pelo interesse em contribuir com o Meeting Helper! Este guia vai ajudar a configurar seu ambiente e enviar seu primeiro pull request.

## Pre-requisitos

- **macOS 12+**
- **Node.js 22+** (use o `.nvmrc`)
- **pnpm** (`npm install -g pnpm` ou `corepack enable`) -- nunca use npm
- **Ollama** instalado e rodando ([ollama.com](https://ollama.com))
- **Xcode Command Line Tools** (`xcode-select --install`) -- necessario para compilacao nativa do `better-sqlite3` e build do `whisper.cpp`

## Inicio Rapido

```bash
git clone https://github.com/allanhal/helper.git
cd helper
pnpm install
ollama pull gemma4:e4b
pnpm dev
```

## Arquitetura do Projeto

| Diretorio | Finalidade |
|-----------|------------|
| `electron/` | Processo principal -- Node.js, SQLite, integracao com Ollama |
| `src/` | Processo de renderizacao -- React, componentes de UI, hooks |
| `landing/` | Pagina de marketing -- Next.js, deploy na Vercel |

**Importante:** `pnpm dev` **nao** faz hot-reload do processo principal do Electron. Apos editar qualquer arquivo em `electron/`, reinicie completamente o `pnpm dev` para que as mudancas tenham efeito.

## Estilo de Codigo

- TypeScript em modo strict
- ESLint -- execute `pnpm lint`
- Tailwind CSS para toda estilizacao
- **Somente pnpm**, nunca npm

## Verificacao de Tipos

Execute antes de enviar um PR:

- **Frontend (`src/`):** `pnpm tsc --noEmit`
- **Electron (`electron/`):** `pnpm tsc -p electron/tsconfig.json --noEmit`

## Como Enviar um PR

1. Faca um fork do repositorio
2. Crie uma branch a partir da `main`
3. Mantenha PRs focados -- uma feature ou correcao por PR
4. Garanta que `pnpm lint` e as verificacoes de tipo passem
5. Descreva **o que** mudou e **por que** na descricao do PR

## Detalhes Importantes (para trabalho com LLM/Modelos)

Se voce estiver trabalhando na camada de integracao com Ollama/LLM, consulte o `CLAUDE.md` para comportamentos especificos de cada modelo. Destaques:

- `stripJsonFences()` lida com modelos que envolvem a saida JSON em blocos de codigo markdown (ex: gemma4)
- `stripThinkTags()` lida com modelos que emitem blocos `<think>` de cadeia de pensamento (ex: qwen3, deepseek-r1)
- Sempre use `?? null` para parametros vinculados ao SQLite -- `better-sqlite3` lanca erro com `undefined`

## Roadmap

Veja o quadro do projeto: [Roadmap do Meeting Helper](https://github.com/users/allanhal/projects/1)
