# Tool Support (Brave Web Search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native OpenAI function-calling support to Second Soul, starting with Brave Web Search, behind a per-conversation toggle pill and collapsible result blocks.

**Architecture:** A new `toolLoop.ts` service sits between `ChatPage` and `api.ts`. It orchestrates the multi-turn OpenAI tool-calling loop, delegates to tool implementations in `src/services/tools/`, and returns collected `ToolCallRecord[]` alongside the final LLM response. `api.ts` is minimally changed (four exports added). Brave Search calls are routed through the existing Go CORS proxy.

**Tech Stack:** React 19 / TypeScript / Vite / Zustand / IndexedDB (idb) / pnpm / Vitest (added by this plan)

**Spec:** `docs/superpowers/specs/2026-03-23-tool-support-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `backend/main.go` | Add `X-Subscription-Token` to CORS preflight headers |
| Modify | `backend/.env.example` | Add `https://api.search.brave.com` to `ALLOWED_UPSTREAM_URLS` example |
| Modify | `compose.yml` | Same for compose env example |
| Modify | `frontend/src/types/index.ts` | Add `ToolConfig`, `BraveSearchSettings`, `ToolCallRecord`; extend `Message` |
| Modify | `frontend/src/services/db.ts` | Bump schema v2→v3; add `tool_configs` store + CRUD helpers |
| Modify | `frontend/src/services/api.ts` | Export `buildOpenAIHeaders`, `buildAnthropicHeaders`, `readStream`, `extractThinkingFromText` |
| Modify | `frontend/src/stores/appStore.ts` | Add `toolConfigs`, `pendingToolCalls`; CRUD actions; extend `init()` |
| Create | `frontend/src/services/tools/types.ts` | `ToolDefinition` interface |
| Create | `frontend/src/services/tools/registry.ts` | Name → `ToolDefinition` lookup |
| Create | `frontend/src/services/tools/braveSearch.ts` | Brave Search tool implementation |
| Create | `frontend/src/services/toolLoop.ts` | Multi-turn tool-calling orchestrator |
| Create | `frontend/src/components/ToolCallBlock.tsx` | Collapsible search status/result block |
| Create | `frontend/src/components/ToolsSettings.tsx` | Tools settings page (API key, safesearch, location) |
| Modify | `frontend/src/components/ChatBubbles.tsx` | Render `ToolCallBlock` in `AssistantBubble` |
| Modify | `frontend/src/components/SettingsPage.tsx` | Add "Tools" tab |
| Modify | `frontend/src/components/ChatPage.tsx` | Use `toolLoop`; add search pill; wire callbacks |

---

## Task 1: Go Proxy — CORS header + env updates

**Files:**
- Modify: `backend/main.go:44`
- Modify: `backend/.env.example`
- Modify: `compose.yml`

- [ ] **Step 1: Fix the CORS preflight header in `backend/main.go`**

Find the `setCORSHeaders` function (line ~44) and change the `Access-Control-Allow-Headers` line:

```go
w.Header().Set("Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Target-URL, X-Subscription-Token")
```

- [ ] **Step 2: Update `backend/.env.example`**

Change the `ALLOWED_UPSTREAM_URLS` example line to:

```
ALLOWED_UPSTREAM_URLS=https://ollama.com,https://api.search.brave.com
```

- [ ] **Step 3: Update `compose.yml`**

Read the file first. Find the `ALLOWED_UPSTREAM_URLS` env var in the proxy service and add `https://api.search.brave.com` to the example/comment value.

- [ ] **Step 4: Commit**

```bash
git add backend/main.go backend/.env.example compose.yml
git commit -m "Add X-Subscription-Token to proxy CORS headers, add Brave to upstream example"
```

---

## Task 2: Type definitions

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `ToolConfig` and `BraveSearchSettings` to `src/types/index.ts`**

Append after the existing `AppSettings` interface:

```ts
export interface BraveSearchSettings {
    safesearch: 'off' | 'moderate' | 'strict';
    lat?: number;
    long?: number;
    timezone?: string;
    city?: string;
    state?: string;
    stateName?: string;
    country?: string;
    postalCode?: string;
}

export interface ToolConfig {
    id: string;
    displayName: string;
    enabled: boolean;
    apiKey: string;
    settings: Record<string, unknown>;
}
```

- [ ] **Step 2: Add `ToolCallRecord` and extend `Message`**

Append `ToolCallRecord` after `ToolConfig`:

```ts
export interface ToolCallRecord {
    id: string;
    toolName: string;
    query: string;
    status: 'pending' | 'complete' | 'error';
    results?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    errorMessage?: string;
}
```

