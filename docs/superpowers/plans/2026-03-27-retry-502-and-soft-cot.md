# Retry on 502 & Soft CoT Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add silent-retry-on-502 logic to all LLM call sites with a UI indicator in the chat bubble, and a per-persona toggle that injects a soft chain-of-thought prompt for models that don't natively support reasoning.

**Architecture:** `retry502` is a generic fetch-wrapper added to `api.ts` and exported for use in `memory.ts` and `toolLoop.ts`. Retry progress surfaces via an `onRetry` callback that flows up through `toolLoop` options into `ChatPage` state, then into `AssistantBubble` as a prop. Soft CoT is a flag on `Persona` that injects a fixed system-prompt block at the top of the prompt and enables `<think>`-tag extraction.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/services/api.ts` | Add + export `retry502`; add `onRetry` to both adapter option interfaces; wrap fetches in both adapters; add `SOFT_COT_PROMPT` constant; inject soft CoT block in `sendMessage`; update `supportsCot` flag |
| `frontend/src/services/memory.ts` | Import `retry502`; wrap the two `proxiedFetch` calls silently |
| `frontend/src/services/toolLoop.ts` | Add `onRetry` to `ToolLoopOptions`; pass through to `sendMessage`; wrap final-turn fetch; pass `persona.softCotEnabled` into `supportsCot` check |
| `frontend/src/types/index.ts` | Add `softCotEnabled?: boolean` to `Persona` |
| `frontend/src/components/PersonaFormModal.tsx` | Add `softCotEnabled` to form state, `DEFAULT_FORM`, `handleSave`, and a new toggle row in the UI |
| `frontend/src/components/ChatPage.tsx` | Add `retryInfo` state; pass `onRetry` to toolLoop; pass `retryInfo` to `AssistantBubble` |
| `frontend/src/components/ChatBubbles.tsx` | Add `retryInfo` prop to `AssistantBubble`; render `retry n/5` label alongside `TypingIndicator` |

---

## Task 1: Add `retry502` utility to `api.ts` and test it

**Files:**
- Modify: `frontend/src/services/api.ts`
- Test: `frontend/src/services/api.test.ts` (create)

- [ ] **Step 1.1: Create test file and write failing tests**

Create `frontend/src/services/api.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { retry502 } from './api';

function makeResponse(status: number): Response {
    return new Response('', { status });
}

