# Second Soul — Memory System: Current State

**Date:** 2026-03-25
**Purpose:** Documentation of the existing memory system implementation as a basis for team discussion and next iteration design.

---

## What Is It?

The memory system allows each persona to accumulate persistent knowledge about the user across separate chat sessions. This knowledge is automatically extracted from conversations, stored locally in IndexedDB, and injected back into the LLM's system prompt on every subsequent message.

The system is entirely client-side — no backend required.

---

## Core Types

```typescript
type MemoryType = 'emotional' | 'hard_fact' | 'preference' | 'event' | 'nsfw'

interface MemoryPendingEntry {
    id: string
    personaId: string
    type: MemoryType
    content: string
    extractedAt: number
    sourceChatId: string
    status: 'suggested' | 'accepted' | 'dismissed'
}

interface MemoryTopic {
    id: string          // "{personaId}-{slug}"
    personaId: string
    slug: string        // e.g. "profile", "interests"
    content: string     // Markdown prose
    updatedAt: number
}

interface MemoryMeta {
    personaId: string
    indexContent: string          // Markdown index (one-liner per topic)
    lastConsolidatedAt: number | null
    pendingCount: number
    nsfwEnabled: boolean
}

// Stored in AppSettings
interface MemorySettings {
    workerModelId: string | null    // dedicated model for memory ops, or null → use chat model
    autoConsolidate: boolean
    consolidationThreshold: number  // 5–25, default 10
    detectionInterval: number       // 3–10 turns, default 5
}
```

**Relevant files:** `src/types/index.ts`

---

## Storage (IndexedDB)

Three object stores managed via `src/services/db.ts`:

| Store | Key | Purpose |
|-------|-----|---------|
| `memoryPending` | `id` | Suggested/accepted entries awaiting consolidation |
| `memoryTopics` | `id` | Consolidated topic documents (Markdown) |
| `memoryMeta` | `personaId` | Index content, timestamps, NSFW flag (one row per persona) |

All memory is scoped to a `personaId`. Deleting a persona cascades to all three stores.

---

## Data Flow

### 1 — Detection (extraction from chat)

**Trigger:** Every N turns (configurable, default 5), checked in `ChatPage` after a message is finalised.

**What happens:**
- The last 10 messages are sent to the LLM together with the detection prompt (`src/data/prompts/memory-detection.md`).
- The LLM returns a JSON array of `{type, content}` objects.
- Each is saved as a `MemoryPendingEntry` with `status: 'suggested'`.
- A `MemorySuggestion` popup appears in the chat UI.

**Code:** `src/services/memory.ts` — `detectMemories()`

**Model used:** `workerModelId` if set, otherwise the active chat model (temperature 0.3).

**Prompt location:** `src/data/prompts/memory-detection.md`

---

### 2 — User Review (suggestion UI)

**Component:** `src/components/MemorySuggestion.tsx`

For each suggested entry the user can:

- **Accept** — status → `accepted`, `meta.pendingCount++`
- **Dismiss** — deleted from DB
- **Edit** — content updated before accepting

Batch actions: "Accept All" / "Dismiss All".

NSFW entries trigger a floating hearts animation on acceptance.

---

### 3 — Consolidation (merge into topics)

**Trigger:** Manual (user clicks "Consolidate" on Memory Page) or automatic when `pendingCount >= consolidationThreshold` and `autoConsolidate` is enabled.

**What happens:**

1. Load all `accepted` pending entries + all existing topics + meta from DB.
2. Build a consolidation prompt (`src/data/prompts/memory-consolidation.md`):

```
## CURRENT INDEX
- profile: One-liner about the user
- interests: ...

## CURRENT TOPIC: profile
[existing content]

## NEW OBSERVATIONS
- [emotional] content...
- [hard_fact] content...
```

3. LLM returns structured Markdown:

```
## INDEX
- profile: Updated one-liner
- interests: Updated one-liner

## TOPIC: profile
Updated prose (5–8 sentences max)

## TOPIC: interests
...
```

4. Old topics are deleted, new topics are saved, accepted pending entries are cleared, meta is updated (`indexContent`, `lastConsolidatedAt`, `pendingCount = 0`).

**Code:** `src/services/memory.ts` — `consolidateMemory()`

---

### 4 — Injection into System Prompt

**On every LLM call**, `formatMemoryForPrompt(personaId)` is called and its output is appended to the system prompt (after global system prompt and persona system prompt).

**Output format:**

```
## Your Memories of This User

[index content]

### profile
[topic content]

### interests
[topic content]

Recent observations (not yet consolidated):
• [accepted pending entry 1]
• [accepted pending entry 2]
```

