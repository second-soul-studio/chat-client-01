# Playbook 05 — Token Estimate (tiktoken)

**Priority:** Low — quality-of-life improvement.
**Scope:** New dependency + swap out one calculation in `MemoryPage.tsx`.
**Depends on:** Nothing — fully independent.

---

## Context

Read before starting:
- `MEMORY-SYSTEM-PROPOSALS.md` — proposal #5
- `frontend/src/components/MemoryPage.tsx` — find the current token estimate logic

---

## Problem

The Memory Page displays an estimated token count for the memory block that will be
injected into the system prompt. The current estimate divides character count by 4.

This breaks for:
- **Japanese / CJK text** — characters are ~1 token each, not 0.25
- **ASCII art** — each character is typically 1 token
- **Emoji** — often 1–3 tokens each regardless of character count
- **Code / punctuation-heavy text** — tokenises differently than prose

The result can be wildly wrong, which undermines the usefulness of the estimate.

---

## Solution

Use `tiktoken` (the official OpenAI tokeniser, available as an NPM package with WASM
support for browsers) with the `cl100k_base` encoding.

`cl100k_base` is used by GPT-4 and is a reasonable cross-model approximation — it
tends to be slightly pessimistic for Claude and Mistral, which is the correct
direction (better to overestimate than underestimate).

---

## Implementation

### 1. Install the package

```bash
cd frontend
pnpm add tiktoken
```

`tiktoken` ships a WASM binary. Vite handles WASM imports natively — no additional
config should be needed, but verify with a test build after adding.

### 2. Create a small utility

New file: `frontend/src/services/tokenCount.ts`

```ts
import { get_encoding } from 'tiktoken';

// Lazily initialise the encoder — WASM init is async-ish but get_encoding is sync
// after the module loads. Keep a single instance.
let enc: ReturnType<typeof get_encoding> | null = null;

function getEncoder() {
    if (!enc) {
        enc = get_encoding('cl100k_base');
    }
    return enc;
}

export function countTokens(text: string): number {
    try {
        return getEncoder().encode(text).length;
    } catch {
        // Fallback if WASM is not yet ready or encoding fails
        return Math.ceil(text.length / 4);
    }
}
```

### 3. Update MemoryPage

Find the token estimate in `MemoryPage.tsx`. It likely looks something like:

```ts
const tokenEstimate = Math.ceil(someText.length / 4);
```

Replace with:

```ts
import { countTokens } from '@/services/tokenCount';
// ...
const tokenEstimate = countTokens(someText);
```

### 4. Update the display label

Change the displayed label from something like "~X tokens" to **"~X tokens (estimated)"**
to make clear this is an approximation. Different providers use different tokenisers —
the estimate is indicative, not exact.

---

## Vite / WASM Notes

If the build complains about the WASM asset:

- Add to `vite.config.ts`:
  ```ts
  optimizeDeps: {
      exclude: ['tiktoken'],
  }
  ```
- Or use the `@dqbd/tiktoken` package as an alternative — same API, sometimes easier
  with Vite bundling.

Check the tiktoken README for current Vite compatibility notes before starting.

---

## Done when

- [ ] `tiktoken` (or `@dqbd/tiktoken`) added to `frontend/package.json`
- [ ] `frontend/src/services/tokenCount.ts` exists with `countTokens()`
- [ ] `MemoryPage` uses `countTokens()` instead of `/ 4`
- [ ] Display label says "estimated"
- [ ] `pnpm build` succeeds with no WASM-related errors
- [ ] Manual test: paste a block of Japanese text into a memory topic → token count
      is plausible (roughly 1 token per character, not 0.25)
- [ ] Manual test: paste ASCII art → token count is plausible