Then add `toolCalls?: ToolCallRecord[];` as the last field in the existing `Message` interface.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "Add ToolConfig, ToolCallRecord types; extend Message with toolCalls"
```

---

## Task 3: DB schema update

**Files:**
- Modify: `frontend/src/services/db.ts`

- [ ] **Step 1: Add `tool_configs` to the `SecondSoulDB` schema interface**

Add a new store entry in the `SecondSoulDB` interface (after `globalModelMeta`):

```ts
toolConfigs: {
    key: string;
    value: ToolConfig;
};
```

Also update the import at the top to include `ToolConfig`:

```ts
import type { Chat, Persona, AppSettings, ToolConfig } from '@/types';
```

- [ ] **Step 2: Bump the DB version and add the upgrade block**

Change the `openDB` call version from `2` to `3`, and add a new upgrade block:

```ts
dbInstance = await openDB<SecondSoulDB>('second-soul', 3, {
    upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            // ... existing v1 block unchanged ...
        }
        if (oldVersion < 2) {
            db.createObjectStore('globalModelMeta');
        }
        if (oldVersion < 3) {
            db.createObjectStore('toolConfigs', { keyPath: 'id' });
        }
    },
});
```

- [ ] **Step 3: Add CRUD helpers at the bottom of `db.ts`**

```ts
// ─── Tool Configs ─────────────────────────────────────────────────────────────

export async function getToolConfigs(): Promise<ToolConfig[]> {
    const db = await getDB();
    return db.getAll('toolConfigs');
}

export async function saveToolConfig(config: ToolConfig): Promise<void> {
    const db = await getDB();
    await db.put('toolConfigs', config);
}

export async function deleteToolConfig(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('toolConfigs', id);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/db.ts
git commit -m "Bump DB to v3, add tool_configs store with CRUD helpers"
```

---

## Task 4: Export helpers from `api.ts`

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Make three functions exported**

Change these function declarations from `function` to `export function`:

```ts
export function buildOpenAIHeaders(apiKey: string): Record<string, string> { ... }
// buildAnthropicHeaders — leave unexported, not used externally
export async function readStream(...) { ... }
// extractThinkingFromText is already exported — no change needed
```

`readStream` full signature for reference:
```ts
export async function readStream(
    body: ReadableStream,
    onChunk: ((content: string) => void) | undefined,
    onThinkingChunk?: (thinking: string) => void,
): Promise<{ content: string; thinking?: string }>
```

- [ ] **Step 2: Update `buildContextWindow` to account for tool result tokens**

In `buildContextWindow`, change the token estimation loop to also count tool results:

```ts
function buildContextWindow(messages: Message[], maxTokens: number, systemPrompt: string): Message[] {
    const systemTokens = estimateTokens(systemPrompt);
    let budget = maxTokens - systemTokens - 500;
    const result: Message[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        let tokens = estimateTokens(msg.content);
        // Account for tool results that will be expanded in context
        if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
                tokens += estimateTokens(JSON.stringify(tc.results ?? {}));
            }
        }
        if (budget - tokens < 0) break;
        budget -= tokens;
        result.unshift(msg);
    }

    return result;
}
```

Note: `Message` from `@/types` must be imported in `api.ts` — it already is.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "Export buildOpenAIHeaders, readStream from api.ts; account for tool result tokens in buildContextWindow"
```

---

## Task 5: Store — toolConfigs + pendingToolCalls

**Files:**
- Modify: `frontend/src/stores/appStore.ts`

- [ ] **Step 1: Add imports and new state fields to the `AppState` interface**

Add to the imports at the top:
```ts
import type { AppSettings, Chat, Message, Persona, ToolConfig, ToolCallRecord } from '@/types';
import { getToolConfigs, saveToolConfig, deleteToolConfig as dbDeleteToolConfig } from '@/services/db';
```

Add to `AppState` interface (after the `// ─── Chat History` section):

```ts
// ─── Tool Configs ─────────────────────────────────────────────────────────────
toolConfigs: ToolConfig[];
addToolConfig: (config: ToolConfig) => Promise<void>;
updateToolConfig: (config: ToolConfig) => Promise<void>;
removeToolConfig: (id: string) => Promise<void>;

// ─── Pending Tool Calls (in-progress UI state) ────────────────────────────────
pendingToolCalls: ToolCallRecord[];
addPendingToolCall: (call: ToolCallRecord) => void;   // safe for parallel calls
updatePendingToolCall: (updated: ToolCallRecord) => void;
clearPendingToolCalls: () => void;
```

- [ ] **Step 2: Extend `init()` to load tool configs**

In the `async init()` method, add `getToolConfigs()` to the `Promise.all`:

```ts
const [settings, personas, providers, modelConfigs, toolConfigs] = await Promise.all([
    getSettings(),
    getPersonas(),
    getProviders(),
    getModelConfigs(),
    getToolConfigs(),
]);
// ...
set({ settings, personas: sorted, providers, modelConfigs, toolConfigs, initialised: true });
```

- [ ] **Step 3: Add initial state values and action implementations**

Add in the store body (after the `removeChat` action):

```ts
// ─── Tool Configs ────────────────────────────────────────────────────────────

toolConfigs: [],

async addToolConfig(config) {
    await saveToolConfig(config);
    set(s => ({ toolConfigs: [...s.toolConfigs, config] }));
},

async updateToolConfig(config) {
    await saveToolConfig(config);
    set(s => ({ toolConfigs: s.toolConfigs.map(c => c.id === config.id ? config : c) }));
},

async removeToolConfig(id) {
    await dbDeleteToolConfig(id);
    set(s => ({ toolConfigs: s.toolConfigs.filter(c => c.id !== id) }));
},

// ─── Pending Tool Calls ──────────────────────────────────────────────────────

pendingToolCalls: [],

addPendingToolCall(call) {
    // Uses functional update to be safe against parallel calls
    set(s => ({ pendingToolCalls: [...s.pendingToolCalls, call] }));
},

updatePendingToolCall(updated) {
    set(s => ({
        pendingToolCalls: s.pendingToolCalls.map(c => c.id === updated.id ? updated : c),
    }));
},

clearPendingToolCalls() {
    set({ pendingToolCalls: [] });
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/appStore.ts
git commit -m "Add toolConfigs and pendingToolCalls to store"
```

