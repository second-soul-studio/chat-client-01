# Playbook 01 — Foundation: Types & IndexedDB Schema

## Goal

Extend the TypeScript type system and IndexedDB schema to support the Knowledge/RAG system. This is the foundation that blocks all other phases.

## Prerequisites

- `src/types/index.ts` — add Knowledge types
- `src/types/providers.ts` — optionally extend Provider with embedding fields
- `src/services/db.ts` — upgrade schema from v4 to v5, add store functions

---

## Step 1 — TypeScript Types (`src/types/index.ts`)

Add the following interfaces:

```ts
export interface KnowledgeCollection {
  id: string;                        // UUID
  name: string;
  description?: string;
  personaIds: string[];              // assigned Personas
  embeddingProviderId: string;
  embeddingModelSlug: string;
  embeddingDimension: number;
  chunkSize: number;                 // default: 1000 (tokens)
  chunkOverlap: number;              // default: 100 (tokens)
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeDocument {
  id: string;                        // UUID
  collectionId: string;              // Index
  name: string;
  content: string;                   // original text
  chunkCount: number;
  status: 'pending' | 'indexed' | 'error';
  errorMessage?: string;
  createdAt: Date;
}

export interface KnowledgeChunk {
  id: string;                        // UUID
  documentId: string;
  collectionId: string;              // Index (for fast collection-scoped search)
  content: string;                   // chunk text
  embedding: Float32Array;
  startOffset: number;               // byte offset in original document
  endOffset: number;
}

export interface KnowledgeSettings {
  defaultEmbeddingProviderId?: string;
  defaultEmbeddingModelSlug?: string;
  defaultChunkSize: number;          // default: 1000
  defaultChunkOverlap: number;       // default: 100
  knowledgeContextTokenBudget: number; // default: 3000
  topK: number;                      // default: 5 (chunks per query)
  ragPromptTemplate: string;         // configurable, see default below
}

export interface ScoredChunk {
  chunk: KnowledgeChunk;
  score: number;
  documentName: string;
  collectionName: string;
}
```

Default RAG prompt template (store as a constant, not hardcoded inline):
```
Use the following context to answer. Cite sources when relevant.
<context>
{{chunks}}
</context>
```

Also extend the `Persona` type:
```ts
// add to existing Persona interface:
knowledgeCollectionIds?: string[];   // assigned Knowledge Collections
```

---

## Step 2 — Provider Type (`src/types/providers.ts`)

Optionally extend `Provider` with embedding configuration. This is an Advanced option — collections override it per-collection, so these are just convenient defaults:

```ts
// add to existing Provider interface (both optional):
embeddingModelSlug?: string;
embeddingDimension?: number;
```

---

## Step 3 — IndexedDB Schema v5 (`src/services/db.ts`)

### 3a — Upgrade block

Add a new `case 5:` in the `onupgradeneeded` handler (after the existing v4 block):

```ts
case 5: {
  // knowledgeCollections
  const collectionsStore = db.createObjectStore('knowledgeCollections', { keyPath: 'id' });
  collectionsStore.createIndex('by-updated', 'updatedAt');

  // knowledgeDocuments
  const documentsStore = db.createObjectStore('knowledgeDocuments', { keyPath: 'id' });
  documentsStore.createIndex('by-collection', 'collectionId');

  // knowledgeChunks
  const chunksStore = db.createObjectStore('knowledgeChunks', { keyPath: 'id' });
  chunksStore.createIndex('by-collection', 'collectionId');
  chunksStore.createIndex('by-document', 'documentId');
  break;
}
```

Change the DB version number at the top of the file from `4` to `5`.

### 3b — Store functions to add

Add the following CRUD functions in `db.ts`. Follow the existing patterns (e.g. how `getPersonas`, `savePersona`, `deletePersona` are implemented):

**Collections:**
- `getCollections(): Promise<KnowledgeCollection[]>`
- `getCollection(id: string): Promise<KnowledgeCollection | undefined>`
- `saveCollection(c: KnowledgeCollection): Promise<void>` — uses `put`
- `deleteCollection(id: string): Promise<void>`

**Documents:**
- `getDocumentsByCollection(collectionId: string): Promise<KnowledgeDocument[]>` — use `by-collection` index
- `getDocument(id: string): Promise<KnowledgeDocument | undefined>`
- `saveDocument(d: KnowledgeDocument): Promise<void>`
- `deleteDocument(id: string): Promise<void>`
- `deleteDocumentsByCollection(collectionId: string): Promise<void>` — iterate via index

**Chunks:**
- `getChunksByCollection(collectionId: string): Promise<KnowledgeChunk[]>` — use `by-collection` index; note IndexedDB cannot store `Float32Array` directly — serialise/deserialise as `ArrayBuffer` (use `embedding.buffer` on write, `new Float32Array(raw.embedding)` on read)
- `getChunksByDocument(documentId: string): Promise<KnowledgeChunk[]>` — use `by-document` index
- `saveChunks(chunks: KnowledgeChunk[]): Promise<void>` — batch put in a single transaction
- `deleteChunksByDocument(documentId: string): Promise<void>`
- `deleteChunksByCollection(collectionId: string): Promise<void>`

> **Important — Float32Array serialisation:** IndexedDB stores structured-clone data. `Float32Array` is supported but it's safest to store the underlying `ArrayBuffer` explicitly and reconstruct on read. Test this early.

**Settings:**
- Knowledge settings are part of the existing `AppSettings` object in the `settings` store. Extend `AppSettings` with `knowledge: KnowledgeSettings`. Provide defaults in the settings initialisation logic.

---

## Verification

- [ ] `pnpm build` passes without TypeScript errors
- [ ] Opening the app in the browser does not trigger any IndexedDB upgrade errors (check DevTools → Application → IndexedDB)
- [ ] Three new stores (`knowledgeCollections`, `knowledgeDocuments`, `knowledgeChunks`) are visible in DevTools
- [ ] Write a quick manual test: create a `KnowledgeCollection` object, call `saveCollection()`, then `getCollections()` — confirm round-trip works
- [ ] Float32Array round-trip: save a chunk with a dummy embedding, read it back, confirm it's still a `Float32Array`
