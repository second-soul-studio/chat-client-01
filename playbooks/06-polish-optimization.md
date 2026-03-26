# Playbook 06 — Polish & Optimisation

## Goal

Non-blocking search via Web Worker, source attribution UI in the chat, and Collection import/export. These are independent of each other and can be tackled in any order.

## Prerequisites

- Playbooks 01–05 complete and working

---

## Step 1 — Web Worker for Search

Move the Cosine Similarity computation off the main thread to avoid jank on large collections.

### Why

At >5k chunks the synchronous brute-force loop can block the UI thread for 20–50ms. A Worker runs it in parallel.

### Implementation

Create `src/workers/knowledgeSearch.worker.ts`:

```ts
// Receives: { queryEmbedding: Float32Array, chunks: serialised chunks, topK: number }
// Returns:  { results: ScoredChunk[] }
```

- Import `BruteForceSearch` from `search.ts` (this module must not import anything that uses browser DOM APIs)
- Post results back with `postMessage`
- Use `Transferable` for `Float32Array` buffers (`postMessage(msg, [msg.queryEmbedding.buffer])`) to avoid copying

In `search.ts`, add a `searchWithWorker()` function that:
1. Creates a `new Worker(new URL('../workers/knowledgeSearch.worker.ts', import.meta.url), { type: 'module' })`
2. Serialises the query + chunks
3. Returns a Promise that resolves when the Worker posts back

Keep `searchCollection()` and `searchMultipleCollections()` as the public API — they transparently switch to the Worker path when the chunk count exceeds a threshold (e.g. 2000 chunks).

### Vite config

Vite supports Worker imports natively with the `new URL(...)` pattern — no extra config needed.

---

## Step 2 — Chunk-Preview / Source Attribution in Chat

Show which Knowledge chunks were used to generate a response.

### Storage

When injecting RAG context (Playbook 05), store the used `ScoredChunk[]` alongside the `Message` object:

```ts
// extend Message type in src/types/index.ts:
knowledgeSources?: Array<{
  collectionName: string;
  documentName: string;
  content: string;       // the chunk text
  score: number;
}>;
```

Populate this field in `sendMessage()` and persist it with the message.

### UI — Source attribution in chat bubbles

In the assistant message bubble component:
- If `message.knowledgeSources` is non-empty, show a small "Sources" toggle below the message text
- Collapsed by default; expand on click
- Each source: collection name + document name, and optionally a truncated preview of the chunk content (first ~100 chars)

---

## Step 3 — Collection Import / Export

Allow exporting a collection (with all its documents and pre-computed embeddings) to a JSON file, and importing it back — including on a different device.

### Export format

```json
{
  "version": 1,
  "collection": { ...KnowledgeCollection },
  "documents": [ ...KnowledgeDocument[] ],
  "chunks": [
    {
      ...KnowledgeChunk,
      "embedding": [ ...number[] ]   // Float32Array serialised as plain array for JSON
    }
  ]
}
```

### Export

- Button in the Collection detail view: "Export Collection"
- Serialise: convert `embedding: Float32Array` → `Array.from(embedding)` for JSON compatibility
- Trigger download via `URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))`

### Import

- Button in the Collection grid: "Import Collection"
- File input accepting `.json`
- Parse, validate `version === 1`, reconstruct `Float32Array` from the number arrays
- Assign new UUIDs to avoid ID collisions with existing data
- Call `saveCollection()`, `saveDocument()` per document, `saveChunks()` for chunks
- Show import progress (document count)

### Notes

- This is intentionally simple — no merge/dedup logic needed
- If the embedding dimension of the imported collection doesn't match any available provider, warn the user but still import (they can re-index later)

---

## Verification

**Web Worker:**
- [ ] Search still returns correct results after moving to the Worker
- [ ] Main thread is not blocked (verify with Chrome DevTools Performance tab on a large collection)
- [ ] Worker is only used above the chunk threshold; small collections still use the synchronous path

**Source attribution:**
- [ ] Messages with knowledge context show a "Sources" toggle
- [ ] Expanding shows the correct collection + document names
- [ ] Messages without knowledge context show no toggle
- [ ] Sources are persisted with the message (survive page reload)

**Import/Export:**
- [ ] Export downloads a valid JSON file
- [ ] Importing the exported file recreates the collection with all chunks intact
- [ ] Imported embeddings are usable for search without re-indexing
- [ ] Import assigns new IDs (no collision with existing collections)
