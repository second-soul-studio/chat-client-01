# Second Soul — Memory System: Proposals & Design Decisions

**Date:** 2026-03-25
**Status:** Discussion basis — nothing implemented yet
**Based on:** MEMORY-SYSTEM-CURRENT.md + team discussion

---

## 1. Turn Tracking — Persist Across Page Reloads

**Problem:** `turnsSinceLastDetection` lives only in Zustand (in-memory). A page reload or navigation resets it to 0, causing detection to fire either too early or too late after resuming a chat.

**Decision:** Persist turn count in IndexedDB, per chat.

**Proposed approach:**
- Add `lastDetectionTurnCount: number` to the `Chat` object (or a separate lightweight record keyed by `chatId`).
- On chat load, initialise `turnsSinceLastDetection` in Zustand from `totalTurns - lastDetectionTurnCount`.
- When detection fires, write `lastDetectionTurnCount = currentTurnCount` to DB.
- `totalTurns` is simply the message count divided by 2 (or a dedicated counter on `Chat`).

**No change to the detection logic itself** — only the initialisation of the Zustand counter changes.

---

## 2. Rolling Window — No Change Needed

The current fixed window of the last 10 messages is fine. Detection fires every N turns and looks back at whatever the most recent 10 messages are — nothing is permanently excluded. Close.

---

## 3. Deduplication — Prompt-Level, Not Code-Level

**Problem has two aspects:**

### 3a — Intra-detection duplicates

The same conversation turn can yield semantically identical entries (e.g. "User likes cats" and "User has a cat named Luna"). Currently the prompt does not explicitly forbid this.

**Decision:** Strengthen the detection prompt to explicitly instruct the model to deduplicate by semantics — not string matching. Target models (DeepSeek, Mistral Large, GLM-5) are capable of this. No code-side deduplication.

String normalisation is explicitly rejected — NL is too variable for that approach. Embeddings are future music (chat-client-02).

### 3b — Cross-detection duplicates (already known entries)

The detection prompt currently receives no information about what is already known. The LLM will happily re-extract facts that are already in memory.

**Decision:** Pass existing memory context to the detection prompt:

1. **Accepted pending entries** (not yet consolidated): send as "already known — do not re-extract"
2. **Index content** (consolidated topics summary): send as additional context

Format suggestion for the detection call:

```
## ALREADY KNOWN
[index content if present]

Recent accepted observations (do not repeat):
- [preference] User prefers dark roast coffee
- [hard_fact] User works as a backend developer

## CONVERSATION TO ANALYSE
User: ...
Assistant: ...
```

**NSFW filter applies here too:** If `nsfwEnabled` is false for this persona, NSFW entries are excluded from the "already known" block before sending — same filter as prompt injection. This prevents sending sensitive content to models that would refuse the task (looking at OpenAI).

---

## 4. Request Queue — Prevent Concurrent Provider Calls

**Problem:** When `workerModelId` is null, detection and consolidation use the same provider as the chat model. If the user sends a new message while detection is still running, two simultaneous HTTP requests hit the same provider. On rate-limited providers (OpenAI, Anthropic), this causes silent 429 errors.

**Decision:** Implement a simple per-provider request queue with a configurable delay.

**Proposed approach:**
- A lightweight queue keyed by `providerId` (a `Map<string, Promise<void>>` is enough).
- Each call to `callMemoryWorker` chains onto the existing promise for that provider.
- Add a configurable minimum gap between requests (default: 5 seconds).
- This is global — both chat calls and memory worker calls share the same queue per provider.

**Alternatively:** If the user has configured a dedicated `workerModelId` on a different provider, the problem largely disappears. Encourage this in the settings UI.

---

## 5. Token Estimate — Use tiktoken

**Problem:** Current estimate (÷4 characters) is inaccurate for non-Latin scripts, ASCII art, code, and emoji. A Japanese user or someone experimenting with ASCII art will see wildly wrong estimates.

**Decision:** Use `tiktoken` (NPM package, runs via WASM in the browser) with `cl100k_base` encoding.

- `cl100k_base` is the encoding used by GPT-4 and is a reasonable approximation for Claude and most other models.
- It is pessimistic for unusual inputs, which is the right direction.
- No other tokeniser dependency needed.

**Note:** The estimate is still an approximation — different models use different tokenisers. The UI should make this clear ("~X tokens, estimated").

---

## 6. Export / Import

Deferred to chat-client-02. Not in scope here.

---

## 7. NSFW Toggle — Make Per-Persona Scope Clearer

