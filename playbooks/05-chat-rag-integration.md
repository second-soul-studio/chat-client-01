# Playbook 05 — Chat RAG Integration

## Goal

Inject Knowledge context into chat messages. Two triggers: (1) collections assigned to the active Persona, (2) `#collection-name` mentions typed by the user. Context is injected into the system prompt before the LLM call.

## Prerequisites

- Playbook 01 + 02 complete (types, DB, search service)
- Playbook 04 complete (Persona has `knowledgeCollectionIds`)
- Note: **There is no separate `ChatInput.tsx`** — chat input is inline in `ChatPage.tsx`

---

## Step 1 — `#`-Mention Parser

Implement a utility function (can live in a new `src/services/knowledge/mentions.ts`):

```ts
export function parseCollectionMentions(text: string): string[]
// returns collection names extracted from #mentions in `text`
// e.g. "tell me about #my-notes and #project-docs" → ['my-notes', 'project-docs']

export function resolveCollectionsByName(
  names: string[],
  collections: KnowledgeCollection[]
): KnowledgeCollection[]
// case-insensitive match against collection.name; returns matched collections
```

---

## Step 2 — `#`-Mention Autocomplete in `ChatPage.tsx`

In the chat input textarea (in `ChatPage.tsx`):

- Detect when the user types `#` — show a small dropdown of collection names
- Filter the list as the user types more characters after `#`
- Selecting a collection from the dropdown inserts `#collection-name` into the textarea
- Close the dropdown on Escape or when `#` trigger is no longer active
- If there are no collections, do not show the dropdown at all

### UX details

- Dropdown should appear above the input (not below, to avoid going off-screen)
- Show collection name + document count in each dropdown item
- The `#mention` in the sent message text does NOT need to be stripped — it can remain in the user message; the RAG context is injected separately into the system prompt

---

## Step 3 — RAG Context Injection in `api.ts`

Modify `sendMessage()` in `src/services/api.ts` to inject Knowledge context.

### Where in the system prompt

Current order (from `memory.ts` reference):
```
1. Global system prompt (settings)
2. Persona system prompt
3. Memory block (formatMemoryForPrompt)
4. Per-model user system prompt addition
```

New order:
```
1. Global system prompt (settings)
2. Persona system prompt
3. Memory block (formatMemoryForPrompt)
4. [NEW] Knowledge context block (formatKnowledgeContext)
5. Per-model user system prompt addition
```

### Logic to add (before the LLM call)

```ts
// 1. Determine which collections are relevant
const personaCollectionIds = persona.knowledgeCollectionIds ?? [];
const mentionedCollectionIds = resolveCollectionsByName(
  parseCollectionMentions(userMessageText),
  allCollections
).map(c => c.id);
const collectionIds = [...new Set([...personaCollectionIds, ...mentionedCollectionIds])];

// 2. If any collections, embed the query and search
if (collectionIds.length > 0) {
  const queryEmbedding = await embedText(userMessageText, embeddingProviderId, embeddingModelSlug);
  const results = await searchMultipleCollections(queryEmbedding, collectionIds, topK);
  const contextBlock = formatKnowledgeContext(results, template, tokenBudget);
  // inject contextBlock into the system prompt
}
```

### Embedding provider for query

Use the collection's `embeddingProviderId` + `embeddingModelSlug`. If multiple collections with different models are involved, embed the query once per distinct model (cache by model slug within the same request).

### Token budget

- Limit the total knowledge context to `KnowledgeSettings.knowledgeContextTokenBudget` tokens
- Use `countTokens()` from `tokenCount.ts`
- If the full top-K chunks exceed the budget: take as many as fit (greedy, highest score first)

---

## Step 4 — `formatKnowledgeContext()` (`src/services/knowledge/formatter.ts`)

```ts
export function formatKnowledgeContext(
  chunks: ScoredChunk[],
  template: string,
  tokenBudget: number
): string
```

Builds the context string by:

1. For each `ScoredChunk` (sorted by score desc), format as:
   ```xml
   <source id="N" collection="collection name" document="doc name">
   chunk content here
   </source>
   ```
2. Substitute the `{{chunks}}` placeholder in `template` with the joined sources
3. Respect `tokenBudget`: if adding the next chunk would exceed the budget, stop

Returns an empty string if `chunks` is empty (caller skips injection entirely).

---

## Verification

- [ ] Typing `#` in the chat input shows the collection dropdown
- [ ] Selecting a collection inserts `#collection-name` into the input
- [ ] Sending a message with `#collection-name` includes the relevant chunks in the system prompt (verify by checking the raw request in the browser's Network tab)
- [ ] A Persona with assigned collections automatically has knowledge context in every message (no `#` needed)
- [ ] Token budget is respected: chunks are truncated when they exceed the configured budget
- [ ] If no collections match and no persona collections are assigned, no context block is injected (no extra API call)
- [ ] Embedding errors (bad model slug, provider offline) do not crash the chat — degrade gracefully with a console warning
