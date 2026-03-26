# Playbook 04 — Persona & Settings Integration

## Goal

Wire Knowledge Collections into the Persona configuration and the global Settings page, and add the Knowledge nav entry to the bottom navigation.

## Prerequisites

- Playbook 01 complete (types include `knowledgeCollectionIds` on Persona)
- Playbook 03 complete (collections can be created and managed)

---

## Step 1 — `PersonaFormModal.tsx` — Collection Assignment

Add a new section to the persona form: **Knowledge Collections**.

### UI

- Multi-select list of existing collections (load via `getCollections()`)
- Each item: collection name + document count + embedding model slug
- Checkbox or toggle per collection
- Show "No collections yet — create one in the Knowledge section" if the list is empty
- Placement: after the Memory section (or as a separate tab if the form is already large)

### Data

- Read `persona.knowledgeCollectionIds ?? []`
- On save: write the updated array back to the persona

---

## Step 2 — `SettingsPage.tsx` — Knowledge Tab

Add a **Knowledge** tab to the Settings page, alongside the existing tabs.

### Settings to expose

| Setting | Input | Default |
|---------|-------|---------|
| Default Embedding Provider | select (from saved Providers) | — |
| Default Embedding Model | text | — |
| Default Chunk Size (tokens) | number | 1000 |
| Default Chunk Overlap (tokens) | number | 100 |
| Knowledge Context Token Budget | number | 3000 |
| Top-K Chunks per Query | number | 5 |
| RAG Prompt Template | textarea | see below |

### Default RAG Prompt Template

```
Use the following context to answer. Cite sources when relevant.
<context>
{{chunks}}
</context>
```

The `{{chunks}}` placeholder is replaced at query time with formatted `<source>` blocks (see Playbook 05).

### Notes

- These are stored in `AppSettings.knowledge` (added in Playbook 01)
- The token budget and top-K affect the chat injection (Playbook 05) — a short help text beneath each field is useful
- "Reset to defaults" button for the whole Knowledge tab

---

## Step 3 — `BottomNav.tsx` — Knowledge Link

Add a new navigation entry for the Knowledge page.

- Icon: book or database icon (use whatever icon set the project already uses)
- Label: "Knowledge"
- Route: `/knowledge`
- Active state: same logic as existing nav items

---

## Step 4 — `appStore.ts` — Knowledge State

Add the following to the Zustand store:

- `collections: KnowledgeCollection[]` — loaded on app init (like `personas`)
- `loadCollections(): Promise<void>`
- `saveCollection(c: KnowledgeCollection): Promise<void>` — updates store + DB
- `removeCollection(id: string): Promise<void>` — calls `manager.deleteCollection()`, updates store

These mirror the existing persona state patterns. The `PersonaFormModal` and `KnowledgePage` both consume `collections` from the store.

---

## Verification

- [ ] PersonaFormModal shows a list of collections with checkboxes
- [ ] Saving a persona with selected collections persists `knowledgeCollectionIds` in IndexedDB
- [ ] Opening the persona form again shows the previously selected collections as checked
- [ ] Settings → Knowledge tab renders all fields and saves correctly
- [ ] Changing default chunk size is reflected the next time a `CollectionFormModal` is opened (pre-fills from settings)
- [ ] BottomNav shows the Knowledge entry and navigates to `/knowledge`
- [ ] Active state highlights the Knowledge link when on `/knowledge`
