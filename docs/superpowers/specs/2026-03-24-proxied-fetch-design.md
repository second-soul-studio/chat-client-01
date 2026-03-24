# Design: Transparent Proxy Routing via `proxiedFetch`

**Date:** 2026-03-24
**Status:** Approved

## Problem

Some external APIs (Brave Search, Ollama Cloud) enforce strict CORS policies that block direct browser requests. The current codebase handles this inconsistently:

- `api.ts` manually sets `X-Target-URL: https://ollama.com` for `ollama-cloud` providers, and requires the user to enter the proxy URL as `provider.baseUrl`. This applies to both `sendMessage` and `testProvider`.
- `braveSearch.ts` has a `proxyBase` parameter that defaults to `''` (same-origin), meaning in development the request hits Vite (port 5173) instead of the proxy, causing a 404.

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

Maintained by developers. Adding a new provider with CORS restrictions means adding one entry here. The `domain` field is the exact origin (`scheme + host`, no trailing slash) — it is used for both matching and as the value of the `X-Target-URL` header sent to the Go proxy.

Matching is **exact string equality** against the origin extracted from the request URL. Subdomains are not matched automatically.

### New: `src/services/proxiedFetch.ts`

A drop-in replacement for `fetch` with automatic proxy routing:

```
proxiedFetch(url: string | URL, init?: RequestInit): Promise<Response>
```

**Routing logic:**
1. Extract the origin (`scheme + host`) from the target URL.
2. Look up the origin in `proxyRoutes.json`.
3. If `requiresProxy: true`:
   - Rewrite the URL to `${window.__ENV__.PROXY_URL}${pathname}${search}`.
   - Inject `X-Target-URL: <domain from config>` into the request headers.
   - The `domain` value from config is exactly what the Go proxy needs: it appends `RequestURI` to it to build the upstream URL (`main.go:79`).
4. Otherwise: delegate directly to `fetch` unchanged.

**`PROXY_URL`** is read at runtime from `window.__ENV__.PROXY_URL` — not baked into the bundle at build time.

### Environment Configuration

`PROXY_URL` is a **runtime** environment variable. The app reads it from `window.__ENV__.PROXY_URL`, which is injected via a `/config.js` file served by the web server. This makes the Docker image reusable without rebuilding — each deployment sets its own proxy URL.

**How `config.js` is produced:**

- **Production (Docker):** A `frontend/docker-entrypoint.sh` generates `/usr/share/nginx/html/config.js` at container start from the `$PROXY_URL` environment variable, then hands off to nginx.

  ```sh
  #!/bin/sh
  set -e
  cat > /usr/share/nginx/html/config.js <<EOF
  window.__ENV__ = { PROXY_URL: "${PROXY_URL:-}" };
  EOF
  exec nginx -g 'daemon off;'
  ```

  `frontend/Dockerfile` changes `CMD ["nginx", ...]` to `ENTRYPOINT ["/docker-entrypoint.sh"]`.

- **Development (Vite):** `public/config.js` is served as a static file by Vite. This file is gitignored. A `public/config.js.example` is committed as a template:

  ```js
  window.__ENV__ = { PROXY_URL: 'http://localhost:9080' };
  ```

  Developers copy `config.js.example` → `config.js` and set their local proxy port.

**`frontend/index.html`:** Add `<script src="/config.js"></script>` as the first script in `<head>` (before the module entry point), so `window.__ENV__` is available before any app code runs.

**`compose.yml`:** Frontend service receives `PROXY_URL` as a runtime environment variable — no build args needed:

```yaml
frontend:
  build: ./frontend
  ports:
    - "80:80"
  environment:
    - PROXY_URL=https://your-proxy-host:8081

proxy:
  build: ./backend
  ports:
    - "8081:8080"
```

### Changes to Existing Files

**`src/services/api.ts`**
- All `fetch(...)` calls replaced with `proxiedFetch(...)` — this includes both `sendOpenAIMessage` and `testProvider`.
- Manual `X-Target-URL: https://ollama.com` header removed from the `ollama-cloud` branch in both `sendMessage` and `testProvider` — the wrapper handles this automatically by matching the origin against `proxyRoutes.json`.
- The `ollama-cloud` adapter type is retained for its other responsibilities: injecting `think: true` into the request body for CoT, and normalising the base URL to include `/v1`.