describe('retry502', () => {
    it('returns immediately when response is not 502', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(200));
        const result = await retry502(fn);
        expect(result.status).toBe(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on 502 and returns success on second attempt', async () => {
        const fn = vi.fn()
            .mockResolvedValueOnce(makeResponse(502))
            .mockResolvedValueOnce(makeResponse(200));
        const onRetry = vi.fn();
        const result = await retry502(fn, onRetry, 5, 0);
        expect(result.status).toBe(200);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledWith(2, 5);
    });

    it('calls onRetry with incrementing attempt numbers', async () => {
        const fn = vi.fn()
            .mockResolvedValueOnce(makeResponse(502))
            .mockResolvedValueOnce(makeResponse(502))
            .mockResolvedValueOnce(makeResponse(200));
        const onRetry = vi.fn();
        await retry502(fn, onRetry, 5, 0);
        expect(onRetry).toHaveBeenNthCalledWith(1, 2, 5);
        expect(onRetry).toHaveBeenNthCalledWith(2, 3, 5);
    });

    it('does NOT call onRetry on the first attempt', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(200));
        const onRetry = vi.fn();
        await retry502(fn, onRetry, 5, 0);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it('throws after maxAttempts consecutive 502s', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(502));
        await expect(retry502(fn, undefined, 3, 0)).rejects.toThrow('502 after 3 attempts');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry on non-502 errors', async () => {
        const fn = vi.fn().mockResolvedValue(makeResponse(503));
        const result = await retry502(fn, undefined, 5, 0);
        // non-502 is returned as-is, caller decides what to do
        expect(result.status).toBe(503);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd frontend && pnpm vitest run src/services/api.test.ts
```

Expected: several failures — `retry502` is not exported yet.

- [ ] **Step 1.3: Add `retry502` to `api.ts`**

Add this block directly after the `// ─── Token Estimation` section (around line 11), before `buildContextWindow`:

```ts
// ─── Retry Utility ────────────────────────────────────────────────────────────

export async function retry502<T extends { status: number }>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, max: number) => void,
    maxAttempts = 5,
    delayMs = 3000,
): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const response = await fn();
        if (response.status !== 502) return response;
        if (attempt === maxAttempts) throw new Error(`502 after ${maxAttempts} attempts`);
        onRetry?.(attempt + 1, maxAttempts);
        await new Promise(r => setTimeout(r, delayMs));
    }
    // unreachable
    throw new Error('retry502: unreachable');
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd frontend && pnpm vitest run src/services/api.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/services/api.test.ts
git commit -m "Add retry502 utility with tests"
```

---

## Task 2: Wire `retry502` into `sendOpenAIMessage` and `sendAnthropicMessage`

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 2.1: Add `onRetry` to adapter option interfaces**

In `api.ts`, find `interface OpenAIAdapterOptions` (around line 240) and add one field:

```ts
interface OpenAIAdapterOptions {
    baseUrl: string;
    apiKey: string;
    modelSlug: string;
    systemPrompt: string;
    contextMessages: Message[];
    temperature: number;
    topP: number;
    maxOutputTokens: number;
    supportsCot: boolean;
    extraHeaders?: Record<string, string>;
    extraBodyParams?: Record<string, unknown>;
    onChunk?: (content: string) => void;
    onThinkingChunk?: (thinking: string) => void;
    onRetry?: (attempt: number, max: number) => void;   // ← add this
}
```

Find `interface AnthropicAdapterOptions` (around line 303) and add the same field:

```ts
interface AnthropicAdapterOptions {
    baseUrl: string;
    apiKey: string;
    modelSlug: string;
    systemPrompt: string;
    contextMessages: Message[];
    temperature: number;
    topP: number;
    maxOutputTokens: number;
    onChunk?: (content: string) => void;
    onThinkingChunk?: (thinking: string) => void;
    onRetry?: (attempt: number, max: number) => void;   // ← add this
}
```

- [ ] **Step 2.2: Wrap the fetch call in `sendOpenAIMessage`**

In `sendOpenAIMessage` (around line 270), replace:

```ts
    const response = await proxiedFetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...buildOpenAIHeaders(opts.apiKey), ...(opts.extraHeaders ?? {}) },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
    }
```

with:

```ts
    const response = await retry502(
        () => proxiedFetch(`${opts.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { ...buildOpenAIHeaders(opts.apiKey), ...(opts.extraHeaders ?? {}) },
            body: JSON.stringify(body),
        }),
        opts.onRetry,
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
    }
