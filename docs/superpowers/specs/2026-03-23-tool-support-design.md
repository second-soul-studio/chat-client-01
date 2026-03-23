# Tool Support Design — Second Soul

**Date:** 2026-03-23
**Status:** Approved
**Pilot tool:** Brave Web Search

---

## Overview

Add native OpenAI function-calling (tool use) support to Second Soul, starting with Brave Web Search as the first tool. The architecture is designed to be extensible: new tools can be added as individual files without touching the core chat flow.

---

## Decisions

| Question | Decision |
|---|---|
| Tool availability scope | Global (API key configured + enabled) + per-conversation toggle |
| Mechanism | Native OpenAI function calling only — no prompt injection fallback |
| Storage | New `tool_configs` IndexedDB store, analogous to `providers` |
| Message persistence | Compact (query + top-3 results) stored on `Message.toolCalls` |
| CORS | Route Brave API calls through existing Go proxy |
| UI — toggle | Pill below the textarea input, visible only when a tool is globally available |
| UI — tool call display | Collapsible block inside AssistantBubble, "Searching for X…" while pending, "Web search: X" when complete |

---

## Data Model

### IndexedDB version

`db.ts` must bump the schema version from 2 → 3 and add the `tool_configs` object store in the `upgrade()` callback.

### New IndexedDB store: `tool_configs`

```ts
interface ToolConfig {
    id: string;                        // e.g. 'brave-search'
    displayName: string;
    enabled: boolean;                  // globally available
    apiKey: string;
    settings: Record<string, unknown>; // tool-specific settings
}
```

Brave-specific settings shape:

```ts
interface BraveSearchSettings {
    safesearch: 'off' | 'moderate' | 'strict'; // default: 'moderate'
    // Optional location headers — all optional
    lat?: number;
    long?: number;
    timezone?: string;
    city?: string;
    state?: string;
    stateName?: string;
    country?: string;     // ISO 3166-1 alpha-2
    postalCode?: string;
}
```

### Message type extension

New optional field on the existing `Message` interface:

```ts
interface ToolCallRecord {
    id: string;           // tool_call_id from OpenAI response
    toolName: string;     // e.g. 'brave_web_search'
    query: string;        // Brave-specific convenience field; represents the primary display label for any tool
    status: 'pending' | 'complete' | 'error';
    results?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
    errorMessage?: string;
}

// Added to Message:
toolCalls?: ToolCallRecord[];
```

Only the top 3 results are stored. When rebuilding the context window for subsequent API calls, stored `toolCalls` are expanded into the multi-turn API format:
1. `{ role: 'assistant', content: null, tool_calls: [...] }`
2. `{ role: 'tool', tool_call_id: '...', content: JSON.stringify(results) }` per tool call
3. `{ role: 'assistant', content: '...' }` — the final response text

---

## Service Architecture

### New files

```
src/services/tools/types.ts       Tool interface and shared types
src/services/tools/braveSearch.ts Brave Search tool implementation
src/services/tools/registry.ts    Tool registry (mirrors modelMeta/registry.ts pattern)
src/services/toolLoop.ts          Multi-turn tool-calling orchestrator
```

### Tool interface (`tools/types.ts`)

```ts
interface ToolDefinition {
    name: string;                        // OpenAI function name, e.g. 'brave_web_search'
    description: string;                 // shown to the model
    parameters: Record<string, unknown>; // JSON Schema for function arguments
    execute: (args: unknown, config: ToolConfig) => Promise<unknown>;
}
```

### Tool loop flow (`toolLoop.ts`)

`toolLoop` replaces the direct `sendMessage` call in `ChatPage`. It accepts the same inputs as `sendMessage` plus an active tools list and additional callbacks.

```
toolLoop(messages, settings, persona, provider, model, activeTools, thinkingEnabled, callbacks):
  1. Non-streaming API call with tools array defined
  2. If finish_reason === 'tool_calls':
       a. The response may contain multiple tool calls — execute all in parallel (Promise.all)
       b. For each tool call: fire onToolCall(record) → UI shows "Searching for X…"
       c. Execute tool via registry; on error, set status 'error' and errorMessage
       d. Fire onToolResult(record) → UI updates block to complete or error state
       e. Append to context:
          - { role: 'assistant', content: null, tool_calls: [...all tool calls] }
          - { role: 'tool', tool_call_id, content: JSON.stringify(results) } per tool
            (on error: content = JSON.stringify({ error: errorMessage }))
       f. Repeat from step 1 (max 5 iterations to prevent infinite loops)
  3. Final API call without tools → streaming (onChunk / onThinkingChunk / thinkingEnabled)
     Note: omitting tools on the final call is intentional — the max-iterations guard already
     handles runaway loops; the final turn should produce a user-facing response, not more calls.
  4. Return { content, thinking, toolCalls: ToolCallRecord[] }
```

