# Memory System — Concrete Implementation Plan

> **Dies ist der finale, konsolidierte Plan für das erste Memory-System.**
> Zusammengeführt aus FIRST-MEMORY.md und GLM-MEMORY-PLAN.md — "Best of Both".

---

## Überblick

Ein per-Persona Memory System mit zwei Phasen: **Extract** (leichtgewichtig, append-only) und **Consolidate** (smart rebuild des gesamten Topic-Trees). Alle Daten leben in IndexedDB. Ein konfigurierbares **Memory Worker Model** übernimmt Extraction und Consolidation.

**Kernprinzipien:**
- Topic-basierte Speicherung (skaliert, strukturiert, injizierbar)
- User hat volle Kontrolle (einsehen, editieren, löschen, approve/dismiss)
- Lazy Detection — nicht bei jedem Turn
- Trust the smart model — knappe Prompts, keine Gängelei

---

## Storage-Architektur

### Topic-basiert (aus FIRST-MEMORY)

Jede Persona hat einen **Index** und mehrere **Topic Files** als Markdown:

```
MemoryIndex     { personaId, content: string }         // Kurzübersicht aller Topics
MemoryTopic[]   { personaId, slug: string, content: string }  // Eigentlicher Inhalt
MemoryPending[] { personaId, content: string, type: MemoryType, extractedAt: number, sourceChatId: string }
MemoryMeta      { personaId, lastConsolidatedAt: number, pendingCount: number, nsfwEnabled: boolean }
```

### Standard-Topics (vom Consolidation-Model angelegt/verwaltet)

- `profile` — wer der User ist, grundlegende Fakten
- `interests` — Themen, Hobbies, wiederkehrende Interessen
- `ongoing` — aktuelle Projekte, offene Threads
- `preferences` — Kommunikationsstil, Arbeitsweise
- `events` — wichtige Lebensereignisse

Das Model darf Topics nach Bedarf hinzufügen, umbenennen oder zusammenführen.

### Typed Pending Entries (aus GLM-PLAN)

Extrahierte Memories im Pending-Buffer haben einen Typ mit Emoji:

| Type | Emoji | Beschreibung |
|------|-------|--------------|
| `emotional` | 💫 | Emotionale Momente, Gefühle |
| `hard_fact` | 📌 | Konkrete Fakten (Name, Alter, Wohnort) |
| `preference` | ⚙️ | Vorlieben, Abneigungen |
| `event` | 📅 | Lebensereignisse |
| `nsfw` | 🔥 | Adult/intimate Content |

Die Typen existieren nur im Pending-Buffer für UI-Darstellung. Nach Consolidation fließen sie in die freeform Topic Files ein.

---

## TypeScript Types

```typescript
// types/index.ts — neue Types

type MemoryType = 'emotional' | 'hard_fact' | 'preference' | 'event' | 'nsfw';

interface MemoryPendingEntry {
    id: string;
    personaId: string;
    type: MemoryType;
    content: string;              // extrahierter Text
    extractedAt: number;
    sourceChatId: string;
    status: 'suggested' | 'accepted' | 'dismissed';
}

interface MemoryTopic {
    id: string;                   // z.B. "persona123-profile"
    personaId: string;
    slug: string;                 // z.B. "profile", "interests"
    content: string;              // Markdown-Inhalt
    updatedAt: number;
}

interface MemoryMeta {
    personaId: string;            // PK
    indexContent: string;         // Markdown-Index (Topic-Übersicht mit One-Linern)
    lastConsolidatedAt: number | null;
    pendingCount: number;
    nsfwEnabled: boolean;         // ob NSFW-Memories in Prompt injiziert werden
}
```

### Persona-Erweiterung

```typescript
interface Persona {
    // ... bestehende Felder
    memoryEnabled?: boolean;       // default: true
}
```

### AppSettings-Erweiterung

