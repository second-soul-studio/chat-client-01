# proxiedFetch — Transparent Proxy Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all direct `fetch` calls with a `proxiedFetch` wrapper that transparently routes requests through the CORS proxy for domains listed in a static config file.

**Architecture:** A new `proxiedFetch(url, init?)` function reads `proxyRoutes.json` at import time and checks the origin of every outgoing request. If the origin is flagged `requiresProxy: true`, the URL is rewritten to the proxy base (read from `globalThis.__ENV__.PROXY_URL` at runtime) and `X-Target-URL` is injected automatically. All callers — `api.ts`, `braveSearch.ts`, `OllamaFetcher.ts` — are updated to use `proxiedFetch` instead of `fetch`, and their manual `X-Target-URL` headers are removed. Runtime config (`PROXY_URL`) is injected into the browser via a generated `/config.js` file produced by a Docker entrypoint script at container start.

**Tech Stack:** TypeScript, Vitest, React (Vite), nginx (Docker), Go proxy (unchanged)

---

## File Map

| File | Action |
|---|---|
| `frontend/src/config/proxyRoutes.json` | Create — static list of domains requiring proxy |
| `frontend/src/services/proxiedFetch.ts` | Create — routing wrapper |
| `frontend/src/services/proxiedFetch.test.ts` | Create — unit tests |
| `frontend/src/services/tools/braveSearch.ts` | Modify — use real URL, remove `proxyBase`, use `proxiedFetch` |
| `frontend/src/services/tools/braveSearch.test.ts` | Modify — add `searchBrave` test, remove `proxyBase` usage |
| `frontend/src/services/api.ts` | Modify — replace `fetch` → `proxiedFetch`, remove manual `X-Target-URL` |
| `frontend/src/services/modelMeta/OllamaFetcher.ts` | Modify — remove `upstreamUrl`, replace `fetch` → `proxiedFetch` |
| `frontend/src/services/modelMeta/registry.ts` | Modify — `OllamaFetcher()` (no argument) |
| `frontend/docker-entrypoint.sh` | Create — generates `/config.js` at container start |
| `frontend/Dockerfile` | Modify — use entrypoint script instead of `CMD` |
| `frontend/index.html` | Modify — add `<script src="/config.js">` |
| `frontend/public/config.js.example` | Create — dev template |
| `frontend/.gitignore` | Modify — ignore `public/config.js` |
| `compose.yml` | Modify — add `environment: PROXY_URL=...` to frontend service |

---

## Task 1: Create `proxyRoutes.json` and `proxiedFetch.ts`

**Files:**
- Create: `frontend/src/config/proxyRoutes.json`
- Create: `frontend/src/services/proxiedFetch.ts`
- Create: `frontend/src/services/proxiedFetch.test.ts`

### Background

The Go proxy (`backend/main.go:69-79`) reads `X-Target-URL`, strips any trailing slash, then appends the full `RequestURI` (path + query) from the incoming request. So a browser request to `http://localhost:9080/v1/chat/completions` with `X-Target-URL: https://ollama.com` becomes a server-side call to `https://ollama.com/v1/chat/completions`.

`proxiedFetch` must:
1. Parse the target URL to extract its origin (`scheme + host`, no trailing slash).
2. Check that origin against `proxyRoutes.json` using exact string equality.
3. If `requiresProxy: true`: rewrite the URL to `${PROXY_URL}${pathname}${search}` and inject `X-Target-URL`.
4. Otherwise: call `fetch` unchanged.

`PROXY_URL` is read from `globalThis.__ENV__?.PROXY_URL` (set at runtime by `/config.js`). Using `globalThis` instead of `window` makes the function work in both browser and Node (Vitest) environments.

- [ ] **Step 1: Create `proxyRoutes.json`**

```json
[
  { "domain": "https://ollama.com", "requiresProxy": true },
  { "domain": "https://api.search.brave.com", "requiresProxy": true }
]
```

Save to: `frontend/src/config/proxyRoutes.json`

- [ ] **Step 2: Write the failing tests**

