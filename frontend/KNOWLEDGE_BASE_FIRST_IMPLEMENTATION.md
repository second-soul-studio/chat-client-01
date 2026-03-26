# Plan: Knowledge/RAG-System für Second Soul

## TL;DR
Browser-seitiges RAG-System mit Collections (Markdown/Plaintext), Embedding über bestehende Provider (/v1/embeddings), Brute-Force Cosine Similarity gegen IndexedDB-gespeicherte Vektoren. Collections zuweisbar an Personas UND per #-Mention in Chats injizierbar. Keine externe Vektor-DB nötig.

## Entscheidungen
- **Nur Collections** (keine Einzeldateien außerhalb von Collections)
- **Bestehende Provider** für Embeddings wiederverwenden (OpenAI-compat /v1/embeddings)
- **Beides:** #-Mention im Chat UND Persona-Zuweisung
- **Nur Markdown/Plaintext** als Dateiformate
- **Brute-Force Cosine Similarity** statt HNSW (ausreichend für <10k Chunks, HNSW als spätere Option)

---

## Technische Analyse

### Cosine Similarity — Brute Force reicht
- Typische persönliche Knowledge Base: 100-500 Dokumente × ~20-50 Chunks = 2k-25k Chunks
- Cosine Similarity für 10.000 Vektoren à 1024 Dims: ~10-20ms in reinem JS mit Float32Array
- HNSW Index-Aufbau wäre teurer als die Suche selbst bei dieser Größe
- **Empfehlung:** SearchStrategy-Interface, Brute Force als Default, HNSW nachrüstbar

### WASM SIMD — Nice-to-have, nicht nötig zum Start
- In allen modernen Browsern verfügbar (Chrome, Firefox, Safari)
- Würde 3-5x Speedup bringen für Dot-Product-Berechnung
- Lohnt sich erst bei >10k Vektoren
- Alternativ: Web Workers für non-blocking Search
- **Empfehlung:** Plain JS Float32Array starten, WASM SIMD später als Optimierung

### WebGPU — Overkill
- Launch-Overhead (~1-2ms) übersteigt Nutzen bei <50k Vektoren
- API-Verfügbarkeit noch lückenhaft (kein Firefox)
- **Empfehlung:** Nicht implementieren

### Embedding-API
- OpenAI-kompatibler `/v1/embeddings` Endpoint
- Funktioniert mit: NanoGPT, OpenAI, Ollama, OpenRouter, Mistral
- Batch-fähig (mehrere Chunks pro Request)
- Proxy-Infrastruktur (proxiedFetch) kann wiederverwendet werden

---

## Embedding-Modell-Discovery & UX

### Problem
Die `/v1/models`-API gibt bei keinem Provider verlässlich an, ob ein Modell Embeddings unterstützt:

| Provider | Embedding-Discovery | Realität |
|----------|-------------------|----------|
| OpenAI | Nein | Man muss wissen: `text-embedding-3-small` |
| NanoGPT | Nein | Slug manuell: `Qwen/Qwen3-Embedding-4B` |
| Mistral | Nein | `mistral-embed` kennt man oder nicht |
| OpenRouter | Nein | Embedding-Modelle gemischt mit Chat-Modellen |
| **Ollama** | **Ja** | `/api/show` liefert `capabilities: ["embedding"]` |
| Anthropic | — | Bietet gar keine Embeddings an |

### Lösungsansatz (Kombination)
1. **Provider bekommt `embeddingSlug` + `embeddingDimension`** (optional)
2. **Kuratierte Defaults** für bekannte Provider → Dropdown mit z.B. "text-embedding-3-small (1536d)"
   - Neue Datei: `src/data/embedding-models.default.json`
3. **Ollama: Auto-Discovery** über bestehendes Capabilities-System (`supportsEmbedding` Flag)
4. **Custom Provider: Freitext + "Testen"-Button** → sendet trivialen `/v1/embeddings`-Call, speichert Dimension
5. **Collection erbt vom Provider**, kann aber überschrieben werden (Advanced-Option)

### Status: OFFEN — Detailentscheidung steht noch aus

---

## Datenmodell (3 neue IndexedDB Stores)

### knowledgeCollections
- id (UUID), name, description?, personaIds[] (zugewiesene Personas)
- embeddingProviderId, embeddingModelSlug, embeddingDimension
- chunkSize (default 1000), chunkOverlap (default 100)
- createdAt, updatedAt

### knowledgeDocuments
- id (UUID), collectionId (Index), name, content (Originaltext)
- chunkCount, status ('pending' | 'indexed' | 'error')
- createdAt

### knowledgeChunks
- id (UUID), documentId, collectionId (Index)
- content (Chunk-Text), embedding (Float32Array)
- startOffset, endOffset (Position im Originaldokument)

---

## Neue Services