```

- [ ] **Step 2.3: Wrap the fetch call in `sendAnthropicMessage`**

In `sendAnthropicMessage` (around line 329), replace:

```ts
    const response = await proxiedFetch(`${opts.baseUrl}/messages`, {
        method: 'POST',
        headers: buildAnthropicHeaders(opts.apiKey),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }
```

with:

```ts
    const response = await retry502(
        () => proxiedFetch(`${opts.baseUrl}/messages`, {
            method: 'POST',
            headers: buildAnthropicHeaders(opts.apiKey),
            body: JSON.stringify(body),
        }),
        opts.onRetry,
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }
```

- [ ] **Step 2.4: Add `onRetry` to `SendMessageOptions` and pass through**

Find `export interface SendMessageOptions` (around line 138) and add:

```ts
export interface SendMessageOptions {
    messages: Message[];
    settings: AppSettings;
    persona: Persona;
    provider: Provider;
    model: ModelConfig;
    thinkingEnabled: boolean;
    onChunk?: (content: string) => void;
    onThinkingChunk?: (thinking: string) => void;
    onRetry?: (attempt: number, max: number) => void;   // ← add this
}
```

In `sendMessage`, destructure it and pass to both adapters:

```ts
const { messages, settings, persona, provider, model, thinkingEnabled, onChunk, onThinkingChunk, onRetry } = options;
```

In the Anthropic branch (around line 189):
```ts
        const result = await sendAnthropicMessage({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            modelSlug: effectiveSlug,
            systemPrompt,
            contextMessages,
            temperature,
            topP,
            maxOutputTokens,
            onChunk,
            onThinkingChunk,
            onRetry,         // ← add
        });
```

In the OpenAI branch (around line 220):
```ts
    const result = await sendOpenAIMessage({
        baseUrl,
        apiKey: provider.apiKey,
        modelSlug: effectiveSlug,
        systemPrompt,
        contextMessages,
        temperature,
        topP,
        maxOutputTokens,
        supportsCot: effectiveCot,
        extraHeaders,
        extraBodyParams,
        onChunk,
        onThinkingChunk,
        onRetry,         // ← add
    });
```

- [ ] **Step 2.5: Build check**

```bash
cd frontend && pnpm build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 2.6: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "Wire retry502 into sendOpenAIMessage and sendAnthropicMessage"
```

---

## Task 3: Wire `retry502` into `memory.ts` (silent)

**Files:**
- Modify: `frontend/src/services/memory.ts`

- [ ] **Step 3.1: Import `retry502`**

At the top of `memory.ts`, add to the existing import from `@/services/api`:

```ts
import { buildOpenAIHeaders, retry502 } from '@/services/api';
```

(Replace the existing `import { buildOpenAIHeaders } from '@/services/api';`)

- [ ] **Step 3.2: Wrap fetch in `_callMemoryWorkerInner`**

In `_callMemoryWorkerInner` (around line 44), replace:

```ts
    const response = await proxiedFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildOpenAIHeaders(provider.apiKey),
        body: JSON.stringify({
            model: model.slug,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            stream: false,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Memory worker error ${response.status}: ${error}`);
    }
```

with:

```ts
    const response = await retry502(() => proxiedFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildOpenAIHeaders(provider.apiKey),
        body: JSON.stringify({
            model: model.slug,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 4096,
            stream: false,
        }),
    }));

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Memory worker error ${response.status}: ${error}`);
    }
```

- [ ] **Step 3.3: Wrap fetch in `callAnthropic`**

In `callAnthropic` (around line 74), replace:

```ts
    const response = await proxiedFetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: model.slug,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            temperature: 0.3,
            max_tokens: 4096,
            stream: false,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Memory worker (Anthropic) error ${response.status}: ${error}`);
    }
```

with:

```ts
    const response = await retry502(() => proxiedFetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: model.slug,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            temperature: 0.3,
            max_tokens: 4096,
            stream: false,
        }),
    }));

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Memory worker (Anthropic) error ${response.status}: ${error}`);
    }
```

- [ ] **Step 3.4: Build check**

```bash
cd frontend && pnpm build
```

Expected: exits 0.

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/services/memory.ts
git commit -m "Add silent retry502 to memory worker calls"
```

---

## Task 4: Wire `onRetry` through `toolLoop` and connect to `ChatPage`

**Files:**
- Modify: `frontend/src/services/toolLoop.ts`
- Modify: `frontend/src/components/ChatPage.tsx`

- [ ] **Step 4.1: Add `onRetry` to `ToolLoopOptions` and import `retry502`**

In `toolLoop.ts`, add `retry502` to the import from `./api`:

```ts
import { sendMessage, buildOpenAIHeaders, readStream, extractThinkingFromText, buildContextWindow, retry502 } from './api';
```

Find the `interface ToolLoopOptions` (or `ToolLoopOpts` — look for where `onChunk` and `onThinkingChunk` are declared, around line 90) and add:

```ts
    onRetry?: (attempt: number, max: number) => void;
```

- [ ] **Step 4.2: Pass `onRetry` to `sendMessage` (no-tools path)**

In toolLoop, find the `sendMessage` call (around line 117):

```ts
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
```

Add `onRetry`:

```ts
        const result = await sendMessage({
            messages: opts.messages,
            settings: opts.settings,
            persona: opts.persona,
            provider,
            model,
            thinkingEnabled: opts.thinkingEnabled,
            onChunk: opts.onChunk,
            onThinkingChunk: opts.onThinkingChunk,
            onRetry: opts.onRetry,
        });
```

- [ ] **Step 4.3: Wrap the final-turn fetch in the tools path**

