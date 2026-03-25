# Playbook 03 — Request Queue

**Priority:** Medium — prevents silent rate-limit errors on shared providers.
**Scope:** New infrastructure service, touches `memory.ts` and optionally `api.ts`.
**Depends on:** Nothing — fully independent.

---

## Context

Read before starting:
- `MEMORY-SYSTEM-CURRENT.md` — full system overview
- `MEMORY-SYSTEM-PROPOSALS.md` — proposal #4

Key files:
- `frontend/src/services/memory.ts` — `callMemoryWorker()` — main entry point for memory LLM calls
- `frontend/src/services/api.ts` — chat LLM calls (for context; may or may not be queued)
- `frontend/src/types/providers.ts` — `Provider` type (has `id` field)

---

## Problem

When `workerModelId` is null, detection and consolidation use the same provider as
the active chat model. Detection is triggered right after a chat response finishes
(`ChatPage.tsx:242`). If the user sends another message before detection completes,
two simultaneous HTTP requests hit the same provider endpoint. On rate-limited
providers (OpenAI, Anthropic paid tiers, NanoGPT depending on plan) this causes
silent 429 errors — the memory operation fails without any user-visible feedback.

---

## Design

A lightweight per-provider serial queue. Each provider gets one "lane" — requests
in the same lane execute one at a time with a configurable minimum gap between them.

**This is not a full task queue.** It is simply promise-chaining:
- Keep a `Map<providerId, Promise<void>>` — the "tail" of each provider's chain.
- Each new call appends itself to the tail: `queue = queue.then(() => delay(gap)).then(() => actualCall())`.
- If there is no existing queue entry, the call runs immediately.

### New file: `frontend/src/services/requestQueue.ts`

```ts
const queues = new Map<string, Promise<void>>();

/**
 * Enqueue a function to run after any pending calls for the same providerId.
 * A minimum gap (ms) is inserted before each call to avoid rate-limit bursts.
 */
export function enqueue<T>(
    providerId: string,
    fn: () => Promise<T>,
    gapMs = 5000,
): Promise<T> {
    const tail = queues.get(providerId) ?? Promise.resolve();

    const next = tail
        .then(() => delay(gapMs))
        .then(() => fn());

    // Store only the "done" signal, not the result, so the Map stays tidy
    queues.set(
        providerId,
        next.then(() => {}, () => {}),
    );

    return next;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Integration

### Wrap memory worker calls

In `memory.ts`, import `enqueue` and wrap `callMemoryWorker`:

```ts
import { enqueue } from '@/services/requestQueue';

async function callMemoryWorker(
    systemPrompt: string,
    userMessage: string,
    provider: Provider,
    model: ModelConfig,
): Promise<string> {
    return enqueue(
        provider.id,
        () => _callMemoryWorkerInner(systemPrompt, userMessage, provider, model),
    );
}
```

Rename the existing implementation to `_callMemoryWorkerInner`.

### Chat calls (optional, discuss first)

Whether to also route chat calls through the queue is a trade-off:
- **Pro:** prevents any concurrent call to the same provider.
- **Con:** adds 5s latency before every memory operation even if the chat is idle.

A pragmatic middle ground: only wrap memory worker calls. If the user has set a
dedicated `workerModelId` on a different provider, the queues are separate and there
is no delay. The queue only matters when both share the same provider.

### Configurable gap

Add `memoryWorkerQueueGapMs: number` to `MemorySettings` (default: 5000, range:
1000–15000). Expose it in `SettingsPage` as an advanced option (could be hidden
behind an "Advanced" toggle to avoid cluttering the UI).

Alternatively, hard-code 5000ms for now and make it configurable later. Your call.

---

## Edge Cases

- **Queue grows without bound:** The `queues` Map stores a `Promise<void>` per
  provider. Once the chain resolves, the stored promise is already settled — it does
  not hold references to results. Memory pressure is negligible.
- **App reload:** The queue lives in module scope. A reload clears it — fine, there
  are no pending operations to preserve across reloads.
- **Error handling:** The `.then(() => {}, () => {})` in the queue tail swallows
  errors so a failed call does not break subsequent calls in the chain. Each caller
  handles its own error via the returned promise.

---

## Done when

- [ ] `frontend/src/services/requestQueue.ts` exists with `enqueue()` function
- [ ] `callMemoryWorker` in `memory.ts` routes through `enqueue(provider.id, ...)`
- [ ] Gap defaults to 5000ms
- [ ] Manual test: trigger detection immediately followed by a new chat message →
      no 429 errors logged in the browser console
- [ ] (Optional) `memoryWorkerQueueGapMs` setting exposed in `SettingsPage`