Save to: `frontend/src/services/proxiedFetch.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We import the module AFTER setting up globalThis.__ENV__
// so the module reads the right PROXY_URL.
// Use vi.resetModules() between tests that need different configs.

describe('proxiedFetch', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('rewrites URL and injects X-Target-URL for a proxied domain', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: 'http://localhost:9080' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://api.search.brave.com/res/v1/web/search?q=test');

        expect(mockFetch).toHaveBeenCalledOnce();
        const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toBe('http://localhost:9080/res/v1/web/search?q=test');
        expect((calledInit?.headers as Record<string, string>)['X-Target-URL']).toBe('https://api.search.brave.com');
    });

    it('passes through non-proxied URLs unchanged', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: 'http://localhost:9080' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer sk-test' },
        });

        expect(mockFetch).toHaveBeenCalledOnce();
        const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('merges X-Target-URL with existing headers', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: 'http://localhost:9080' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://ollama.com/v1/chat/completions', {
            headers: { 'Authorization': 'Bearer token', 'Content-Type': 'application/json' },
        });

        const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = calledInit?.headers as Record<string, string>;
        expect(headers['X-Target-URL']).toBe('https://ollama.com');
        expect(headers['Authorization']).toBe('Bearer token');
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('falls back to same-origin when PROXY_URL is empty', async () => {
        (globalThis as Record<string, unknown>).__ENV__ = { PROXY_URL: '' };
        const { proxiedFetch } = await import('./proxiedFetch');

        await proxiedFetch('https://api.search.brave.com/res/v1/web/search?q=test');

        const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
        // Empty proxyBase → relative URL (same-origin)
        expect(calledUrl).toBe('/res/v1/web/search?q=test');
    });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd frontend && pnpm vitest run src/services/proxiedFetch.test.ts
```

Expected: FAIL — `proxiedFetch` module does not exist yet.

- [ ] **Step 4: Implement `proxiedFetch.ts`**

Save to: `frontend/src/services/proxiedFetch.ts`

```ts
import proxyRoutes from '@/config/proxyRoutes.json';

interface ProxyRoute {
    domain: string;
    requiresProxy: boolean;
}

const routes = proxyRoutes as ProxyRoute[];

function getProxyUrl(): string {
    return (globalThis as { __ENV__?: { PROXY_URL?: string } }).__ENV__?.PROXY_URL ?? '';
}

export async function proxiedFetch(
    url: string | URL,
    init?: RequestInit,
): Promise<Response> {
    const parsed = new URL(url);
    const origin = parsed.origin; // e.g. "https://api.search.brave.com"

    const route = routes.find(r => r.domain === origin && r.requiresProxy);

    if (!route) {
        return fetch(url, init);
    }

    const proxyBase = getProxyUrl();
    const rewritten = `${proxyBase}${parsed.pathname}${parsed.search}`;

    const existingHeaders = init?.headers ?? {};
    const headers: Record<string, string> = {
        ...(existingHeaders as Record<string, string>),
        'X-Target-URL': route.domain,
    };

    return fetch(rewritten, { ...init, headers });
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd frontend && pnpm vitest run src/services/proxiedFetch.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/config/proxyRoutes.json frontend/src/services/proxiedFetch.ts frontend/src/services/proxiedFetch.test.ts
git commit -m "Add proxiedFetch wrapper with proxyRoutes config"
```

---

## Task 2: Update `braveSearch.ts`

**Files:**
- Modify: `frontend/src/services/tools/braveSearch.ts`
- Modify: `frontend/src/services/tools/braveSearch.test.ts`

### Background

`braveSearch.ts:41-52` currently fetches `${proxyBase}/res/v1/web/search?...` and manually sets `X-Target-URL`. After this task, it will fetch the real Brave URL directly and let `proxiedFetch` handle routing.

The existing tests in `braveSearch.test.ts` only cover `mapBraveResults` — they are unaffected. We add a test for `searchBrave` using `vi.mock` on `proxiedFetch`.

- [ ] **Step 1: Add `searchBrave` test**

In `frontend/src/services/tools/braveSearch.test.ts`:

1. Expand the existing import on line 1 to add `vi` and `beforeEach`:
   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   ```

2. Add this import after the existing imports:
   ```ts
   import { searchBrave } from './braveSearch';
   import type { ToolConfig } from '@/types';
   ```

3. Append the following at the end of the file (after all existing `describe` blocks):

```ts
vi.mock('@/services/proxiedFetch', () => ({
    proxiedFetch: vi.fn(),
}));

describe('searchBrave', () => {
    const mockConfig: ToolConfig = {
        id: 'brave-search',
        displayName: 'Brave',
        enabled: true,
        apiKey: 'test-key',
        settings: { safesearch: 'moderate' },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls the real Brave URL via proxiedFetch', async () => {
        const { proxiedFetch } = await import('@/services/proxiedFetch');
        const mockFetch = proxiedFetch as ReturnType<typeof vi.fn>;
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({ web: { results: [{ title: 'T', url: 'https://t.com', description: 'S' }] } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        const result = await searchBrave('test query', mockConfig);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [calledUrl] = mockFetch.mock.calls[0] as [string];
        expect(calledUrl).toContain('https://api.search.brave.com/res/v1/web/search');
        expect(calledUrl).toContain('q=test+query');
        expect(result.results).toHaveLength(1);
        expect(result.results[0].title).toBe('T');
    });
});
```

- [ ] **Step 2: Run the new test to confirm it fails**

```bash
cd frontend && pnpm vitest run src/services/tools/braveSearch.test.ts
```

Expected: The new `searchBrave` test FAILS — `braveSearch.ts` still uses plain `fetch`.

- [ ] **Step 3: Update `braveSearch.ts`**

Replace the file content:

```ts
import type { ToolConfig, BraveSearchSettings } from '@/types';
import type { ToolDefinition, ToolResult } from './types';
import { registerTool } from './registry';
import { proxiedFetch } from '@/services/proxiedFetch';

// ─── Result Mapping ───────────────────────────────────────────────────────────

export function mapBraveResults(raw: Record<string, unknown>): ToolResult['results'] {
    const results = (raw?.web as { results?: unknown[] })?.results ?? [];
    return results.slice(0, 3).map((r: unknown) => {
        const item = r as { title?: string; url?: string; description?: string };
        return {
            title: item.title ?? '',
            url: item.url ?? '',
            snippet: item.description ?? '',
        };
    });
}

// ─── API Call ─────────────────────────────────────────────────────────────────

export async function searchBrave(
    query: string,
    config: ToolConfig,
): Promise<ToolResult> {
    const settings = config.settings as unknown as BraveSearchSettings;
    const params = new URLSearchParams({ q: query });
    if (settings.safesearch) params.set('safesearch', settings.safesearch);

    const locationHeaders: Record<string, string> = {};
    if (settings.lat != null) locationHeaders['x-loc-lat'] = String(settings.lat);
    if (settings.long != null) locationHeaders['x-loc-long'] = String(settings.long);
    if (settings.timezone) locationHeaders['x-loc-timezone'] = settings.timezone;
    if (settings.city) locationHeaders['x-loc-city'] = settings.city;
    if (settings.state) locationHeaders['x-loc-state'] = settings.state;
    if (settings.stateName) locationHeaders['x-loc-state-name'] = settings.stateName;
    if (settings.country) locationHeaders['x-loc-country'] = settings.country;
    if (settings.postalCode) locationHeaders['x-loc-postal-code'] = settings.postalCode;

    const response = await proxiedFetch(
        `https://api.search.brave.com/res/v1/web/search?${params}`,
        {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': config.apiKey,
                ...locationHeaders,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`Brave Search API error ${response.status}`);
    }

    const data = await response.json();
    return { results: mapBraveResults(data) };
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

const braveSearchTool: ToolDefinition = {
    name: 'brave_web_search',
    configId: 'brave-search',
    description: 'Search the web using Brave Search. Use this to find current information, news, facts, or anything that benefits from a live web search.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query',
            },
        },
        required: ['query'],
    },
    async execute(args, config) {
        const { query } = args as { query: string };
        return searchBrave(query, config);
    },
};

registerTool(braveSearchTool);