---

## Task 6: Tool interface + registry

**Files:**
- Create: `frontend/src/services/tools/types.ts`
- Create: `frontend/src/services/tools/registry.ts`

- [ ] **Step 1: Create `src/services/tools/types.ts`**

```ts
import type { ToolConfig } from '@/types';

export interface ToolDefinition {
    /** OpenAI function name, e.g. 'brave_web_search'. Must match the name sent in tool_calls. */
    name: string;
    /** The tool config ID this tool reads its API key and settings from. */
    configId: string;
    /** Description shown to the model. */
    description: string;
    /** JSON Schema for the function's arguments object. */
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>, config: ToolConfig) => Promise<ToolResult>;
}

export interface ToolResult {
    results: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
}
```

- [ ] **Step 2: Create `src/services/tools/registry.ts`** (placeholder — braveSearch added in Task 7)

```ts
import type { ToolDefinition } from './types';

const tools: Record<string, ToolDefinition> = {};

export function registerTool(tool: ToolDefinition): void {
    tools[tool.name] = tool;
}

export function getToolByName(name: string): ToolDefinition | null {
    return tools[name] ?? null;
}

export function getAllTools(): ToolDefinition[] {
    return Object.values(tools);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/tools/
git commit -m "Add tool interface types and registry"
```

---

## Task 7: Set up Vitest + Brave Search tool

**Files:**
- Create: `frontend/src/services/tools/braveSearch.ts`
- Create: `frontend/src/services/tools/braveSearch.test.ts`
- Modify: `frontend/vite.config.ts` (add test config)
- Modify: `frontend/package.json` (add test script)

- [ ] **Step 1: Install Vitest**

```bash
cd frontend && pnpm add -D vitest
```

- [ ] **Step 2: Add test config to `vite.config.ts`**

Read the file first, then add a `test` section inside `defineConfig`:

```ts
test: {
    environment: 'node',
    globals: true,
},
```

Also add the triple-slash reference to `vite-env.d.ts` if not present: not needed for node env.

- [ ] **Step 3: Add test script to `frontend/package.json`**

Add `"test": "vitest run"` to the `scripts` section.

- [ ] **Step 4: Write the failing test for Brave Search result parsing**

Create `frontend/src/services/tools/braveSearch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapBraveResults } from './braveSearch';

describe('mapBraveResults', () => {
    it('returns top 3 results with title, url, snippet', () => {
        const raw = {
            web: {
                results: [
                    { title: 'A', url: 'https://a.com', description: 'Snippet A' },
                    { title: 'B', url: 'https://b.com', description: 'Snippet B' },
                    { title: 'C', url: 'https://c.com', description: 'Snippet C' },
                    { title: 'D', url: 'https://d.com', description: 'Snippet D' },
                ],
            },
        };
        const results = mapBraveResults(raw);
        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({ title: 'A', url: 'https://a.com', snippet: 'Snippet A' });
        expect(results[2]).toEqual({ title: 'C', url: 'https://c.com', snippet: 'Snippet C' });
    });

    it('returns fewer than 3 results when fewer are available', () => {
        const raw = { web: { results: [{ title: 'A', url: 'https://a.com', description: 'S' }] } };
        expect(mapBraveResults(raw)).toHaveLength(1);
    });

    it('returns empty array when web.results is missing', () => {
        expect(mapBraveResults({})).toHaveLength(0);
        expect(mapBraveResults({ web: {} })).toHaveLength(0);
    });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd frontend && pnpm test
```

Expected: FAIL — `mapBraveResults` not defined.

- [ ] **Step 6: Create `src/services/tools/braveSearch.ts`**

```ts
import type { ToolConfig, BraveSearchSettings } from '@/types';
import type { ToolDefinition, ToolResult } from './types';
import { registerTool } from './registry';

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

// proxyBase is injected for testability; defaults to '' (same origin) in production.
export async function searchBrave(
    query: string,
    config: ToolConfig,
    proxyBase = '',
): Promise<ToolResult> {
    const settings = config.settings as BraveSearchSettings;
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

    const response = await fetch(
        `${proxyBase}/res/v1/web/search?${params}`,
        {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': config.apiKey,
                'X-Target-URL': 'https://api.search.brave.com',
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

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd frontend && pnpm test
```

Expected: 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/tools/ frontend/vite.config.ts frontend/package.json
git commit -m "Add Brave Search tool implementation with Vitest tests"
```

---

## Task 8: toolLoop.ts

**Files:**
- Create: `frontend/src/services/toolLoop.ts`
- Create: `frontend/src/services/toolLoop.test.ts`

- [ ] **Step 1: Write failing tests for toolLoop orchestration**

Create `frontend/src/services/toolLoop.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the internal context-expansion logic (pure function, no fetch needed)
import { expandToolCallsToApiMessages } from './toolLoop';
import type { ToolCallRecord } from '@/types';