```typescript
interface AppSettings {
    // ... bestehende Felder
    memorySettings: {
        workerModelId: string | null;     // Memory Worker Model (null = Chat-Model)
        autoConsolidate: boolean;         // default: true
        consolidationThreshold: number;   // default: 10 (Bereich: 5–25)
        detectionInterval: number;        // default: 5 (alle N Turns)
    };
}
```

---

## IndexedDB Schema (Version 4)

Neue Object Stores in `services/db.ts`:

```typescript
memoryPending: {
    key: string;           // MemoryPendingEntry.id
    value: MemoryPendingEntry;
    indexes: { 'by-persona': string; 'by-status': string };
};
memoryTopics: {
    key: string;           // MemoryTopic.id
    value: MemoryTopic;
    indexes: { 'by-persona': string };
};
memoryMeta: {
    key: string;           // personaId
    value: MemoryMeta;
};
```

DB-Funktionen:
```typescript
// Pending
export async function getPendingEntries(personaId: string): Promise<MemoryPendingEntry[]>;
export async function savePendingEntry(entry: MemoryPendingEntry): Promise<void>;
export async function deletePendingEntry(id: string): Promise<void>;
export async function getAcceptedPendingEntries(personaId: string): Promise<MemoryPendingEntry[]>;

// Topics
export async function getMemoryTopics(personaId: string): Promise<MemoryTopic[]>;
export async function saveMemoryTopic(topic: MemoryTopic): Promise<void>;
export async function deleteMemoryTopic(id: string): Promise<void>;

// Meta
export async function getMemoryMeta(personaId: string): Promise<MemoryMeta | undefined>;
export async function saveMemoryMeta(meta: MemoryMeta): Promise<void>;
```

---

## Phase 1 — Extract

### Trigger

**Hybrid-Ansatz (weniger aggressiv als GLM, zuverlässiger als FIRST):**

1. **Turn-basiert**: Alle **5 Turns** (konfigurierbar via `detectionInterval`). Nur Turns seit letzter Detection werden analysiert.
2. **Session-Ende**: Wenn User den Chat verlässt und mind. 1 neuer Turn seit letzter Detection.
3. **Manuell**: Button in Chat UI ("💾 Save to memory") — geblockt wenn Detection gerade erst lief.

### Turn-Counter (in-memory, nicht persistiert)

```typescript
// Im appStore oder separatem State
turnsSinceLastDetection: Map<string, number>   // personaId → count
```

### Extraction Prompt

```
Extract noteworthy facts about the user from this conversation.

Categories: 💫 emotional, 📌 hard_fact, ⚙️ preference, 📅 event, 🔥 nsfw

Rules:
- Only genuinely new, useful information
- Be precise, no filler
- Skip anything trivial or already obvious
- Empty array if nothing worth remembering

Output JSON: [{"type": "hard_fact", "content": "..."}, ...]

Conversation:
{last N messages since last detection}
```

### User Approval Flow (aus GLM-PLAN)

1. Detection läuft → Ergebnis kommt zurück
2. Leeres Array → kein UI
3. Entries vorhanden → **MemorySuggestion Popup** erscheint über Chat-Input
4. User kann pro Entry: **✓ Accept** / **✏️ Edit** / **✗ Dismiss**
5. Accepted Entries → `memoryPending` Store mit `status: 'accepted'`
6. Bei `emotional` oder `nsfw` Accept → Floating Hearts Animation (Persona-Farbe)

---

## Phase 2 — Consolidate

### Trigger

1. **Manuell**: Button auf Memory Page ("Consolidate Now")
2. **Nudge**: Wenn `pendingCount >= consolidationThreshold` → Info-Badge auf Memory Page
3. **Auto** (optional): Wenn `autoConsolidate: true` und Threshold erreicht, nach nächster Detection automatisch ausführen

### Was passiert

Das Memory Worker Model bekommt:
- Den aktuellen Index
- Alle bestehenden Topic Files
- Alle accepted Pending Entries

