# Second Soul — Memory Feature Concept

## Overview

A two-phase memory system per persona. All data lives in IndexedDB (no backend).
The user selects a dedicated **memory worker model** for extraction and consolidation tasks.

---

## Memory Worker Model

The user can configure a separate model specifically for memory tasks (extraction + consolidation).
This should be a high-capability model — the feature is designed around models like:
Claude, GLM-5, Mistral Large 3, Kimi K2.5, MiniMax Pro v2.

Suggested UI: a "Memory Worker" model picker in persona settings (or global settings),
separate from the chat model.

---

## Storage Structure (per Persona, in IndexedDB)

```
MemoryIndex     { personaId, content: string (markdown) }
MemoryTopic[]   { personaId, slug: string, content: string (markdown) }
MemoryPending[] { personaId, content: string, extractedAt: number, sourceChatId: string }
MemoryMeta      { personaId, lastConsolidatedAt: number, pendingCount: number }
```

The index file is always small — just a topic overview with one-line summaries.
Topic files contain the actual content (profile, interests, ongoing projects, etc.).

### Example topic files
- `profile` — who the user is, basic facts
- `interests` — topics, hobbies, recurring themes
- `ongoing` — current projects, open threads
- `preferences` — how the user likes to communicate, work, etc.

---

## Two-Phase Process

### Phase 1 — Extract (append-only, lightweight)

Triggered after a conversation (manually or automatically).
A focused, non-streaming LLM call asks the memory worker model to extract
noteworthy facts from recent messages as concise markdown bullets.
Result is appended to the `MemoryPending` buffer with a reference to the source chat.

**Extraction prompt philosophy:**
- Written for smart models — no hand-holding
- "Be precise, no filler — write only what is genuinely useful in a future conversation"
- Output: markdown bullets grouped loosely by topic

### Phase 2 — Consolidate (smart rebuild, heavier)

Triggered manually or when `pendingCount` reaches a threshold (e.g. 10 extractions).
The memory worker model receives:
- All existing topic files
- The current index
- All pending extracts

It rebuilds the full memory tree from scratch — deduplicates, reorganises, updates topics.

**Consolidation prompt philosophy:**
- "Do not invent anything not present in the source material"
- Output format parsed client-side:
  ```
  ## INDEX
  ...
  ## FILE: profile
  ...
  ## FILE: interests
  ...
  ```

---

## Injection into System Prompt

The index is always injected (small, always relevant).
All topic files are injected too, subject to a soft token budget (~2000 tokens for memory total).
For the capable models targeted here, injecting everything is the right default.

---

## Triggers

### Extract trigger
- **Manual**: button in chat UI ("Save to memory")
- **Automatic**: configurable — e.g. "every 30 minutes if at least 10 turns happened"
  - A **turn** = one user message + one assistant reply (standard NLP term)

### Consolidate trigger
- **Manual**: button in memory settings
- **Nudge**: "You have 10 new memory fragments since the last consolidation — consolidate now?"

---

## Estimated Effort

| Part | Size |
|---|---|
| DB schema additions | small |
| Extract call + pending buffer | small |
| Trigger logic (timer + turn count) | medium |
| Consolidate call + file parser | medium |
| Memory worker model picker (UI) | small |
| Memory viewer UI (topics, pending, buttons) | medium |
| Injection in `sendMessage()` | trivial |

**Total: ~2–3 days** for a solid first version.