**`src/services/tools/braveSearch.ts`**
- Request URL changed from `${proxyBase}/res/v1/web/search?...` to `https://api.search.brave.com/res/v1/web/search?...`.
- `proxyBase` parameter removed.
- Explicit `X-Target-URL: https://api.search.brave.com` header removed — `proxiedFetch` injects this automatically from the `domain` value in `proxyRoutes.json`. Removing the manual header is safe because the wrapper guarantees it.
- `fetch(...)` replaced with `proxiedFetch(...)`.
- **Testability:** the existing `proxyBase` seam is removed. Tests mock `proxiedFetch` directly (vi.mock) instead. The `mapBraveResults` unit tests are unaffected.

**`src/services/modelMeta/OllamaFetcher.ts`**
- Both `fetch(...)` calls (list models, fetch model detail) replaced with `proxiedFetch(...)`.
- The `upstreamUrl` constructor parameter removed.
- The manual `X-Target-URL` header injection (lines 29–31) removed — `proxiedFetch` handles this automatically when the provider's `baseUrl` is `https://ollama.com`.

**`src/services/modelMeta/registry.ts`**
- `'ollama-cloud': new OllamaFetcher('https://ollama.com')` → `new OllamaFetcher()` (no argument).

## Breaking Change

Existing `ollama-cloud` providers have `baseUrl` set to the proxy URL (e.g. `http://localhost:9080`). After this change, `baseUrl` must be set to the actual upstream URL: `https://ollama.com`. This is a one-time manual update in the provider settings UI — no automated migration is needed.

## Data Flow (after change)

```
braveSearch.ts
  proxiedFetch("https://api.search.brave.com/res/v1/web/search?q=...")
    → origin match → rewrite to http://localhost:9080/res/v1/web/search?q=...
    → X-Target-URL: https://api.search.brave.com (from proxyRoutes.json domain field)
      → Go proxy → https://api.search.brave.com/res/v1/web/search?q=...

api.ts (ollama-cloud)
  proxiedFetch("https://ollama.com/v1/chat/completions", { body: ..., think: true })
    → origin match → rewrite to http://localhost:9080/v1/chat/completions
    → X-Target-URL: https://ollama.com
      → Go proxy → https://ollama.com/v1/chat/completions

api.ts (openai / anthropic / local ollama)
  proxiedFetch("https://api.openai.com/v1/chat/completions", ...)
    → no origin match → fetch directly (unchanged)
```

## What Is Not Changed

- The Go proxy backend (`backend/main.go`) requires no changes.
- All other providers (OpenAI, Anthropic, local Ollama, OpenRouter, etc.) are unaffected.
- `compose.yml` `ALLOWED_UPSTREAM_URLS` already includes both domains — no proxy backend changes.
- No changes to routing, store, or UI components.

## Summary of All File Changes

| File | Change |
|---|---|
| `src/config/proxyRoutes.json` | **New** — static domain-to-proxy mapping |
| `src/services/proxiedFetch.ts` | **New** — routing wrapper |
| `src/services/api.ts` | Replace `fetch` → `proxiedFetch`, remove manual `X-Target-URL` headers |
| `src/services/tools/braveSearch.ts` | Use real Brave URL, remove `proxyBase`, replace `fetch` → `proxiedFetch` |
| `src/services/modelMeta/OllamaFetcher.ts` | Remove `upstreamUrl` param, replace `fetch` → `proxiedFetch` |
| `src/services/modelMeta/registry.ts` | `OllamaFetcher('https://ollama.com')` → `OllamaFetcher()` |
| `frontend/index.html` | Add `<script src="/config.js">` |
| `frontend/docker-entrypoint.sh` | **New** — generates `config.js` at container start |
| `frontend/Dockerfile` | Change `CMD` to use entrypoint script |
| `frontend/public/config.js.example` | **New** — dev template for `config.js` |
| `frontend/public/config.js` | Gitignored — created locally by each developer |
| `compose.yml` | Switch from build args to runtime `environment: PROXY_URL=...` |
| `.gitignore` | Add `frontend/public/config.js` |