Es baut den **kompletten Topic-Tree neu auf** — dedupliziert, reorganisiert, aktualisiert.

### Consolidation Prompt

```
Rebuild this persona's memory about the user.

You receive:
1. The current memory index and topic files
2. New observations since last consolidation

Your job:
- Merge new observations into the existing topics
- Deduplicate — don't repeat what's already captured
- Create new topics if a theme emerges that doesn't fit existing ones
- Drop or shorten information that has become irrelevant
- Each topic: 5–8 concise sentences max
- Do NOT invent anything not present in the source material
- If NSFW content exists, keep it in relevant topics naturally

Output format (parsed client-side):

## INDEX
- profile: One-line summary
- interests: One-line summary
...

## TOPIC: profile
Content here...

## TOPIC: interests
Content here...
```

### Nach Consolidation

1. Client parsed Output → überschreibt Index + Topic Files in IndexedDB
2. Accepted Pending Entries werden gelöscht (bereits in Topics eingeflossen)
3. `MemoryMeta.lastConsolidatedAt` + `pendingCount` aktualisiert

---

## Injection in System Prompt

### Strategie: Alles rein, immer

Der Memory-Block wird zwischen `persona.systemPrompt` und `model.userSystemPrompt` eingefügt:

```typescript
// In services/api.ts → sendMessage()
const memoryBlock = await formatMemoryForPrompt(persona.id);

const systemPrompt = [
    settings.globalSystemPrompt,
    persona.systemPrompt,
    memoryBlock,           // ← NEU
    model.userSystemPrompt,
].filter(Boolean).join('\n\n');
```

### formatMemoryForPrompt()

```typescript
async function formatMemoryForPrompt(personaId: string): Promise<string> {
    const meta = await getMemoryMeta(personaId);
    if (!meta) return '';

    const topics = await getMemoryTopics(personaId);
    const pending = await getAcceptedPendingEntries(personaId);

    // Filter NSFW wenn disabled
    const filteredTopics = meta.nsfwEnabled ? topics : topics; // NSFW ist in Topics eingebettet, nicht filterbar per-topic
    const filteredPending = meta.nsfwEnabled
        ? pending
        : pending.filter(e => e.type !== 'nsfw');

    if (topics.length === 0 && filteredPending.length === 0) return '';

    let section = '## Your Memories of This User\n\n';

    // Index (kurz, immer dabei)
    if (meta.indexContent) {
        section += meta.indexContent + '\n\n';
    }

    // Alle Topic Files
    for (const topic of filteredTopics) {
        section += `### ${topic.slug}\n${topic.content}\n\n`;
    }

    // Unconsolidated Pending Entries
    if (filteredPending.length > 0) {
        section += 'Recent (not yet consolidated):\n';
        section += filteredPending.map(e => `• ${e.content}`).join('\n');
    }

    return section;
}
```

### Token Budget

- ~5 Topics × 5–8 Sätze = ~800–1500 Tokens
- Pending: ~5–10 Bullets = ~200–400 Tokens
- **Gesamt: ~1000–1900 Tokens** — vernachlässigbar für moderne Modelle
- Kein hartes Limit nötig — die Consolidation-Prompt-Anweisung ("5–8 Sätze max") steuert die Länge organisch
- Soft Warning auf Memory Page wenn Gesamt > 2500 Tokens

---

## UI Komponenten

### 1. MemorySuggestion Popup (`components/MemorySuggestion.tsx`)

Erscheint über dem Chat-Input nach Detection:

```
┌─────────────────────────────────────────┐
│ 💾 Memory Detected                      │
│ ────────────────────────────────────     │
│ 📌 User is a developer from Vienna  [✓][✗]│
│ 💫 User is excited about AI feature [✓][✗]│
│                                          │
│ [Accept All]  [Dismiss All]              │
└─────────────────────────────────────────┘
```

- Slide-up Animation
- Pro Entry: Typ-Emoji + Content + Accept/Dismiss
- Edit: Inline Textarea bei Tap auf Content
- Accept All / Dismiss All Shortcuts

### 2. Floating Hearts Animation (`components/FloatingHearts.tsx`)

- Trigger: Accept von `emotional` oder `nsfw` Entry
- 3–5 Hearts in Persona-Akzentfarbe, Float-Up Animation
- Nutzt bestehende CSS Keyframes wenn vorhanden, sonst neue anlegen

### 3. Memory Page (`components/MemoryPage.tsx`)

Route: `/memory/:personaId`

```
┌─────────────────────────────────────────────────┐
│ [← Back]          Memories for Luna              │
│ ─────────────────────────────────────────────── │
│ 🔥 NSFW in Prompt: [Toggle]                     │
│ ─────────────────────────────────────────────── │
│ [💾 Consolidate Now]    [+ Add Memory]           │
│ ─────────────────────────────────────────────── │
│                                                  │
│ ## Topics                              [~1.2k T] │
│                                                  │
│ 📋 profile                            [Edit][🗑] │
│   Chris, 47, developer from Vienna...            │
│                                                  │
│ 📋 interests                          [Edit][🗑] │
│   AI, cats, dark mode...                         │
│                                                  │
│ ─────────────────────────────────────────────── │
│                                                  │
│ ## Pending (3 new)                               │
│                                                  │
│ 💫 User loved the memory feature demo    [✗]     │
│ 📌 User uses pnpm as package manager    [✗]     │
│ ⚙️ Prefers German in casual chat         [✗]     │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Features:**
- NSFW Toggle (filtert aus Prompt, löscht nichts)
- Consolidate Button (+ Pending Count Badge)
- Manuell Memory hinzufügen
- Topics: Inline Edit, Delete
- Pending: Delete einzeln
- Token-Zähler (geschätzt) als Soft-Info
- Index-Ansicht (aufklappbar)