### src/services/knowledge/chunker.ts
- Markdown-Header-basiertes Splitting (##, ###, etc.)
- Fallback: Paragraph-Split → Character-Split mit Overlap
- tiktoken (schon vorhanden) für Token-Zählung
- Konfigurierbar: chunkSize, chunkOverlap

### src/services/knowledge/embeddings.ts
- embedText(text, providerId, modelSlug) → Float32Array
- embedBatch(texts[], providerId, modelSlug) → Float32Array[]
- Nutzt bestehende Provider-Infrastruktur + proxiedFetch
- Batch-Size konfigurierbar (API-Limits)
- Nutzt enqueue() aus requestQueue (Rate-Limiting)

### src/services/knowledge/search.ts
- cosineSimilarity(a: Float32Array, b: Float32Array) → number
- searchCollection(queryEmbedding, collectionId, topK) → ScoredChunk[]
- searchMultipleCollections(queryEmbedding, collectionIds[], topK) → ScoredChunk[]
- Interface SearchStrategy für spätere HNSW-Erweiterung

### src/services/knowledge/manager.ts
- CRUD für Collections + Documents
- indexDocument(doc) → Chunks erstellen + Embeddings generieren
- reindexCollection(collectionId) → alle Docs neu chunken/embedden
- deleteCollection(id) → cascading delete (docs + chunks)

---

## UI-Komponenten

### KnowledgePage.tsx (neue Route /knowledge)
- Collection-Grid (ähnlich PersonasPage)
- Create/Edit/Delete Collections
- Collection-Detail: Dokument-Liste, Upload (File-Input oder Paste)
- Status-Anzeige (Indexierung läuft, N Chunks, etc.)
- Embedding-Konfiguration pro Collection (Provider + Modell)

### Erweiterte Komponenten
- **PersonaFormModal.tsx** — neues Feld: knowledgeCollectionIds[] (Multi-Select)
- **ChatInput.tsx** — #-Mention Autocomplete für Collections
- **SettingsPage.tsx** — Knowledge-Tab: Default Embedding Provider/Model, Default Chunk-Size/Overlap
- **BottomNav.tsx** — neuer Nav-Eintrag (Buch-Icon o.ä.)

---

## Chat-Integration

### Ablauf bei jeder Nachricht:
1. Relevante Collections bestimmen:
   a. Persona.knowledgeCollectionIds (automatisch)
   b. #-Mentions aus der aktuellen Nachricht (manuell)
2. User-Query embedden (ein API-Call)
3. Brute-Force Cosine Similarity gegen alle Chunks der relevanten Collections
4. Top-K (default 5) Chunks auswählen
5. Als <context>-Block formatieren (mit Source-Attribution)
6. In System Prompt injizieren (nach Memory-Block, vor Chat-Historie)

### RAG-Prompt-Template (konfigurierbar):
```
Use the following context to answer. Cite sources when relevant.
<context>
<source id="1" collection="{{name}}" document="{{doc}}">
{{chunk_content}}
</source>
...
</context>
```

### Token-Budget:
- Bestehend: 8000 Token Kontext-Budget für Chat-Historie
- Neu: Separates Budget für Knowledge-Kontext (z.B. 2000-4000 Token)
- Gesamt-Budget beachten (Modell-Context-Size)

---

## Phasen

### Phase 1 — Foundation (blockiert alles)
1. IndexedDB Schema v5: 3 neue Stores + Indexes
2. TypeScript Types: Collection, Document, Chunk, KnowledgeSettings
3. chunker.ts: Markdown-aware Splitting
4. embeddings.ts: /v1/embeddings API-Integration
5. search.ts: Brute-Force Cosine Similarity mit Float32Array
6. manager.ts: CRUD + Index-Pipeline

### Phase 2 — UI (nach Phase 1)
7. KnowledgePage: Collection-Management
8. Dokument-Upload + Indexierungs-Fortschritt
9. PersonaFormModal: Collection-Zuweisung
10. Settings: Knowledge-Tab (Defaults)
11. BottomNav: Knowledge-Link

### Phase 3 — Chat-Integration (nach Phase 1, parallel mit Phase 2)
12. ChatInput: #-Mention Parser + Autocomplete
13. api.ts: RAG-Context-Injection in sendMessage()
14. RAG-Prompt-Template (konfigurierbar in Settings)

### Phase 4 — Polish (nach 2+3)
15. Web Worker für Suche (non-blocking bei großen Collections)
16. Chunk-Preview im Chat (ausklappbar, welche Quellen verwendet wurden)
17. Collection-Import/Export (JSON mit Embeddings)

---

## Relevante bestehende Dateien
- `src/services/db.ts` — Schema erweitern (v5), neue Store-Funktionen
- `src/services/api.ts` — RAG-Kontext in sendMessage() injizieren
- `src/services/memory.ts` — Referenz für Prompt-Injection-Pattern
- `src/services/proxiedFetch.ts` — für Embedding-API-Calls
- `src/services/requestQueue.ts` — Rate-Limiting für Embedding-Batches
- `src/services/tokenCount.ts` — Token-Budgets für Chunks + Context
- `src/stores/appStore.ts` — Knowledge-State
- `src/types/index.ts` — neue Types
- `src/types/providers.ts` — embeddingModelSlug ergänzen?
- `src/components/PersonaFormModal.tsx` — Collection-Zuweisung
- `src/components/ChatPage.tsx` — #-Mention Integration
- `src/components/SettingsPage.tsx` — Knowledge-Tab
- `src/components/BottomNav.tsx` — neuer Nav-Eintrag

## Verifikation
1. Dokument hochladen → Chunks werden korrekt erstellt (Header-basiert)
2. Embedding API wird korrekt aufgerufen → Float32Array gespeichert
3. Cosine Similarity liefert relevante Chunks für Testquery
4. Persona mit Collection → RAG-Kontext automatisch im System Prompt
5. #collection-mention im Chat → Kontext wird injiziert
6. Performance: <50ms Suchzeit bei 10k Chunks
7. Offline: Einmal indexierte Collections funktionieren ohne Netz (nur Embedding braucht API)

## Offene Fragen / Überlegungen
1. **Embedding-Dimension-Mismatch:** Verschiedene Modelle haben verschiedene Dimensionen (768, 1024, 1536). Pro Collection ein Modell festlegen, oder global? → Pro Collection sicherer (Empfehlung)
2. **Re-Embedding bei Modellwechsel:** Wenn man das Embedding-Modell einer Collection ändert, müssen alle Chunks neu embedded werden → UI sollte das klar kommunizieren
3. **Hybrid Search:** Fuse.js (schon im Projekt) für Keyword-Suche + Cosine für Semantik kombinieren? → Nice-to-have, Phase 5
