# Playbook 02 — Detection Quality

**Priority:** High — core feature improvement.
**Scope:** Turn tracking persistence + detection prompt improvements + existing memory context.
**Depends on:** Playbook 01 (bugs fixed, DB helpers available).

---

## Context

Read before starting:
- `MEMORY-SYSTEM-CURRENT.md` — full system overview
- `MEMORY-SYSTEM-PROPOSALS.md` — proposals #1, #3a, #3b
- `frontend/src/data/prompts/memory-detection.md` — current detection prompt

Key files:
- `frontend/src/components/ChatPage.tsx` — `triggerDetection`, turn counter logic
- `frontend/src/services/memory.ts` — `detectMemories()`, `shouldRunDetection()`
- `frontend/src/services/db.ts` — IndexedDB helpers
- `frontend/src/stores/appStore.ts` — `turnsSinceLastDetection`, `incrementTurnCount`, `resetTurnCount`
- `frontend/src/types/index.ts` — `Chat`, `MemoryMeta`, `MemoryTopic`
- `frontend/src/data/prompts/memory-detection.md` — prompt to update

---

## Step 1 — Persist Turn Tracking (Proposal #1)

### Problem

`turnsSinceLastDetection` lives only in Zustand. A page reload resets it to 0,
causing detection to fire too early (after 0 turns) or too late depending on timing.

### What to do

**Option A (preferred — minimal schema change):** Add `lastDetectionAt: number | null`
to the `Chat` type in `types/index.ts`. This stores the message count (i.e. `messages.length`)
at the time of the last detection.

On `ChatPage` mount (after chat is loaded), initialise Zustand:

```ts
const totalTurns = Math.floor((chat.messages.length) / 2); // each turn = 1 user + 1 assistant
const lastAt = chat.lastDetectionAt ?? 0;
const turnsSince = totalTurns - lastAt;
// set turnsSinceLastDetection[personaId] = turnsSince in Zustand
```

When detection fires successfully, persist:
```ts
await updateChatLastDetection(chat.id, totalTurns);
// then resetTurnCount(personaId) as today
```

Add `updateChatLastDetection(chatId, turnCount)` to `db.ts`.

**Note:** Check how `Chat` is currently stored/updated in `db.ts` — use the existing
update helper rather than a full overwrite.

### Acceptance criteria

- After a page reload mid-conversation, detection fires at the correct interval
  (not immediately on the first new message).
- `lastDetectionAt` is visible on the `Chat` object in IndexedDB DevTools.

---

## Step 2 — Strengthen Detection Prompt for Semantic Dedup (Proposal #3a)

### Problem

The current prompt does not explicitly tell the model to avoid extracting semantically
redundant entries within a single detection run (e.g. "User likes cats" and
"User has a cat named Luna" could both be extracted when one implies the other).

### What to do

Edit `frontend/src/data/prompts/memory-detection.md`.

Add a clear instruction along these lines:

```
Before outputting, review your list and remove any entries that are semantically
redundant with each other. If two entries convey the same fact, keep only the more
specific or informative one. Output each distinct fact only once.
```

Keep it short — do not over-specify. The target models (DeepSeek, Mistral Large, GLM-5)
handle this well with a single clear instruction.

### Acceptance criteria

- Prompt file updated with dedup instruction.
- Spot-check: run a conversation with an obvious repeated fact and verify the output
  JSON contains it only once.

---

## Step 3 — Pass Existing Memory Context to Detector (Proposal #3b)

### Problem

The detector has no knowledge of what is already in memory. It will re-extract facts
that are already stored as topics or accepted pending entries.

### What to do

**Update `detectMemories()` signature in `memory.ts`:**

```ts
export async function detectMemories(
    messages: Message[],
    personaId: string,
    chatId: string,
    provider: Provider,
    model: ModelConfig,
    existingContext?: {
        indexContent: string;
        acceptedPending: MemoryPendingEntry[];
        nsfwEnabled: boolean;
    },
): Promise<MemoryPendingEntry[]>
```

**Build an "already known" block inside `detectMemories()`:**

```ts
let alreadyKnown = '';
if (existingContext) {
    const parts: string[] = [];

    if (existingContext.indexContent) {
        parts.push(`## ALREADY KNOWN (summary)\n${existingContext.indexContent}`);
    }

    const pending = existingContext.nsfwEnabled
        ? existingContext.acceptedPending
        : existingContext.acceptedPending.filter(e => e.type !== 'nsfw');

    if (pending.length > 0) {
        parts.push(
            '## ALREADY KNOWN (recent, not yet consolidated)\n' +
            pending.map(e => `- [${e.type}] ${e.content}`).join('\n')
        );
    }

    alreadyKnown = parts.join('\n\n');
}
```

Pass `alreadyKnown` into the user message sent to `callMemoryWorker`:

```ts
const userMessage = alreadyKnown
    ? `${alreadyKnown}\n\n## CONVERSATION TO ANALYSE\n${conversation}`
    : `Conversation:\n${conversation}`;
```

**Update the detection prompt** to explain the "ALREADY KNOWN" section and instruct
the model not to re-extract facts already listed there.

**Update the call site in `ChatPage.tsx`** (`triggerDetection`) to load and pass the context:

```ts
const meta = await getMemoryMeta(personaId);
const acceptedPending = await getAcceptedPendingEntries(personaId);
const entries = await detectMemories(
    recentMessages, personaId, activeChat.id, provider, model,
    meta ? {
        indexContent: meta.indexContent,
        acceptedPending,
        nsfwEnabled: meta.nsfwEnabled,
    } : undefined,
);
```

### NSFW note

The NSFW filter in the context block uses `meta.nsfwEnabled` — same flag as prompt
injection. If NSFW is off, NSFW accepted entries are stripped before sending to the
detector. This prevents sending sensitive content to models that refuse NSFW input
(e.g. OpenAI).

### Acceptance criteria

- Detection call includes "already known" block when memory exists.
- Re-running detection on a chat where facts are already stored → those facts are
  not extracted again.
- NSFW entries absent from the "already known" block when `nsfwEnabled` is false.
- First-time detection (empty memory) works identically to before — `existingContext`
  is simply not passed.

---

## Done when

- [ ] `Chat` type has `lastDetectionAt: number | null`
- [ ] `updateChatLastDetection` exists in `db.ts`
- [ ] `ChatPage` initialises Zustand turn counter from DB on mount
- [ ] `ChatPage` writes `lastDetectionAt` to DB when detection fires
- [ ] Detection prompt updated with semantic dedup instruction
- [ ] `detectMemories()` accepts optional `existingContext` parameter
- [ ] Detection prompt updated to explain and use the "ALREADY KNOWN" section
- [ ] `triggerDetection` in `ChatPage` loads context and passes it to `detectMemories`
- [ ] NSFW filter applied to context block
- [ ] Manual test: reload page mid-conversation → detection fires at correct interval
- [ ] Manual test: detection does not re-extract already stored facts