### 4. PersonaCard Menu Update

- `◎ Nostalgia` → zeigt Submenu oder navigiert direkt zu `/memory/:personaId`
- History bleibt erreichbar (von Memory Page aus oder eigener Menu-Eintrag)

### 5. Settings-Erweiterung

Im Settings-Bereich unter "Memory":

```
┌─────────────────────────────────────────────┐
│ Memory Settings                              │
│ ─────────────────────────────────────────── │
│ Worker Model: [Dropdown: Select Model]       │
│   "Use Chat Model (default)" an erster Stelle│
│                                              │
│ Detection Interval: [Slider: 3–10 Turns]     │
│   "Check every 5 turns"                      │
│                                              │
│ Auto-Consolidate: [Toggle]                   │
│ Threshold: [Slider: 5–25]                    │
│   "Consolidate after 10 new memories"        │
└─────────────────────────────────────────────┘
```

---

## Neues Service File: `services/memory.ts`

Enthält die gesamte Memory-Logik:

```typescript
// Detection
export async function detectMemories(
    messages: Message[],
    provider: Provider,
    model: ModelConfig,
): Promise<MemoryPendingEntry[]>;

// Consolidation
export async function consolidateMemory(
    personaId: string,
    provider: Provider,
    model: ModelConfig,
): Promise<void>;

// Prompt formatting
export async function formatMemoryForPrompt(personaId: string): Promise<string>;

// Helpers
export function shouldRunDetection(personaId: string, turnsSinceLastDetection: number, interval: number): boolean;
```

---

## Zustand Store Additions

```typescript
interface AppState {
    // ... bestehende State

    // Memory (in-memory tracking, nicht persistiert)
    turnsSinceLastDetection: Record<string, number>;
    incrementTurnCount: (personaId: string) => void;
    resetTurnCount: (personaId: string) => void;

    // Memory Actions (delegieren an db.ts + memory.ts)
    runMemoryDetection: (personaId: string, messages: Message[]) => Promise<MemoryPendingEntry[]>;
    acceptPendingEntry: (entry: MemoryPendingEntry) => Promise<void>;
    dismissPendingEntry: (entryId: string) => Promise<void>;
    runConsolidation: (personaId: string) => Promise<void>;
}
```