export default braveSearchTool;
```

- [ ] **Step 4: Run all tests**

```bash
cd frontend && pnpm vitest run
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/tools/braveSearch.ts frontend/src/services/tools/braveSearch.test.ts
git commit -m "Update braveSearch to use proxiedFetch and real Brave URL"
```

---

## Task 3: Update `api.ts`

**Files:**
- Modify: `frontend/src/services/api.ts`

### Background

Three places in `api.ts` need updating:
1. `sendOpenAIMessage` (`api.ts:181`) — `fetch(...)` → `proxiedFetch(...)`
2. `sendAnthropicMessage` (`api.ts:240`) — `fetch(...)` → `proxiedFetch(...)` (no proxy route matches Anthropic — passes through unchanged)
3. `testProvider` (`api.ts:363, 380, 387`) — all three `fetch(...)` calls → `proxiedFetch(...)`

Additionally, the manual `X-Target-URL` header for `ollama-cloud` must be removed from both `sendMessage` (`api.ts:118`) and `testProvider` (`api.ts:379`). After this change, `proxiedFetch` handles that header automatically when it sees `https://ollama.com` as the target domain.

There are no tests for `api.ts` currently — no new tests are required, but all existing tests must still pass.

- [ ] **Step 1: Add the import**

At the top of `frontend/src/services/api.ts`, after the existing imports:

```ts
import { proxiedFetch } from './proxiedFetch';
```

- [ ] **Step 2: Remove manual `X-Target-URL` for ollama-cloud in `sendMessage`**

Remove this block (around `api.ts:117-119`):

```ts
    if (provider.adapter === 'ollama-cloud') {
        extraHeaders['X-Target-URL'] = 'https://ollama.com';
    }
```

- [ ] **Step 3: Replace `fetch` in `sendOpenAIMessage`**

In `sendOpenAIMessage` (around `api.ts:181`), change:

```ts
    const response = await fetch(`${opts.baseUrl}/chat/completions`, {
```

to:

```ts
    const response = await proxiedFetch(`${opts.baseUrl}/chat/completions`, {
```

- [ ] **Step 4: Replace `fetch` in `sendAnthropicMessage`**

In `sendAnthropicMessage` (around `api.ts:240`), change:

```ts
    const response = await fetch(`${opts.baseUrl}/messages`, {
```

to:

```ts
    const response = await proxiedFetch(`${opts.baseUrl}/messages`, {
```

- [ ] **Step 5: Update `testProvider`**

In `testProvider`, replace all three `fetch(...)` calls with `proxiedFetch(...)` and remove the manual `X-Target-URL` header from the `ollama-cloud` branch.

Before (around `api.ts:363-392`):

```ts
export async function testProvider(provider: Provider): Promise<boolean> {
    try {
        if (provider.adapter === 'anthropic') {
            const res = await fetch(`${provider.baseUrl}/messages`, {
                ...
            });
            ...
        }

        if (provider.adapter === 'ollama' || provider.adapter === 'ollama-cloud') {
            const baseUrl = provider.baseUrl.replace(/\/v1\/?$/, '');
            const headers: Record<string, string> = {};
            if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
            if (provider.adapter === 'ollama-cloud') headers['X-Target-URL'] = 'https://ollama.com';
            const res = await fetch(`${baseUrl}/v1/models`, {
                headers,
                signal: AbortSignal.timeout(5000),
            });
            return res.ok;
        }

        const res = await fetch(`${provider.baseUrl}/models`, {
            ...
        });
        ...
    }
}
```

After:

```ts
export async function testProvider(provider: Provider): Promise<boolean> {
    try {
        if (provider.adapter === 'anthropic') {
            const res = await proxiedFetch(`${provider.baseUrl}/messages`, {
                method: 'POST',
                headers: buildAnthropicHeaders(provider.apiKey),
                body: JSON.stringify({
                    model: 'claude-haiku-20240307',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'ping' }],
                }),
                signal: AbortSignal.timeout(5000),
            });
            return res.ok || res.status === 400;
        }

        if (provider.adapter === 'ollama' || provider.adapter === 'ollama-cloud') {
            const baseUrl = provider.baseUrl.replace(/\/v1\/?$/, '');
            const headers: Record<string, string> = {};
            if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
            const res = await proxiedFetch(`${baseUrl}/v1/models`, {
                headers,
                signal: AbortSignal.timeout(5000),
            });
            return res.ok;
        }

        const res = await proxiedFetch(`${provider.baseUrl}/models`, {
            headers: buildOpenAIHeaders(provider.apiKey),
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
```