describe('expandToolCallsToApiMessages', () => {
    it('expands a completed ToolCallRecord into assistant + tool messages', () => {
        const records: ToolCallRecord[] = [{
            id: 'call_1',
            toolName: 'brave_web_search',
            query: 'test query',
            status: 'complete',
            results: [{ title: 'A', url: 'https://a.com', snippet: 'S' }],
        }];

        const messages = expandToolCallsToApiMessages(records, 'Response text');

        expect(messages).toHaveLength(3);
        expect(messages[0].role).toBe('assistant');
        expect(messages[0].tool_calls).toHaveLength(1);
        expect(messages[0].tool_calls![0].id).toBe('call_1');
        expect(messages[1].role).toBe('tool');
        expect(messages[1].tool_call_id).toBe('call_1');
        expect(JSON.parse(messages[1].content as string).results).toHaveLength(1);
        expect(messages[2].role).toBe('assistant');
        expect(messages[2].content).toBe('Response text');
    });

    it('uses error content for failed tool calls', () => {
        const records: ToolCallRecord[] = [{
            id: 'call_err',
            toolName: 'brave_web_search',
            query: 'fail',
            status: 'error',
            errorMessage: 'API down',
        }];

        const messages = expandToolCallsToApiMessages(records, 'Sorry');
        const toolMsg = messages.find(m => m.role === 'tool');
        expect(JSON.parse(toolMsg!.content as string)).toEqual({ error: 'API down' });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && pnpm test
```

Expected: FAIL — `expandToolCallsToApiMessages` not defined.

- [ ] **Step 3: Create `src/services/toolLoop.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';
import type { Message, AppSettings, Persona, ToolCallRecord, ToolConfig } from '@/types';
import type { Provider, ModelConfig } from '@/types/providers';
import { sendMessage, buildOpenAIHeaders, readStream, extractThinkingFromText } from './api';
import { getToolByName, getAllTools } from './tools/registry';
import type { ToolDefinition } from './tools/types';

// Side-effect import: registers braveSearch into the registry
import './tools/braveSearch';

// ─── Context Expansion ────────────────────────────────────────────────────────

interface RawApiMessage {
    role: string;
    content: string | null;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
}

/**
 * Converts stored ToolCallRecord[] (from a persisted Message) back into the
 * OpenAI multi-turn wire format: assistant(tool_calls) + tool(results)... + assistant(content).
 */
export function expandToolCallsToApiMessages(
    toolCalls: ToolCallRecord[],
    assistantContent: string,
): RawApiMessage[] {
    const messages: RawApiMessage[] = [];

    messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
                name: tc.toolName,
                arguments: JSON.stringify({ query: tc.query }),
            },
        })),
    });

    for (const tc of toolCalls) {
        const content = tc.status === 'error'
            ? JSON.stringify({ error: tc.errorMessage ?? 'Unknown error' })
            : JSON.stringify({ results: tc.results ?? [] });

        messages.push({
            role: 'tool',
            content,
            tool_call_id: tc.id,
        });
    }

    messages.push({ role: 'assistant', content: assistantContent });

    return messages;
}

// ─── Context Builder ─────────────────────────────────────────────────────────

/**
 * Converts the app's Message[] into the raw OpenAI message array,
 * expanding any stored toolCalls into multi-turn format.
 */
function buildRawContext(messages: Message[], systemPrompt: string): RawApiMessage[] {
    const raw: RawApiMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of messages) {
        if (msg.role === 'system') continue;

        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            raw.push(...expandToolCallsToApiMessages(msg.toolCalls, msg.content));
        } else {
            raw.push({ role: msg.role, content: msg.content });
        }
    }

    return raw;
}

// ─── Tool Loop ────────────────────────────────────────────────────────────────

export interface ToolLoopOptions {
    messages: Message[];
    settings: AppSettings;
    persona: Persona;
    provider: Provider;
    model: ModelConfig;
    toolConfigs: ToolConfig[];       // all enabled configs from store
    thinkingEnabled: boolean;
    onChunk?: (content: string) => void;
    onThinkingChunk?: (thinking: string) => void;
    onToolCall?: (record: ToolCallRecord) => void;
    onToolResult?: (record: ToolCallRecord) => void;
}

export interface ToolLoopResult {
    content: string;
    thinking?: string;
    toolCalls: ToolCallRecord[];
}