In toolLoop, find the final streaming fetch (around line 245):

```ts
    const finalResponse = await proxiedFetch(`${baseUrl}/chat/completions`, {
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
```

Replace with:

```ts
    const finalResponse = await retry502(
        () => proxiedFetch(`${baseUrl}/chat/completions`, {
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
        }),
        opts.onRetry,
    );

    if (!finalResponse.ok) {
        const error = await finalResponse.text();
        throw new Error(`API error ${finalResponse.status}: ${error}`);
    }
```

- [ ] **Step 4.4: Add `retryInfo` state and `onRetry` handler in `ChatPage`**

In `ChatPage.tsx`, add the state near the other local state declarations (look for `const [error, setError] = useState` or similar, around line 30–60):

```ts
const [retryInfo, setRetryInfo] = useState<{ attempt: number; max: number } | null>(null);
```

In `doSend`, find the `toolLoop` call and add `onRetry`:

```ts
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
                    addPendingToolCall(record);
                },
                onToolResult: (record) => {
                    updatePendingToolCall(record);
                },
                onRetry: (attempt, max) => setRetryInfo({ attempt, max }),
            });
```

In the `finally` block of `doSend`, add `setRetryInfo(null)` alongside `setIsStreaming(false)`:

```ts
        } finally {
            clearPendingToolCalls();
            setIsStreaming(false);
            setRetryInfo(null);
        }
```

Also add `setRetryInfo` to the `useCallback` dependency array of `doSend`:

The current deps array ends around line 378. Since `setRetryInfo` is a state setter (stable reference), it technically doesn't need to be in the deps, but include it to be explicit if desired — React setters are stable so omitting is fine too.

- [ ] **Step 4.5: Pass `retryInfo` to `AssistantBubble`**

In `ChatPage.tsx`, find the `<AssistantBubble` JSX (around line 583):

```tsx
                                <AssistantBubble
                                    key={msg.id}
                                    message={msg}
                                    persona={persona}
                                    isStreaming={isStreaming && isLastAssistant}
                                    streamingThinking={isStreaming && isLastAssistant ? streamingThinking : undefined}
                                    thinkingBlockOpen={thinkingBlockOpen}
                                    onThinkingToggle={setThinkingBlockOpen}
                                    pendingToolCalls={isStreaming && isLastAssistant ? pendingToolCalls : undefined}
                                />
```

Add `retryInfo`:

```tsx
                                <AssistantBubble
                                    key={msg.id}
                                    message={msg}
                                    persona={persona}
                                    isStreaming={isStreaming && isLastAssistant}
                                    streamingThinking={isStreaming && isLastAssistant ? streamingThinking : undefined}
                                    thinkingBlockOpen={thinkingBlockOpen}
                                    onThinkingToggle={setThinkingBlockOpen}
                                    pendingToolCalls={isStreaming && isLastAssistant ? pendingToolCalls : undefined}
                                    retryInfo={isStreaming && isLastAssistant ? retryInfo ?? undefined : undefined}
                                />
```

- [ ] **Step 4.6: Build check**

```bash
cd frontend && pnpm build
```

Expected: TypeScript will report an error that `retryInfo` is not a known prop on `AssistantBubble` — this is intentional. Task 5 adds the prop. You can skip this build check and go straight to Task 5, then do one build check covering both tasks.

- [ ] **Step 4.7: Commit**

```bash
git add frontend/src/services/toolLoop.ts frontend/src/components/ChatPage.tsx
git commit -m "Wire onRetry through toolLoop and ChatPage retry state"
```

---

