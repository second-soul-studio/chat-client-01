# Design: Transparent Proxy Routing via `proxiedFetch`

**Date:** 2026-03-24
**Status:** Approved

## Problem

Some external APIs (Brave Search, Ollama Cloud) enforce strict CORS policies that block direct browser requests. The current codebase handles this inconsistently:

- `api.ts` manually sets `X-Target-URL: https://ollama.com` for `ollama-cloud` providers, and requires the user to enter the proxy URL as `provider.baseUrl`.
- `braveSearch.ts` has a `proxyBase` parameter that defaults to `''` (same-origin), meaning in development the request hits Vite (port 5173) instead of the proxy (port 9080), causing a 404.

There is no single place that decides whether a request should be proxied.

## Goal

A transparent proxy routing layer: all `fetch` calls in the app go through a single `proxiedFetch` wrapper. The wrapper automatically routes requests to the CORS proxy when the target domain requires it, based on a static developer-maintained config file.

## Architecture

### New: `src/config/proxyRoutes.json`

A static JSON file listing domains that require proxy routing:

```json
[
  { "domain": "https://ollama.com", "requiresProxy": true },
  { "domain": "https://api.search.brave.com", "requiresProxy": true }
]
```

Maintained by developers. Adding a new provider that has CORS restrictions means adding one entry here.

### New: `src/services/proxiedFetch.ts`

A drop-in replacement for `fetch` with automatic proxy routing:

```
proxiedFetch(url: string | URL, init?: RequestInit): Promise<Response>
```

**Routing logic:**
1. Extract `scheme + host` from the target URL.
2. Look up the domain in `proxyRoutes.json`.
3. If `requiresProxy: true`:
   - Rewrite the URL to `${VITE_PROXY_URL}${pathname}${search}`.
   - Inject `X-Target-URL: <original domain>` into the request headers.
4. Otherwise: delegate directly to `fetch` unchanged.

**`VITE_PROXY_URL`** is read from `import.meta.env`. When empty (production with nginx), proxied requests go to the same origin — nginx is expected to forward them to the Go proxy service internally.

### Environment Configuration

**`.env.local` (development):**
```
VITE_PROXY_URL=http://localhost:9080
```

**Production (Docker Compose):** `VITE_PROXY_URL` is set to the internal hostname of the proxy service (e.g. `http://proxy:8080`), injected at build time or via nginx environment substitution.

### Changes to Existing Files

**`src/services/api.ts`**
- All `fetch(...)` calls replaced with `proxiedFetch(...)`.
- Manual `X-Target-URL: https://ollama.com` header removed from the `ollama-cloud` branch of `sendMessage` and `testProvider` — the wrapper handles this automatically.
- The `ollama-cloud` adapter type is retained for its other responsibilities: injecting `think: true` into the request body for CoT, and normalising the base URL to include `/v1`.

**`src/services/tools/braveSearch.ts`**
- Request URL changed from `${proxyBase}/res/v1/web/search?...` to `https://api.search.brave.com/res/v1/web/search?...`.
- `proxyBase` parameter removed entirely.
- Explicit `X-Target-URL` header removed.
- `fetch(...)` replaced with `proxiedFetch(...)`.

## Breaking Change

Existing `ollama-cloud` providers have `baseUrl` set to the proxy URL (e.g. `http://localhost:9080`). After this change, `baseUrl` must be set to the actual upstream URL: `https://ollama.com`. This is a one-time manual update in the provider settings UI — no automated migration is needed.

## Data Flow (after change)

```
braveSearch.ts
  proxiedFetch("https://api.search.brave.com/res/v1/web/search?q=...")
    → domain match → rewrite to http://localhost:9080/res/v1/web/search?q=...
    → X-Target-URL: https://api.search.brave.com
      → Go proxy → https://api.search.brave.com/res/v1/web/search?q=...

api.ts (ollama-cloud)
  proxiedFetch("https://ollama.com/v1/chat/completions", { body: ..., think: true })
    → domain match → rewrite to http://localhost:9080/v1/chat/completions
    → X-Target-URL: https://ollama.com
      → Go proxy → https://ollama.com/v1/chat/completions

api.ts (openai / anthropic / local ollama)
  proxiedFetch("https://api.openai.com/v1/chat/completions", ...)
    → no domain match → fetch directly (unchanged)
```

## What Is Not Changed

- The Go proxy backend (`backend/main.go`) requires no changes.
- All other providers (OpenAI, Anthropic, local Ollama, OpenRouter, etc.) are unaffected.
- `compose.yml` already has the correct `ALLOWED_UPSTREAM_URLS` for both domains.
- No changes to routing, store, or UI components.
