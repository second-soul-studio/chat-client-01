# Design: Retry on 502 & Soft CoT Toggle

**Date:** 2026-03-27
**Status:** Approved

---

## Feature 1: Retry on 502

### Problem

Ollama occasionally returns HTTP 502 while loading a model. Without retry logic the user sees an immediate error. All three call sites — chat, memory detection, and memory consolidation — are affected.

### Retry Utility

A `retry502<T>` helper in `api.ts`:

```ts
async function retry502<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, max: number) => void,
    maxAttempts = 5,
    delayMs = 3000,
): Promise<T>
```

- Calls `fn()`.
- If the result is a `Response` with `status === 502`, waits `delayMs` ms and retries.
- `onRetry(attempt, max)` is called starting from attempt **2** (i.e. the first retry), never on the first attempt.
- Any other error or non-502 HTTP status is re-thrown immediately.
- After `maxAttempts` failures, throws `Error('502 after N retries')`.

Retry wraps **only the HTTP fetch call**, not the full `sendMessage` pipeline (memory/knowledge building is not repeated).

### Call Sites

| File | Function | UI feedback |
|------|----------|-------------|
| `api.ts` | `sendOpenAIMessage` | yes — via `onRetry` callback |
| `api.ts` | `sendAnthropicMessage` | yes — via `onRetry` callback |
| `memory.ts` | `_callMemoryWorkerInner` | silent — no callback needed |

### Signal Chain (chat path)

```
retry502 → onRetry(attempt, max)
  → OpenAIAdapterOptions.onRetry / AnthropicAdapterOptions.onRetry
    → SendMessageOptions.onRetry
      → toolLoop options
        → ChatPage.doSend
          → setRetryInfo({ attempt, max })   // local React state
```

`retryInfo` is reset to `null` in the `finally` block of `doSend`.

### UI in AssistantBubble

While `isStreaming && content === ''` the bubble shows the "waiting pill".

- **Normal (first attempt):** three bouncing dots (`<TypingIndicator>`)
- **Retrying:** three bouncing dots **+** text label `retry 2/5` to the right, in the persona accent colour, monospace font, small (10–11px)

`AssistantBubble` receives an optional prop:

```ts
retryInfo?: { attempt: number; max: number }
```

This prop is only passed when retrying; on the first attempt it is `undefined`, so the existing appearance is unchanged.

---

## Feature 2: Soft CoT Toggle

### Problem

Models that do not natively support chain-of-thought (e.g. Mistral Large 3) can still be instructed to reason via `<think>` tags in the system prompt. This should be a per-persona toggle so the user can opt in without touching the system prompt manually.

### Type Change

`Persona` in `src/types/index.ts`:

```ts
softCotEnabled?: boolean;   // default false/undefined — prompt-injected CoT for non-native models
```

### System Prompt Injection

In `sendMessage()` in `api.ts`, the soft CoT block is prepended **before** all other prompt segments:

```ts
const SOFT_COT_PROMPT = `## RESPONSE FORMAT:

Prepend your actual response with the following block:

<think> reasoning here, see below </think>

REASONING:
Talk to yourself about the user prompt, explore user intent, attempt to read subtext and emotional / sentiment cues, especially (but not only) from emojis, but also from the style of language the user uses. Be creative, allow "gut feeling" to gently mix into it. In roleplays of any kind analyze context, character psychology and setting here. In roleplay aim for psychological analysis as well.`;

const softCotBlock = persona.softCotEnabled ? SOFT_COT_PROMPT : '';

const systemPrompt = [
    softCotBlock,
    settings.globalSystemPrompt,
    persona.systemPrompt,
    memoryBlock,
    knowledgeBlock,
    model.userSystemPrompt,
].filter(Boolean).join('\n\n');
```

### CoT Extraction

Because soft CoT produces `<think>…</think>` tags, `extractThinkingFromText` must be applied. This happens when `supportsCot: true` in the OpenAI adapter. The flag is set as:

```ts
supportsCot: effectiveCot || !!persona.softCotEnabled
```

### PersonaFormModal

New toggle in the Character section, directly below "Enable Thinking by Default":

- **Label:** `Soft CoT`
- **Sublabel:** `Instructs non-native reasoning models to think via <think> tags`
- **Note below toggle row (11px, dimmed):** *Also enable "Show Thinking" to see the reasoning block*

`DEFAULT_FORM` gains `softCotEnabled: false`.
`handleSave` includes `softCotEnabled: form.softCotEnabled` in the persisted data.

---

## Out of Scope

- Configurable retry count or delay (hardcoded 5 / 3s is sufficient).
- Retry for non-502 errors (e.g. 503, network timeouts).
- Automatic enabling of `showThinking` when `softCotEnabled` is toggled on.