NSFW entries are filtered out unless `meta.nsfwEnabled === true`.

**Code:** `src/services/memory.ts` — `formatMemoryForPrompt()`, called from `src/services/api.ts:76–78`

---

## Session-End Behaviour

When the user navigates away from a chat (`ChatPage` unmount):
- If turns have passed since the last detection, a silent detection runs (`silent = true`) — no popup, entries are saved quietly.
- If `autoConsolidate` is on and the threshold is met, consolidation runs automatically.

---

## Persona-Level Toggle

Memory can be disabled per persona via `memoryEnabled?: boolean` (default `true`). When disabled, `formatMemoryForPrompt()` returns an empty string.

---

## Memory Page UI (`src/components/MemoryPage.tsx`)

Two tabs:

**Memories tab:**
- NSFW toggle (include NSFW memories in prompt)
- "Consolidate" button (manual trigger), "Add Memory" (manual entry), "Delete Pending"
- Topics: expandable cards with edit/delete
- Pending: suggested entries with accept/edit/dismiss
- Token estimate displayed (~4 chars = 1 token)

**History tab:**
- All chats for this persona with delete (with confirmation)

---

## LLM Integration Details

- **Chat model** — primary conversation
- **Memory worker model** — detection and consolidation (can be a different, cheaper model)
  - If `workerModelId` is `null`, the chat model is used for memory ops too
  - Temperature: 0.3
  - Max tokens: 4096
  - Supports OpenAI-compatible, Anthropic, Ollama

**Code:** `src/services/memory.ts` — `callMemoryWorker()`, `callAnthropic()`

---

## Memory Type Emoji Mapping

| Type | Emoji | Meaning |
|------|-------|---------|
| `emotional` | 💫 | Feelings, relationship dynamics |
| `hard_fact` | 📌 | Facts, biographical data |
| `preference` | ⚙️ | Likes, dislikes, settings |
| `event` | 📅 | Events, dates, milestones |
| `nsfw` | 🔥 | Sensitive / adult content |

---

## Full Data Flow Summary

```
User sends message
    │
    ├─→ formatMemoryForPrompt() → inject into system prompt
    │
    └─→ LLM call (chat model)
            │
            └─→ Response finalised
                    │
                    └─→ turnCount++ (Zustand, per personaId)
                            │
                            └─→ turnCount % detectionInterval == 0?
                                    │
                                YES └─→ detectMemories()
                                            │
                                            ├─→ last 10 messages + detection prompt → LLM
                                            └─→ [{type, content}, ...] saved as 'suggested'
                                                        │
                                                        └─→ MemorySuggestion popup
                                                                │
                                                        Accept ─┤─ Dismiss
                                                                │
                                                    status='accepted'
                                                    pendingCount++
                                                                │
                                                    pendingCount >= threshold?
                                                                │
                                                YES (+ autoConsolidate) └─→ consolidateMemory()
                                                                                │
                                                                    Load topics + pending
                                                                    Build consolidation prompt
                                                                    LLM → updated topics
                                                                    Save new topics
                                                                    Clear accepted pending
                                                                    Update meta
```

---

## Zustand State

Turn tracking is in-memory only (not persisted across page reloads):

```typescript
turnsSinceLastDetection: Record<string, number>  // keyed by personaId
incrementTurnCount(personaId: string): void
resetTurnCount(personaId: string): void
```

**Code:** `src/stores/appStore.ts:415–431`

---

## Prompt Files

| File | Purpose |
|------|---------|
| `src/data/prompts/memory-detection.md` | Instructs LLM to extract memories from recent messages, output as JSON |
| `src/data/prompts/memory-consolidation.md` | Instructs LLM to merge pending entries into existing topics |

---

## Open Questions / Potential Improvements

These are observations for team discussion — not decisions.

1. **Turn tracking resets on page reload.** Detection may fire sooner or later than expected after a browser refresh.
2. **Detection uses the last 10 messages fixed.** Is this window always the right size? Very long messages could push important context out.
3. **No deduplication at detection time.** Similar facts may be extracted multiple times before the next consolidation. The consolidation prompt handles it, but pending entries can accumulate duplicates.
4. **Worker model fallback to chat model.** Memory operations during a chat session block the UI if they share the same model — is there a concurrency issue?
5. **Token estimate on Memory Page is approximate.** A more accurate count (actual tokeniser) could help users manage prompt size.
6. **No export/import for memory.** If the user clears IndexedDB or switches browsers, all memory is lost.
7. **NSFW toggle is per-persona, not per-topic.** Granular control per topic/entry is not possible.

---

*This document reflects the state of the codebase as of 2026-03-25.*