- [ ] **Step 6: Run all tests**

```bash
cd frontend && pnpm vitest run
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "Replace fetch with proxiedFetch in api.ts, remove manual X-Target-URL"
```

---

## Task 4: Update `OllamaFetcher.ts` and `registry.ts`

**Files:**
- Modify: `frontend/src/services/modelMeta/OllamaFetcher.ts`
- Modify: `frontend/src/services/modelMeta/registry.ts`

### Background

`OllamaFetcher` has a constructor parameter `upstreamUrl` that, when set, manually injects `X-Target-URL`. This mirrors the pattern we've already fixed in `api.ts`. Both `fetch` calls inside the class (list models, fetch model detail) need replacing with `proxiedFetch`.

After the change, `registry.ts` passes no argument to `OllamaFetcher()` — the routing is handled transparently.

- [ ] **Step 1: Update `OllamaFetcher.ts`**

Replace the file content:

```ts
import type { Provider } from '@/types/providers';
import type { FetchedModel, ModelMetaFetcher } from './types';
import { proxiedFetch } from '@/services/proxiedFetch';

interface OllamaModelListEntry {
    id: string;
}

interface OllamaShowResponse {
    details?: {
        family?: string;
        parameter_size?: string;
        quantization_level?: string;
    };
    model_info?: Record<string, unknown>;
    capabilities?: string[];
}

export class OllamaFetcher implements ModelMetaFetcher {
    async fetchModels(provider: Provider): Promise<FetchedModel[]> {
        // Ollama's native API lives at the root, not under /v1
        const baseUrl = provider.baseUrl.replace(/\/v1\/?$/, '');
        const headers: Record<string, string> = {};
        if (provider.apiKey) {
            headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        // Use OpenAI-compatible /v1/models — works for both local and cloud Ollama
        const listResponse = await proxiedFetch(`${baseUrl}/v1/models`, { headers });
        if (!listResponse.ok) {
            throw new Error(`Ollama /v1/models returned ${listResponse.status}`);
        }

        const listJson = await listResponse.json() as { data: OllamaModelListEntry[] };

        const results = await Promise.all(
            listJson.data.map(entry => this.fetchModelDetail(baseUrl, headers, entry.id))
        );

        return results.filter((m): m is FetchedModel => m !== null);
    }

    private async fetchModelDetail(
        baseUrl: string,
        headers: Record<string, string>,
        slug: string,
    ): Promise<FetchedModel | null> {
        const response = await proxiedFetch(`${baseUrl}/api/show`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: slug }),
        });

        if (!response.ok) return null;

        const data = await response.json() as OllamaShowResponse;

        const modelInfo = data.model_info ?? {};
        const arch = modelInfo['general.architecture'] as string | undefined;
        const contextLength = arch
            ? modelInfo[`${arch}.context_length`] as number | undefined
            : undefined;

        const capabilities = data.capabilities ?? [];
        const supportsCot = capabilities.includes('thinking');
        const supportsVision = capabilities.includes('vision');
        const functionCalling = capabilities.includes('tools');

        const noteParts = [
            data.details?.family,
            data.details?.parameter_size,
            data.details?.quantization_level,
        ].filter(Boolean);

        return {
            slug,
            displayName: slug,
            contextWindow: contextLength,
            supportsCot,
            supportsVision,
            functionCalling,
            notes: noteParts.length > 0 ? noteParts.join(' · ') : undefined,
        };
    }
}
```

- [ ] **Step 2: Update `registry.ts`**

Change line 17 in `frontend/src/services/modelMeta/registry.ts`:

```ts
    'ollama-cloud': new OllamaFetcher('https://ollama.com'),
```

to:

```ts
    'ollama-cloud': new OllamaFetcher(),
```

- [ ] **Step 3: Run all tests**

```bash
cd frontend && pnpm vitest run
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/modelMeta/OllamaFetcher.ts frontend/src/services/modelMeta/registry.ts
git commit -m "Remove upstreamUrl from OllamaFetcher, use proxiedFetch"
```

---

## Task 5: Runtime Config — Entrypoint, index.html, Docker, compose

**Files:**
- Create: `frontend/docker-entrypoint.sh`
- Modify: `frontend/Dockerfile`
- Modify: `frontend/index.html`
- Create: `frontend/public/config.js.example`
- Modify: `frontend/.gitignore`
- Modify: `compose.yml`

### Background

The browser reads `window.__ENV__.PROXY_URL` which comes from `/config.js`. In production (Docker), a shell script generates this file at container start using the `$PROXY_URL` environment variable. In development, each developer copies `config.js.example` → `config.js` under `public/` (Vite serves `public/` as-is). The `config.js` is gitignored to avoid committing local dev values.

`index.html` needs `<script src="/config.js"></script>` as the first script so `window.__ENV__` is populated before any module code runs.

- [ ] **Step 1: Create `docker-entrypoint.sh`**

Save to `frontend/docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e

# Generate runtime config for the browser.
# PROXY_URL: base URL of the CORS proxy (e.g. https://proxy.example.com:8081).
# Leave empty to use same-origin routing (requires nginx proxy_pass setup).
cat > /usr/share/nginx/html/config.js <<EOF
window.__ENV__ = {
  PROXY_URL: "${PROXY_URL:-}"
};
EOF

exec nginx -g 'daemon off;'
```

Make it executable:

```bash
chmod +x frontend/docker-entrypoint.sh
```

- [ ] **Step 2: Update `Dockerfile`**

Replace the last two lines of `frontend/Dockerfile`:

```dockerfile
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

with:

```dockerfile
COPY docker-entrypoint.sh /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
```

- [ ] **Step 3: Add `<script src="/config.js">` to `index.html`**

In `frontend/index.html`, add before the module script tag:

```html
<head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#07050c" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>Second Soul</title>
    <script src="/config.js"></script>
</head>
```

- [ ] **Step 4: Create `public/config.js.example`**

Save to `frontend/public/config.js.example`:

```js
// Copy this file to config.js and set PROXY_URL to your local proxy address.
// config.js is gitignored — do not commit it.
window.__ENV__ = {
  PROXY_URL: 'http://localhost:9080',
};
```

- [ ] **Step 5: Gitignore `public/config.js`**

Add to `frontend/.gitignore`:

```
# Runtime config (generated per-environment, not committed)
public/config.js
```

- [ ] **Step 6: Update `compose.yml`**

Add `environment` to the frontend service:

```yaml
services:

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    environment:
      - PROXY_URL=https://your-proxy-host:8081
    restart: unless-stopped

  proxy:
    build: ./backend
    ports:
      - "8081:8080"
    environment:
      - ALLOWED_UPSTREAM_URLS=https://ollama.com,https://api.search.brave.com
      - ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com
    restart: unless-stopped
```

- [ ] **Step 7: Create your local `config.js` for dev**

```bash
cp frontend/public/config.js.example frontend/public/config.js
# Edit config.js and set PROXY_URL to your local proxy port, e.g. http://localhost:9080
```

- [ ] **Step 8: Run all tests**

```bash
cd frontend && pnpm vitest run
```

Expected: All tests PASS.

- [ ] **Step 9: Build to verify no TypeScript errors**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/docker-entrypoint.sh frontend/Dockerfile frontend/index.html \
        frontend/public/config.js.example frontend/.gitignore compose.yml
git commit -m "Add runtime PROXY_URL config via docker-entrypoint and config.js"
```

---

## Post-Implementation: Breaking Change

After all tasks are complete, any existing **ollama-cloud** provider in the app settings must have its `baseUrl` updated from the proxy URL (e.g. `http://localhost:9080`) to the actual upstream: `https://ollama.com`.

Do this in the app's Provider Settings UI — no code change needed.