export async function toolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
    const { provider, model, toolConfigs } = opts;

    // Anthropic and tools: out of scope for v1 — fall through to sendMessage
    const activeToolDefs = toolConfigs
        .filter(c => c.enabled)
        .map(c => getToolByName(
            // Map config id to tool name (brave-search → brave_web_search)
            getAllTools().find(t => t.configId === c.id)?.name ?? ''
        ))
        .filter((t): t is ToolDefinition => t !== null);

    if (activeToolDefs.length === 0 || provider.adapter === 'anthropic') {
        const result = await sendMessage({
            messages: opts.messages,
            settings: opts.settings,
            persona: opts.persona,
            provider,
            model,
            thinkingEnabled: opts.thinkingEnabled,
            onChunk: opts.onChunk,
            onThinkingChunk: opts.onThinkingChunk,
        });
        return { ...result, toolCalls: [] };
    }

    // Build system prompt (mirrors api.ts logic)
    const systemPrompt = [
        opts.settings.globalSystemPrompt,
        opts.persona.systemPrompt,
        model.userSystemPrompt,
    ].filter(Boolean).join('\n\n');

    const effectiveSlug = (opts.thinkingEnabled && model.cotSlug) ? model.cotSlug : model.slug;
    const temperature = opts.persona.paramOverrides?.temperature ?? model.defaultTemperature;
    const topP = opts.persona.paramOverrides?.topP ?? model.defaultTopP;
    const maxOutputTokens = opts.persona.paramOverrides?.maxOutputTokens ?? model.maxOutputTokens;

    let baseUrl = provider.baseUrl;
    if (provider.adapter === 'ollama' || provider.adapter === 'ollama-cloud') {
        baseUrl = baseUrl.replace(/\/v1\/?$/, '') + '/v1';
    }
    const extraHeaders: Record<string, string> = {};
    if (provider.adapter === 'ollama-cloud') extraHeaders['X-Target-URL'] = 'https://ollama.com';

    const openAITools = activeToolDefs.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const collectedToolCalls: ToolCallRecord[] = [];
    let context = buildRawContext(opts.messages, systemPrompt);

    for (let iter = 0; iter < 5; iter++) {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { ...buildOpenAIHeaders(provider.apiKey), ...extraHeaders },
            body: JSON.stringify({
                model: effectiveSlug,
                messages: context,
                tools: openAITools,
                tool_choice: 'auto',
                temperature,
                top_p: topP,
                max_tokens: maxOutputTokens,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API error ${response.status}: ${error}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];

        if (choice?.finish_reason !== 'tool_calls' || !choice.message?.tool_calls?.length) {
            break;
        }

        // Execute all tool calls in parallel
        const rawToolCalls: Array<{ id: string; function: { name: string; arguments: string } }> =
            choice.message.tool_calls;

        const records = await Promise.all(
            rawToolCalls.map(async (tc) => {
                let args: Record<string, unknown>;
                try {
                    args = JSON.parse(tc.function.arguments);
                } catch {
                    args = {};
                }

                const record: ToolCallRecord = {
                    id: tc.id,
                    toolName: tc.function.name,
                    query: (args.query as string) ?? tc.function.name,
                    status: 'pending',
                };
                opts.onToolCall?.({ ...record });

                try {
                    const toolDef = getToolByName(tc.function.name);
                    const toolConfig = toolConfigs.find(c => toolDef && c.id === toolDef.configId);
                    if (!toolDef || !toolConfig) throw new Error(`Tool "${tc.function.name}" not found or not configured`);

                    const result = await toolDef.execute(args, toolConfig);
                    const completed: ToolCallRecord = { ...record, status: 'complete', results: result.results };
                    opts.onToolResult?.({ ...completed });
                    return completed;
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    const failed: ToolCallRecord = { ...record, status: 'error', errorMessage };
                    opts.onToolResult?.({ ...failed });
                    return failed;
                }
            }),
        );

        collectedToolCalls.push(...records);

        // Append tool turn to context
        context.push({
            role: 'assistant',
            content: null,
            tool_calls: rawToolCalls.map(tc => ({ id: tc.id, type: 'function', function: tc.function })),
        });
        for (const record of records) {
            const content = record.status === 'error'
                ? JSON.stringify({ error: record.errorMessage })
                : JSON.stringify({ results: record.results ?? [] });
            context.push({ role: 'tool', content, tool_call_id: record.id });
        }
    }

    // Final streaming turn — no tools, get the actual response
    const finalResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...buildOpenAIHeaders(provider.apiKey), ...extraHeaders },
        body: JSON.stringify({
            model: effectiveSlug,
            messages: context,
            temperature,
            top_p: topP,
            max_tokens: maxOutputTokens,
            stream: !!(opts.onChunk || opts.onThinkingChunk),
        }),
    });

    if (!finalResponse.ok) {
        const error = await finalResponse.text();
        throw new Error(`API error ${finalResponse.status}: ${error}`);
    }

    let content = '';
    let thinking: string | undefined;

    if ((opts.onChunk || opts.onThinkingChunk) && finalResponse.body) {
        const streamed = await readStream(finalResponse.body, opts.onChunk, opts.onThinkingChunk);
        content = streamed.content;
        thinking = streamed.thinking;
        if (!thinking && model.supportsCot) {
            const extracted = extractThinkingFromText(content);
            content = extracted.content;
            thinking = extracted.thinking;
        }
    } else {
        const data = await finalResponse.json();
        content = data.choices?.[0]?.message?.content ?? '';
        if (model.supportsCot) {
            const extracted = extractThinkingFromText(content);
            content = extracted.content;
            thinking = extracted.thinking;
        }
    }

    return { content, thinking, toolCalls: collectedToolCalls };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm test