**Current state:** `nsfwEnabled` already lives on `MemoryMeta`, so it is already per-persona. The bug is only in the UI — the toggle needs to be labelled and placed such that the user understands it applies to this persona only, not globally.

**Decision:** Update the label and surrounding copy on the Memory Page to make the per-persona scope explicit. No data model changes needed.

---

## 8. Pending Entry Expiry

**Decision:** Suggested entries (`status: 'suggested'`) that have not been reviewed expire after 7 days.

- Cleanup runs when the Memory Page loads (lazy cleanup on read — no background worker needed).
- Accepted entries (`status: 'accepted'`) never expire automatically (they await consolidation).
- The expiry duration should be configurable in `MemorySettings` (range: 3–30 days, default: 7).

---

## 9. "Delete All Pending" Button

**Decision:** Add a button on the Memory Page to delete all `suggested` entries in one click (entries that have not been reviewed yet). Accepted entries are not affected — they await consolidation.

Existing "Delete Pending" behaviour should be verified: check whether it currently targets `suggested` only or both `suggested` and `accepted`.

---

## 10. In-Chat Pending Badge

**Decision:** Show a persistent badge in the chat UI indicating the number of unreviewed (`suggested`) memory entries.

**Behaviour:**
- Badge lives in the chat header (next to the persona name or as a small pill near the input area).
- Pulses / flashes briefly when new suggestions arrive.
- Tapping the badge opens the Memory Page (or scrolls to the suggestion popup if it is visible).
- Badge disappears when `suggestedEntries` count reaches 0.

**Rationale:** The current popup is the only notification mechanism. If the user does not notice it, suggestions silently accumulate. The badge gives a persistent, low-friction signal.

---

## 11. "Back to Chat" Button on Memory Page

**Decision:** Add a prominent "Back to Chat" button on the Memory Page. Likely top-left, consistent with the back arrow pattern already used in the chat header.

Routing: `navigate(-1)` or directly to the last active chat (`/persona/:id/chat/:chatId`).

---

## 12. FloatingHearts / Particle Effects Per Memory Type

**Current state:** `FloatingHearts` is implemented and rendered (`ChatPage.tsx:607`). `setShowHearts(true)` is called when an `emotional` or `nsfw` entry is accepted. The animation works.

**Future direction (not yet specified):** Consider different visual effects per memory type:
- `emotional` — floating hearts (already done)
- `hard_fact` — maybe a small "📌" pop
- `preference` — "⚙️" spin
- `event` — "📅" briefly highlighted
- `nsfw` — fire particles or similar

Not blocking — cosmetic improvement for later.

---

## 13. Popup Bug — Suggested Entries Not Loaded on Mount

**Bug identified during review:**

`suggestedEntries` in `ChatPage` is initialised as `[]` and only populated when detection fires in the current session. If the user navigates away and returns (or reloads), entries saved as `status: 'suggested'` in IndexedDB are never loaded back into state. They exist in the DB but the popup never appears again for them.

**Fix:** On `ChatPage` mount (in the `loadOrCreateChat` effect), load `getSuggestedPendingEntries(personaId)` from DB and set them as the initial `suggestedEntries` state.

**Additional observation:** With the default `detectionInterval` of 5 turns, a short test session of 2–3 exchanges will never trigger detection at all, making the feature invisible during early testing.

---

## Summary Table

| # | Topic | Action | Scope |
|---|-------|--------|-------|
| 1 | Turn tracking persistence | Persist per-chat turn counter to IndexedDB | Small |
| 2 | Rolling window | No change | — |
| 3a | Intra-detection dedup | Strengthen detection prompt | Prompt only |
| 3b | Cross-detection context | Pass existing memory to detection call | Medium |
| 4 | Request queue | Per-provider queue with 5s gap | Medium |
| 5 | Token estimate | Switch to tiktoken WASM | Small |
| 7 | NSFW label clarity | UI copy change only | Trivial |
| 8 | Pending entry expiry | Lazy cleanup on Memory Page load | Small |
| 9 | Delete all pending button | UI addition | Small |
| 10 | In-chat pending badge | New UI element in chat header | Small–Medium |
| 11 | Back to Chat button | Navigation addition on Memory Page | Trivial |
| 12 | Per-type particle effects | Cosmetic, deferred | Future |
| 13 | Popup mount bug fix | Load suggested entries on ChatPage mount | Small (bug fix) |

---

*Proposals are not yet prioritised or assigned. This document serves as the shared discussion basis before implementation begins.*