## Task 5: Show retry indicator in `AssistantBubble`

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx`

- [ ] **Step 5.1: Add `retryInfo` prop to `AssistantBubble`**

Find `export function AssistantBubble({...})` (around line 227). Add `retryInfo` to the destructured props and the prop type:

```ts
export function AssistantBubble({
    message, persona, isStreaming, streamingThinking, thinkingBlockOpen, onThinkingToggle, pendingToolCalls, retryInfo,
}: {
    message: Message;
    persona: Persona;
    isStreaming?: boolean;
    streamingThinking?: string;
    thinkingBlockOpen?: boolean;
    onThinkingToggle?: (open: boolean) => void;
    pendingToolCalls?: ToolCallRecord[];
    retryInfo?: { attempt: number; max: number };
}) {
```

- [ ] **Step 5.2: Render `retry n/max` alongside the `TypingIndicator`**

Find the section in `AssistantBubble` that renders the bubble content (around line 327):

```tsx
                    {isStreaming ? (
                        <TypingIndicator color={persona.color} />
                    ) : (
```

Replace with:

```tsx
                    {isStreaming ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <TypingIndicator color={persona.color} />
                            {retryInfo && (
                                <span style={{
                                    fontSize: 10,
                                    fontFamily: "'Courier New', monospace",
                                    letterSpacing: '0.1em',
                                    color: persona.color,
                                    opacity: 0.7,
                                }}>
                                    retry {retryInfo.attempt}/{retryInfo.max}
                                </span>
                            )}
                        </div>
                    ) : (
```

- [ ] **Step 5.3: Build check**

```bash
cd frontend && pnpm build
```

Expected: exits 0, no errors.

- [ ] **Step 5.4: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Show retry n/max label in AssistantBubble alongside typing indicator"
```

---

## Task 6: Add `softCotEnabled` to the `Persona` type

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 6.1: Add the field**

In `src/types/index.ts`, find the `Persona` interface. After `memoryEnabled?: boolean;`, add:

```ts
    softCotEnabled?: boolean;       // injects <think>-tag CoT prompt for non-native reasoning models
```

- [ ] **Step 6.2: Build check**

```bash
cd frontend && pnpm build
```

Expected: exits 0. No other files reference this field yet so no cascade errors.

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "Add softCotEnabled field to Persona type"
```

---

## Task 7: Inject soft CoT prompt in `sendMessage`

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 7.1: Add the `SOFT_COT_PROMPT` constant**

In `api.ts`, add this constant after the `// ─── Token Estimation` section (above `buildContextWindow`, below `retry502`):

```ts
// ─── Soft CoT Prompt ──────────────────────────────────────────────────────────

const SOFT_COT_PROMPT = `## RESPONSE FORMAT:

Prepend your actual response with the following block:

<think> reasoning here, see below </think>

REASONING:
Talk to yourself about the user prompt, explore user intent, attempt to read subtext and emotional / sentiment cues, especially (but not only) from emojis, but also from the style of language the user uses. Be creative, allow "gut feeling" to gently mix into it. In roleplays of any kind analyze context, character psychology and setting here. In roleplay aim for psychological analysis as well.`;
```

- [ ] **Step 7.2: Inject block and update `supportsCot` in `sendMessage`**

In `sendMessage` (around line 160), find the system prompt construction:

```ts
    // Build system prompt: global → persona → memory → knowledge → per-model user addition
    const systemPrompt = [
        settings.globalSystemPrompt,
        persona.systemPrompt,
        memoryBlock,
        knowledgeBlock,
        model.userSystemPrompt,
    ].filter(Boolean).join('\n\n');
```

Replace with:

```ts
    // Build system prompt: soft CoT (if enabled) → global → persona → memory → knowledge → per-model user addition
    const systemPrompt = [
        persona.softCotEnabled ? SOFT_COT_PROMPT : '',
        settings.globalSystemPrompt,
        persona.systemPrompt,
        memoryBlock,
        knowledgeBlock,
        model.userSystemPrompt,
    ].filter(Boolean).join('\n\n');
```

Find the `effectiveCot` line:

```ts
    const effectiveCot = thinkingEnabled && (!!model.cotSlug || model.supportsCot);
```

Replace with:

```ts
    const effectiveCot = (thinkingEnabled && (!!model.cotSlug || model.supportsCot)) || !!persona.softCotEnabled;
```

- [ ] **Step 7.3: Build check**

```bash
cd frontend && pnpm build
```

Expected: exits 0.

- [ ] **Step 7.4: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "Inject soft CoT system prompt and enable <think> extraction when softCotEnabled"
```

---

## Task 8: Update `toolLoop` to honour `softCotEnabled` in the tools path

**Files:**
- Modify: `frontend/src/services/toolLoop.ts`

The tools path in `toolLoop` (when actual tool calls are made) has its own `supportsCot` check that bypasses `sendMessage`. It must also respect `persona.softCotEnabled`.

- [ ] **Step 8.1: Update the streaming CoT extraction**

In `toolLoop.ts`, find this block (around line 266):

```ts
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
```

Replace both `model.supportsCot` checks with `model.supportsCot || !!opts.persona.softCotEnabled`:

```ts
    const supportsCot = model.supportsCot || !!opts.persona.softCotEnabled;

    if ((opts.onChunk || opts.onThinkingChunk) && finalResponse.body) {
        const streamed = await readStream(finalResponse.body, opts.onChunk, opts.onThinkingChunk);
        content = streamed.content;
        thinking = streamed.thinking;
        if (!thinking && supportsCot) {
            const extracted = extractThinkingFromText(content);
            content = extracted.content;
            thinking = extracted.thinking;
        }
    } else {
        const data = await finalResponse.json();
        content = data.choices?.[0]?.message?.content ?? '';
        if (supportsCot) {
            const extracted = extractThinkingFromText(content);
            content = extracted.content;
            thinking = extracted.thinking;
        }
    }
```

- [ ] **Step 8.2: Build check**

```bash
cd frontend && pnpm build
```

Expected: exits 0.

- [ ] **Step 8.3: Commit**

```bash
git add frontend/src/services/toolLoop.ts
git commit -m "Honour softCotEnabled in toolLoop tools-path CoT extraction"
```

---

## Task 9: Add Soft CoT toggle to `PersonaFormModal`

**Files:**
- Modify: `frontend/src/components/PersonaFormModal.tsx`

- [ ] **Step 9.1: Add `softCotEnabled` to `DEFAULT_FORM`**

Find `const DEFAULT_FORM = {` (around line 48). Add the field:

```ts
const DEFAULT_FORM = {
    name: '',
    tagline: '',
    systemPrompt: '',
    paletteIndex: 0,
    showThinking: false,
    thinkingEnabled: false,
    memoryEnabled: true,
    softCotEnabled: false,   // ← add
    modelId: null as string | null,
    knowledgeCollectionIds: [] as string[],
};
```

- [ ] **Step 9.2: Populate from existing persona in edit mode**

Find the initialiser block inside `useState(() => { if (persona) { ... } })` (around line 71). Add alongside the other fields:

```ts
                softCotEnabled: persona.softCotEnabled ?? false,
```

- [ ] **Step 9.3: Include in `handleSave`**

Find the `data` object in `handleSave` (around line 96). Add:

```ts
                softCotEnabled: form.softCotEnabled,
```

- [ ] **Step 9.4: Add the toggle row in the UI**

Find the "Enable Thinking by Default" toggle row (ending around line 259). Directly **after** its closing `</div>`, add a new toggle row for Soft CoT, followed by the note line:

```tsx
                    {/* Soft CoT toggle */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 0',
                            marginBottom: 4,
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>Soft CoT</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Instructs non-native reasoning models to think via &lt;think&gt; tags</div>
                        </div>
                        <Toggle
                            checked={form.softCotEnabled}
                            color={palette.color}
                            onChange={v => setForm(f => ({ ...f, softCotEnabled: v }))}
                        />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 16, paddingLeft: 2 }}>
                        Also enable "Show Thinking" to see the reasoning block
                    </div>
```

- [ ] **Step 9.5: Build check**

```bash
cd frontend && pnpm build
```

Expected: exits 0.

- [ ] **Step 9.6: Commit**

```bash
git add frontend/src/components/PersonaFormModal.tsx
git commit -m "Add Soft CoT toggle to persona configuration"
```

---

## Task 10: Run all tests and verify

- [ ] **Step 10.1: Run full test suite**

```bash
cd frontend && pnpm vitest run
```

Expected: all tests pass including the new `api.test.ts` tests.

- [ ] **Step 10.2: Final build**

```bash
cd frontend && pnpm build
```

Expected: exits 0, no errors or warnings about missing types.

- [ ] **Step 10.3: Tag completion**

```bash
git log --oneline -10
```

Verify the commit history shows all tasks committed cleanly.