---

## File Changes Übersicht

| File | Änderung |
|------|----------|
| `types/index.ts` | `MemoryType`, `MemoryPendingEntry`, `MemoryTopic`, `MemoryMeta`, Persona + AppSettings erweitern |
| `services/db.ts` | Version 4, 3 neue Stores, CRUD-Funktionen |
| `services/memory.ts` | **NEU** — Detection, Consolidation, Prompt-Formatting |
| `services/api.ts` | Memory-Block in System Prompt einfügen |
| `stores/appStore.ts` | Turn-Tracking, Memory-Actions |
| `components/MemorySuggestion.tsx` | **NEU** — Suggestion Popup |
| `components/FloatingHearts.tsx` | **NEU** — Animation |
| `components/MemoryPage.tsx` | **NEU** — Memory Verwaltung |
| `components/ChatPage.tsx` | Turn Counter, Session-End Hook, Detection Trigger |
| `components/PersonaCard.tsx` | Nostalgia → Memory Page Routing |
| `components/SettingsPage.tsx` | Memory Settings Sektion |
| `App.tsx` | Route `/memory/:personaId` hinzufügen |

---

## Implementierungsphasen

### Phase 1: Foundation
- Types definieren (`types/index.ts`)
- AppSettings erweitern mit `memorySettings`
- IndexedDB auf Version 4, neue Stores + CRUD
- `MemoryMeta` Defaults beim ersten Zugriff

### Phase 2: Memory Service
- `services/memory.ts` anlegen
- `detectMemories()` — LLM Call + JSON Parse
- `formatMemoryForPrompt()` — Topic-Injection Builder
- `consolidateMemory()` — LLM Call + Output Parser
- Turn-Counter Logic

### Phase 3: Prompt Integration
- `api.ts` erweitern: Memory-Block einfügen
- NSFW-Filtering bei Injection

### Phase 4: Detection Flow
- Turn-Counter in `ChatPage.tsx`
- Session-End Hook (useEffect cleanup)
- Detection Trigger Logic
- `MemorySuggestion.tsx` Popup
- Accept/Edit/Dismiss Flow
- `FloatingHearts.tsx` Animation

### Phase 5: Memory Page
- `MemoryPage.tsx` mit Topic-Ansicht + CRUD
- Consolidate Button + Progress
- Manual Memory Addition
- NSFW Toggle
- Token-Zähler
- Route in `App.tsx`

### Phase 6: Settings & Polish
- Memory Worker Model Picker
- Detection Interval Slider
- Auto-Consolidate Toggle + Threshold
- PersonaCard Menu Update
- Edge Cases + Error Handling

---

## Edge Cases

| Case | Handling |
|------|----------|
| Keine Memories vorhanden | Kein Memory-Block im Prompt, Memory Page zeigt leeren Zustand |
| Worker Model nicht erreichbar | Fallback auf Chat-Model, Toast-Warnung |
| Consolidation bei 0 Pending | Button disabled, Info "Nothing to consolidate" |
| NSFW Toggle off | NSFW Pending Entries aus Prompt gefiltert, bleiben in DB |
| Persona gelöscht | Alle zugehörigen Memory-Daten löschen (cascade) |
| Consolidation-Output unparseable | Original Topics behalten, Fehlermeldung, Pending Entries nicht löschen |
| Sehr viele Pending Entries | Consolidation Prompt splitten oder warnen |

---

## Nicht in V1 (Future)

- Memory Search/Filter
- Memory Import/Export
- Relevanz-basierte selective Injection
- Cross-Persona Memory Sharing
- Memory Timeline View
- Auto-Forget (Decay)