```

Expected: all 5 tests pass.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/toolLoop.ts frontend/src/services/toolLoop.test.ts
git commit -m "Add toolLoop service with multi-turn tool-calling orchestration"
```

---

## Task 9: ToolCallBlock component

**Files:**
- Create: `frontend/src/components/ToolCallBlock.tsx`

This component mirrors the `ThinkingBlock` style from `ChatBubbles.tsx`.

- [ ] **Step 1: Create `src/components/ToolCallBlock.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { ToolCallRecord } from '@/types';

export function ToolCallBlock({
    record,
    color,
}: {
    record: ToolCallRecord;
    color: string;
}) {
    const [open, setOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (contentRef.current) {
            setHeight(open ? contentRef.current.scrollHeight : 0);
        }
    }, [open, record]);

    const isPending = record.status === 'pending';
    const isError = record.status === 'error';

    const label = isPending
        ? `Searching for "${record.query}"…`
        : isError
        ? `Web search failed: "${record.query}"`
        : `Web search: "${record.query}"`;

    return (
        <div style={{ marginBottom: 8 }}>
            <div
                onClick={() => !isPending && setOpen(o => !o)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    cursor: isPending ? 'default' : 'pointer',
                    userSelect: 'none',
                    padding: '5px 12px 5px 8px',
                    borderRadius: 20,
                    border: `1px solid ${open ? color + '44' : 'rgba(255,255,255,0.08)'}`,
                    background: open ? `${color}0e` : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s ease',
                }}
            >
                {/* Icon */}
                <span style={{ fontSize: 12, opacity: isError ? 1 : 0.7 }}>
                    {isError ? '⚠' : '🔍'}
                </span>

                <span style={{
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    fontFamily: "'Courier New', monospace",
                    color: isError ? '#ff6b6b' : open ? color : 'rgba(255,255,255,0.35)',
                    transition: 'color 0.2s',
                    maxWidth: 280,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {label}
                </span>

                {!isPending && !isError && (
                    <span style={{
                        fontSize: 8,
                        color: open ? color : 'rgba(255,255,255,0.2)',
                        transition: 'transform 0.25s ease, color 0.2s',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        display: 'inline-block',
                        marginLeft: 2,
                    }}>
                        ▼
                    </span>
                )}

                {isPending && (
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{
                                width: 4, height: 4, borderRadius: '50%', background: color,
                                animation: 'typingBounce 1.2s ease-in-out infinite',
                                animationDelay: `${i * 0.2}s`, opacity: 0.7,
                            }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Collapsible results */}
            <div style={{ overflow: 'hidden', height, transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                <div
                    ref={contentRef}
                    style={{
                        marginTop: 8,
                        padding: '12px 16px',
                        background: `linear-gradient(135deg, ${color}08 0%, rgba(255,255,255,0.02) 100%)`,
                        border: `1px solid ${color}22`,
                        borderLeft: `2px solid ${color}55`,
                        borderRadius: '4px 12px 12px 12px',
                    }}
                >
                    {record.results && record.results.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {record.results.map((r, i) => (
                                <div key={i}>
                                    <a
                                        href={r.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            fontSize: 12,
                                            color,
                                            textDecoration: 'none',
                                            fontFamily: "'Lora', Georgia, serif",
                                        }}
                                    >
                                        {r.title}
                                    </a>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: "'Courier New', monospace", marginTop: 1, marginBottom: 3 }}>
                                        {r.url}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: "'Lora', Georgia, serif", lineHeight: 1.6 }}>
                                        {r.snippet}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                            No results found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ToolCallBlock.tsx
git commit -m "Add ToolCallBlock collapsible component"
```

---

## Task 10: ToolsSettings component

**Files:**
- Create: `frontend/src/components/ToolsSettings.tsx`

- [ ] **Step 1: Create `src/components/ToolsSettings.tsx`**

