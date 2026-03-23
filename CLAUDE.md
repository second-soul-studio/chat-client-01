# Second Soul — Chat Client

## Project Overview

**Second Soul** is a browser-based AI chat client with persona management. It lives entirely in the frontend — no backend server. All data is persisted locally via IndexedDB.

- App source: `second-soul/`
- Package manager: **pnpm**
- Build tool: **Vite** with TypeScript
- Framework: **React 19** with JSX/TSX
- Styling: **Tailwind CSS v4**
- State: **Zustand** (`src/stores/appStore.ts`)
- Routing: **React Router v7**
- Local DB: **idb** (IndexedDB wrapper) via `src/services/db.ts`

## Architecture

```
src/
  components/     # UI components (pages, modals, chat bubbles, etc.)
  services/
    api.ts        # Streaming LLM API calls (OpenAI-compatible)
    db.ts         # IndexedDB persistence layer
    modelMeta/    # Provider model fetchers (OpenAI, OpenRouter, NanoGPT, Mistral, Ollama)
  stores/
    appStore.ts   # Central Zustand store — all app state
  types/
    index.ts      # Core types: Persona, Message, Chat, AppSettings
    providers.ts  # Provider, ModelConfig types
  hooks/          # Custom React hooks
```

## Key Concepts

- **Persona**: An AI character with its own system prompt, accent colour, model selection, and CoT (chain-of-thought) preferences.
- **Provider**: An API endpoint configuration (base URL + API key). Supports OpenAI-compatible APIs, OpenRouter, NanoGPT, Mistral, Ollama.
- **ModelConfig**: A fetched model record tied to a provider. Stored in IndexedDB. Synced via `modelMeta` fetchers.
- **ModelMeta fetchers**: Classes in `src/services/modelMeta/` that retrieve available models from each provider's API.
- **CoT / Thinking**: Some models support chain-of-thought. Personas have `thinkingEnabled` and `showThinking` flags.
- **TEE**: Trusted Execution Environment flag on certain models (NanoGPT-specific).

## Development

```bash
cd second-soul
pnpm install
pnpm dev        # starts Vite dev server
pnpm build      # TypeScript check + Vite build
```

## Conventions

- Path alias `@/` maps to `src/` (configured in `tsconfig.json` and `vite.config.ts`)
- No test suite currently in place
- No backend — all state is client-side (IndexedDB + Zustand)
- Docker: `Dockerfile` + nginx for production serving