Context reconstruction from stored `ToolCallRecord[]` is entirely the responsibility of `toolLoop.ts`. When replaying a prior conversation turn that has `toolCalls`, expand each record as described in step 2e above. The `buildContextWindow` token estimator in `api.ts` must also account for tool result content when calculating budget — each `ToolCallRecord` contributes approximately `estimateTokens(JSON.stringify(results))` tokens.

`api.ts` is not modified. `toolLoop.ts` exports the auth header builders it needs from `api.ts` (small export additions only).

### Brave Search implementation (`tools/braveSearch.ts`)

- Endpoint: `GET https://api.search.brave.com/res/v1/web/search?q=<query>`
- Required headers: `Accept: application/json`, `X-Subscription-Token: <apiKey>`
- Routed through the Go proxy using `X-Target-URL: https://api.search.brave.com`
- Optional location headers forwarded from `BraveSearchSettings`
- Returns top 3 results from `response.web.results` (title, url, description)

**Go proxy changes required:**

1. `ALLOWED_UPSTREAM_URLS` must include `https://api.search.brave.com` (env var / `compose.yml` / `.env.example`)
2. `backend/main.go` — `setCORSHeaders()` must add `X-Subscription-Token` to `Access-Control-Allow-Headers`, otherwise the browser will block the preflight request:

```go
w.Header().Set("Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Target-URL, X-Subscription-Token")
```

---

## UI

### Web Search pill (ChatPage)

Rendered below the textarea input, in its own row. Visible only when at least one tool is globally enabled.

- **Active state:** pill background in persona accent colour, label "Web Search"
- **Inactive state:** dimmed, same accent colour at low opacity
- Clicking toggles per-conversation search on/off
- State is local to the conversation (not persisted)

### ToolCallBlock component

Rendered inside `AssistantBubble`, before the response text. Collapsible, consistent with the existing CoT block style.

**While searching:**
```
▶  Searching for "query text"…
```

**After completion:**
```
▶  Web search: "query text"
```
Expanded view shows the top-3 results as a compact list: title (linked), URL, snippet.

**On error:**
```
▶  Web search failed: "query text"
```

### Tools tab (SettingsPage)

New tab alongside "Providers" and "Global".

- **Brave Web Search** section:
  - Enabled toggle
  - API Key input (masked)
  - Safesearch dropdown: `off` / `moderate` / `strict` (default: `moderate`)
  - Collapsible "Location" section with optional fields: Lat, Long, Timezone, City, State, Country, Postal Code

---

## Modified files

| File | Change |
|---|---|
| `src/types/index.ts` | Add `ToolCallRecord`, extend `Message` with `toolCalls?` |
| `src/services/db.ts` | Add `tool_configs` object store, CRUD helpers |
| `src/stores/appStore.ts` | Add `toolConfigs` state, `addToolConfig`, `updateToolConfig`, `removeToolConfig` actions; extend `init()` to load tool configs; add `pendingToolCalls: ToolCallRecord[]` for in-progress UI state |
| `src/services/api.ts` | Export `buildOpenAIHeaders`, `buildAnthropicHeaders` (currently private) |
| `src/components/ChatPage.tsx` | Use `toolLoop` instead of `sendMessage`; add web search pill (local `searchEnabled` boolean, default `false`; shown only when at least one tool is globally enabled); pass `onToolCall`/`onToolResult` callbacks that update `pendingToolCalls` in the store |
| `src/components/ChatBubbles.tsx` | Render `ToolCallBlock` for messages with `toolCalls` |
| `src/components/SettingsPage.tsx` | Add "Tools" tab; extend tab type from `'api' \| 'global'` to `'api' \| 'global' \| 'tools'` |
| `backend/main.go` | Add `X-Subscription-Token` to `Access-Control-Allow-Headers` |
| `backend/.env.example` / `compose.yml` | Add `https://api.search.brave.com` to `ALLOWED_UPSTREAM_URLS` example |

---

## Out of scope (first iteration)

- JavaScript execution tool (future)
- Per-persona tool configuration
- "Drop tool results from context after N turns" toggle
- Streaming tool call argument parsing
- Anthropic native tool calling (uses different wire format — can be added later)