```tsx
import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import type { ToolConfig, BraveSearchSettings } from '@/types';

const DEFAULT_BRAVE_SETTINGS: BraveSearchSettings = { safesearch: 'moderate' };
const BRAVE_ID = 'brave-search';

export default function ToolsSettings() {
    const { toolConfigs, addToolConfig, updateToolConfig, removeToolConfig } = useAppStore();
    const braveConfig = toolConfigs.find(c => c.id === BRAVE_ID);

    const [apiKey, setApiKey] = useState(braveConfig?.apiKey ?? '');
    const [enabled, setEnabled] = useState(braveConfig?.enabled ?? false);
    const [settings, setSettings] = useState<BraveSearchSettings>(
        (braveConfig?.settings as BraveSearchSettings) ?? DEFAULT_BRAVE_SETTINGS,
    );
    const [locationOpen, setLocationOpen] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        const config: ToolConfig = {
            id: BRAVE_ID,
            displayName: 'Brave Web Search',
            enabled: enabled && !!apiKey.trim(),
            apiKey: apiKey.trim(),
            settings,
        };
        if (braveConfig) {
            await updateToolConfig(config);
        } else {
            await addToolConfig(config);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '8px 12px',
        color: '#e8e0d4',
        fontSize: 13,
        fontFamily: "'Courier New', monospace",
        outline: 'none',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontFamily: "'Courier New', monospace",
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 6,
        display: 'block',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Brave Web Search */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 15, fontFamily: "'Instrument Serif', Georgia, serif", color: '#fff' }}>Brave Web Search</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Live web search via Brave Search API</div>
                    </div>
                    {/* Enable toggle */}
                    <button
                        onClick={() => setEnabled(v => !v)}
                        style={{
                            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                            background: enabled ? '#4ade80' : 'rgba(255,255,255,0.12)',
                            transition: 'background 0.2s',
                        }}
                        aria-label={enabled ? 'Disable' : 'Enable'}
                        title={!apiKey.trim() ? 'Enter an API key to enable' : undefined}
                    >
                        <div style={{
                            position: 'absolute', top: 3, left: enabled ? 21 : 3,
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            transition: 'left 0.2s',
                        }} />
                    </button>
                </div>

                {/* API Key */}
                <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>API Key</label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="BSA…"
                        style={inputStyle}
                    />
                </div>

                {/* Safesearch */}
                <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Safe Search</label>
                    <select
                        value={settings.safesearch}
                        onChange={e => setSettings(s => ({ ...s, safesearch: e.target.value as BraveSearchSettings['safesearch'] }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                        <option value="off">Off</option>
                        <option value="moderate">Moderate (default)</option>
                        <option value="strict">Strict</option>
                    </select>
                </div>

                {/* Location (collapsible) */}
                <div style={{ marginBottom: 14 }}>
                    <button
                        onClick={() => setLocationOpen(v => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...labelStyle, marginBottom: locationOpen ? 10 : 0 }}
                    >
                        Location (optional) {locationOpen ? '▲' : '▼'}
                    </button>
                    {locationOpen && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {([
                                ['lat', 'Latitude', 'number'],
                                ['long', 'Longitude', 'number'],
                                ['timezone', 'Timezone (IANA)', 'text'],
                                ['city', 'City', 'text'],
                                ['state', 'State Code', 'text'],
                                ['country', 'Country (ISO 2)', 'text'],
                                ['postalCode', 'Postal Code', 'text'],
                            ] as const).map(([key, placeholder, type]) => (
                                <div key={key}>
                                    <label style={{ ...labelStyle, marginBottom: 3 }}>{placeholder}</label>
                                    <input
                                        type={type}
                                        placeholder={placeholder}
                                        value={(settings[key as keyof BraveSearchSettings] as string | number | undefined) ?? ''}
                                        onChange={e => {
                                            const v = e.target.value;
                                            setSettings(s => ({
                                                ...s,
                                                [key]: type === 'number' ? (v === '' ? undefined : Number(v)) : (v || undefined),
                                            }));
                                        }}
                                        style={{ ...inputStyle, fontSize: 12 }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Save button */}
                <button
                    onClick={handleSave}
                    style={{
                        padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: saved ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)',
                        color: saved ? '#4ade80' : 'rgba(255,255,255,0.7)',
                        fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                        fontFamily: "'Courier New', monospace", transition: 'all 0.2s',
                    }}
                >
                    {saved ? 'Saved' : 'Save'}
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ToolsSettings.tsx
git commit -m "Add ToolsSettings component for Brave Web Search config"
```

---

## Task 11: SettingsPage — add Tools tab

**Files:**
- Modify: `frontend/src/components/SettingsPage.tsx`

- [ ] **Step 1: Add the import and extend the tab type**

Add import at the top:
```ts
import ToolsSettings from './ToolsSettings';
```

Change the `activeTab` state type and `TABS` array:

```ts
const [activeTab, setActiveTab] = useState<'api' | 'global' | 'tools'>('api');

const TABS = [
    { id: 'api' as const, label: 'Providers' },
    { id: 'global' as const, label: 'Global' },
    { id: 'tools' as const, label: 'Tools' },
];
```

- [ ] **Step 2: Add the Tools tab panel**

After the `{activeTab === 'global' && ...}` block, add:

```tsx
{activeTab === 'tools' && <ToolsSettings />}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SettingsPage.tsx
git commit -m "Add Tools tab to SettingsPage"
```

---

## Task 12: ChatBubbles — render ToolCallBlock

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx`

- [ ] **Step 1: Add the import**

Add at the top of `ChatBubbles.tsx`:
```ts
import { ToolCallBlock } from './ToolCallBlock';
import type { ToolCallRecord } from '@/types';
```

- [ ] **Step 2: Extend `AssistantBubble` props**

Add to the props type:
```ts
pendingToolCalls?: ToolCallRecord[];  // in-flight records for the currently streaming message
```

- [ ] **Step 3: Render tool call blocks before the message content**

Inside `AssistantBubble`, before the `ThinkingBlock` (or before the message content div if no thinking), add:

```tsx
{/* Tool call blocks — persisted records first, then any in-flight pending ones */}
{(() => {
    const persisted = message.toolCalls ?? [];
    // During streaming, pending calls are shown via props; after streaming, they're in message.toolCalls
    const toShow = isStreaming ? (pendingToolCalls ?? []) : persisted;
    return toShow.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
            {toShow.map(record => (
                <ToolCallBlock key={record.id} record={record} color={persona.color} />
            ))}
        </div>
    ) : null;
})()}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Render ToolCallBlock in AssistantBubble for persisted and in-flight tool calls"
```

---

## Task 13: ChatPage — wire up toolLoop + search pill

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx`

