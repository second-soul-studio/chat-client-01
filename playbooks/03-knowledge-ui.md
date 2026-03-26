# Playbook 03 — Knowledge UI

## Goal

Build the Knowledge management page: collection grid, collection detail view with document list, document upload/paste, indexing progress, and embedding model configuration.

## Prerequisites

- Playbook 01 + 02 complete
- Pattern reference: `PersonasPage.tsx` for the collection grid layout
- Routing: `src/App.tsx` (or wherever routes are defined) — add `/knowledge` route

---

## Step 1 — Route Setup

Add the `/knowledge` route in the router configuration. Follow the same pattern as existing routes (e.g. `/personas`, `/settings`).

---

## Step 2 — `KnowledgePage.tsx` (`src/components/KnowledgePage.tsx`)

### Layout: two views in one page

**Collection Grid View** (default):
- Card grid, similar to `PersonasPage.tsx`
- Each card shows: collection name, description (truncated), document count, chunk count, embedding model slug
- Action buttons per card: Edit, Delete, Open (navigate to detail view)
- "+ New Collection" button → opens `CollectionFormModal`

**Collection Detail View** (when a collection is selected):
- Back button → returns to grid
- Header: collection name + edit button
- Document list: name, status badge (`pending` / `indexed` / `error`), chunk count, delete button
- Upload area: drag-and-drop or click-to-select `.md` / `.txt` files; also a "Paste text" button that opens a textarea
- When a document is uploading/indexing: show a spinner or progress indicator on its row
- Error state: show `errorMessage` with a "Retry" button (calls `indexDocument()` again)

---

## Step 3 — `CollectionFormModal.tsx` (`src/components/CollectionFormModal.tsx`)

Form for creating and editing collections. Fields:

| Field | Input | Notes |
|-------|-------|-------|
| Name | text | required |
| Description | textarea | optional |
| Embedding Provider | select | list from saved Providers |
| Embedding Model | text or select | see below |
| Embedding Dimension | number | auto-filled after test, or manual |
| Chunk Size (tokens) | number | default from KnowledgeSettings |
| Chunk Overlap (tokens) | number | default from KnowledgeSettings |

### Embedding model selection UX

- When a Provider is selected, show a dropdown with curated defaults from `src/data/embedding-models.default.json` (create this file — see below)
- For Ollama providers: additionally show auto-discovered models that have `supportsEmbedding` (if the flag is stored on ModelConfig)
- Always allow free-text input (override the dropdown)
- "Test" button: calls `embedText('test', providerId, modelSlug)`, reports success + dimension, auto-fills `embeddingDimension`

### `src/data/embedding-models.default.json`

```json
{
  "openai": [
    { "slug": "text-embedding-3-small", "dimension": 1536 },
    { "slug": "text-embedding-3-large", "dimension": 3072 },
    { "slug": "text-embedding-ada-002", "dimension": 1536 }
  ],
  "mistral": [
    { "slug": "mistral-embed", "dimension": 1024 }
  ],
  "openrouter": [],
  "nanogpt": [
    { "slug": "Qwen/Qwen3-Embedding-4B", "dimension": 2560 }
  ],
  "ollama": []
}
```

Keys match the Provider `adapter` field (or `metaFetcherKey`). Ollama is empty because it uses auto-discovery.

---

## Step 4 — Embedding Model Change Warning

When editing a collection and the user changes `embeddingModelSlug` or `embeddingProviderId`:

> "Changing the embedding model will require re-indexing all documents in this collection. Existing chunks will be deleted and regenerated. Continue?"

On confirm: save the collection, then call `reindexCollection(id)`. Show progress in the detail view.

---

## Step 5 — File Upload Logic

In the detail view upload area:

1. Accept `.md` and `.txt` files (set `accept=".md,.txt"` on the file input)
2. Read file content via `FileReader` (or `file.text()`)
3. Call `manager.addDocument(collectionId, file.name, content)`
4. The manager handles chunking + embedding asynchronously
5. Poll or use a reactive pattern to update the document's status in the list

For the "Paste text" flow:
- Show a modal/drawer with a textarea + name field
- Same call to `addDocument()` on submit

---

## Verification

- [ ] `/knowledge` route renders the collection grid
- [ ] Creating a collection via the modal saves it to IndexedDB and appears in the grid
- [ ] Editing a collection updates it; changing the model shows the re-index warning
- [ ] Deleting a collection removes it and all documents/chunks (verify in DevTools IndexedDB)
- [ ] Uploading a `.md` file triggers indexing; document status changes to `indexed`
- [ ] Uploading a file with a bad provider/model slug results in `status: 'error'` with a visible message
- [ ] "Paste text" flow works end-to-end
- [ ] "Test" button on the form correctly reports the embedding dimension
