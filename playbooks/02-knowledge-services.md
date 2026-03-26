# Playbook 02 — Knowledge Services

## Goal

Implement the four new service modules that form the core of the RAG pipeline: chunker, embeddings, search, and manager.

## Prerequisites

- Playbook 01 complete (Types + DB schema available)
- Existing services to reuse: `proxiedFetch`, `requestQueue`, `tokenCount`

---

## Step 1 — Chunker (`src/services/knowledge/chunker.ts`)

Splits a document into overlapping text chunks suitable for embedding.

### Strategy (in order of preference)

1. **Markdown header split** — split on `##` and `###` headings; each section becomes a candidate chunk
2. **Paragraph split** — split on `\n\n`; merge small paragraphs until `chunkSize` is reached
3. **Character split with overlap** — hard fallback, sliding window

### Implementation notes

- Use `countTokens()` from `tokenCount.ts` to measure chunk size in tokens (not characters)
- `chunkSize` and `chunkOverlap` are passed in as config (from the Collection)
- Return `Array<{ content: string; startOffset: number; endOffset: number }>` — offsets are character positions in the original document text
- For Markdown: strip the heading text into the chunk content (do not discard it)
- Chunk overlap: when splitting by paragraph or character, re-include the last `chunkOverlap` tokens from the previous chunk at the start of the next chunk

```ts
export interface ChunkResult {
  content: string;
  startOffset: number;
  endOffset: number;
}

export function chunkDocument(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): ChunkResult[]
```

---

## Step 2 — Embeddings (`src/services/knowledge/embeddings.ts`)

Calls the `/v1/embeddings` endpoint on a given provider.

### Functions

```ts
export async function embedText(
  text: string,
  providerId: string,
  modelSlug: string
): Promise<Float32Array>

export async function embedBatch(
  texts: string[],
  providerId: string,
  modelSlug: string,
  batchSize = 20
): Promise<Float32Array[]>
```

### Implementation notes

- Look up the `Provider` from the DB/store to get `baseUrl` and `apiKey`
- Use `proxiedFetch` for the HTTP call
- Wrap each batch call in `requestQueue.enqueue(providerId, ...)` for rate-limiting
- Request shape: `POST /v1/embeddings` with `{ model, input: string[] }`
- Response: `data[].embedding` is `number[]` — convert to `Float32Array`
- `embedBatch` splits `texts` into chunks of `batchSize`, calls `embedText` for each batch, flattens results
- Errors: propagate with a descriptive message including providerId and modelSlug (helps debug dimension mismatches)

---

## Step 3 — Search (`src/services/knowledge/search.ts`)

Pure computation — no DB calls, no API calls.

```ts
export interface SearchStrategy {
  search(
    queryEmbedding: Float32Array,
    chunks: KnowledgeChunk[],
    topK: number
  ): ScoredChunk[];
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number

export class BruteForceSearch implements SearchStrategy {
  search(queryEmbedding, chunks, topK): ScoredChunk[]
}

export function searchCollection(
  queryEmbedding: Float32Array,
  collectionId: string,
  topK: number
): Promise<ScoredChunk[]>

export function searchMultipleCollections(
  queryEmbedding: Float32Array,
  collectionIds: string[],
  topK: number
): Promise<ScoredChunk[]>
```

### Implementation notes

- `cosineSimilarity`: dot product of A·B divided by (|A| × |B|); use `Float32Array` arithmetic directly
- `BruteForceSearch.search`: compute similarity for all chunks, sort descending, return top K
- `searchCollection` / `searchMultipleCollections`: load chunks from DB, run `BruteForceSearch`, attach `documentName` + `collectionName` to each `ScoredChunk`
- For `searchMultipleCollections`: merge results across all collections, re-sort by score, return global top K (not top K per collection)
- Keep `SearchStrategy` as an interface so HNSW can be dropped in later without touching callers

---

## Step 4 — Manager (`src/services/knowledge/manager.ts`)

Orchestrates CRUD and the indexing pipeline.

```ts
export async function createCollection(
  data: Omit<KnowledgeCollection, 'id' | 'createdAt' | 'updatedAt'>
): Promise<KnowledgeCollection>

export async function updateCollection(
  id: string,
  data: Partial<KnowledgeCollection>
): Promise<void>

export async function deleteCollection(id: string): Promise<void>
// cascading: deleteDocumentsByCollection + deleteChunksByCollection

export async function addDocument(
  collectionId: string,
  name: string,
  content: string
): Promise<KnowledgeDocument>
// creates Document with status 'pending', then triggers indexDocument()

export async function indexDocument(documentId: string): Promise<void>
// 1. Load document + collection
// 2. Chunk via chunker.ts
// 3. Embed via embeddings.ts (embedBatch)
// 4. Save chunks to DB
// 5. Update document: chunkCount + status = 'indexed'
// On error: set status = 'error', errorMessage

export async function reindexCollection(collectionId: string): Promise<void>
// deleteChunksByCollection, then indexDocument() for each document

export async function deleteDocument(documentId: string): Promise<void>
// deleteChunksByDocument + deleteDocument from DB, update collection chunkCount
```

### Implementation notes

- `indexDocument` should update the document's `status` to a loading state before starting — callers (UI) can poll or subscribe
- Use `crypto.randomUUID()` for all IDs
- `reindexCollection` is needed when the embedding model changes — the manager does not enforce this automatically, but the UI (Playbook 03) must warn the user

---

## Verification

- [ ] `pnpm build` passes
- [ ] `chunkDocument()` correctly splits a Markdown test string by headers, with overlap
- [ ] `embedText()` successfully calls a real `/v1/embeddings` endpoint (test with an Ollama or OpenAI provider) and returns a `Float32Array` of the expected dimension
- [ ] `cosineSimilarity([1,0,...], [1,0,...])` returns `1.0`; `cosineSimilarity([1,0,...], [-1,0,...])` returns `-1.0`
- [ ] `addDocument()` → `indexDocument()` pipeline: document ends up with `status: 'indexed'` and chunks are in IndexedDB
- [ ] `deleteCollection()` cascades: no orphaned documents or chunks remain