- [ ] **Step 1: Add imports**

```ts
import { toolLoop } from '@/services/toolLoop';
```

Remove or keep `import { sendMessage } from '@/services/api'` — it's no longer called directly from ChatPage.

- [ ] **Step 2: Pull `toolConfigs`, `pendingToolCalls`, and their setters from the store**

In the `useAppStore()` destructure:
```ts
const {
    // ... existing fields ...
    toolConfigs,
    pendingToolCalls,
    addPendingToolCall,
    updatePendingToolCall,
    clearPendingToolCalls,
} = useAppStore();
```

- [ ] **Step 3: Add `searchEnabled` local state**

```ts
const [searchEnabled, setSearchEnabled] = useState(false);
const hasTools = toolConfigs.some(c => c.enabled);
```

- [ ] **Step 4: Replace `sendMessage` call with `toolLoop` in `doSend`**

Replace the `sendMessage({...})` call with:

```ts
const activeToolConfigs = searchEnabled
    ? toolConfigs.filter(c => c.enabled)
    : [];

const result = await toolLoop({
    messages: priorMessages,
    settings,
    persona,
    provider,
    model,
    toolConfigs: activeToolConfigs,
    thinkingEnabled,
    onChunk: updateLastAssistantMessage,
    onThinkingChunk: updateStreamingThinking,
    onToolCall: (record) => {
        addPendingToolCall(record);  // functional update — safe for parallel tool calls
    },
    onToolResult: (record) => {
        updatePendingToolCall(record);
    },
});
```

- [ ] **Step 5: Clear pending tool calls after finalising**

After `await finaliseMessage(result.content, result.thinking)`, add:

```ts
clearPendingToolCalls();
```

When finalising a message that has tool calls, pass them to the store. Modify the `finaliseMessage` call signature isn't needed — instead, before calling it, add the tool calls to the assistant message.

The `finaliseMessage` action in the store only updates `content` and `thinking`. We need to also persist `toolCalls` on the assistant message.

**First, add `updateLastToolCalls` to `AppState` interface in `appStore.ts`** (in the `// ─── Active Chat` section):

```ts
updateLastToolCalls: (toolCalls: ToolCallRecord[]) => void;
```

**And the implementation** (after `removeLastAssistantMessage`):

```ts
updateLastToolCalls(toolCalls) {
    set(s => {
        if (!s.activeChat) return s;
        const messages = [...s.activeChat.messages];
        const last = messages[messages.length - 1];
        if (!last || last.role !== 'assistant') return s;
        messages[messages.length - 1] = { ...last, toolCalls };
        return { activeChat: { ...s.activeChat, messages } };
    });
},
```

**Then in `doSend` in `ChatPage.tsx`**, destructure `updateLastToolCalls` from the store and call it before `finaliseMessage`:

```ts
if (result.toolCalls.length > 0) {
    updateLastToolCalls(result.toolCalls);
}
await finaliseMessage(result.content, result.thinking);
clearPendingToolCalls();
```

- [ ] **Step 6: Pass `pendingToolCalls` to `AssistantBubble`**

In the `messages.map()` loop, find the `AssistantBubble` usage and add the prop:

```tsx
<AssistantBubble
    // ...existing props...
    pendingToolCalls={isStreaming && isLastAssistant ? pendingToolCalls : undefined}
/>
```

- [ ] **Step 7: Add the Web Search pill below the textarea**

Between the textarea container div and the closing `</div>` of the input area, add a new row:

```tsx
{/* Tool pills — shown below input when tools are available */}
{hasTools && (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 4 }}>
        <button
            onClick={() => setSearchEnabled(v => !v)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 20,
                border: `1px solid ${searchEnabled ? persona.color + '66' : 'rgba(255,255,255,0.1)'}`,
                background: searchEnabled ? `${persona.color}22` : 'transparent',
                color: searchEnabled ? persona.color : 'rgba(255,255,255,0.3)',
                fontSize: 11,
                fontFamily: "'Courier New', monospace",
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}
            aria-pressed={searchEnabled}
        >
            <span style={{ fontSize: 12 }}>🔍</span>
            Web Search
        </button>
    </div>
)}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd frontend && pnpm build 2>&1 | head -30
```

Expected: clean compile.

- [ ] **Step 9: Run all tests**

```bash
cd frontend && pnpm test
```

Expected: all tests pass.

- [ ] **Step 10: Manual smoke test**

```bash
cd frontend && pnpm dev
```

1. Go to Settings → Tools, enter a Brave API key, enable the tool, save
2. Open a chat — the Web Search pill should appear below the input
3. Toggle the pill, send a message that requires web search
4. Verify "Searching for X…" block appears, then resolves to "Web search: X" with results
5. Reload the page, reopen the chat — verify the search block still appears from stored `toolCalls`

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/ChatPage.tsx frontend/src/stores/appStore.ts
git commit -m "Wire toolLoop into ChatPage, add search pill and pendingToolCalls display"
```
