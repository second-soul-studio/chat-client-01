# Playbook 1 — Foundation: Types, DB Schema, Store Skeleton

> **Ziel:** Alle Datenstrukturen stehen, IndexedDB v4 läuft, CRUD-Funktionen existieren, AppSettings erweitert.
> **Keine UI, kein LLM-Call — reine Daten-Infrastruktur.**

---

## 1.1 Types definieren (`frontend/src/types/index.ts`)

Neue Types am Ende der Datei hinzufügen:

```typescript
// ─── Memory System ────────────────────────────────────────────────────────────

export type MemoryType = 'emotional' | 'hard_fact' | 'preference' | 'event' | 'nsfw';

export const MEMORY_TYPE_EMOJI: Record<MemoryType, string> = {
    emotional: '💫',
    hard_fact: '📌',
    preference: '⚙️',
    event: '📅',
    nsfw: '🔥',
};

export interface MemoryPendingEntry {
    id: string;
    personaId: string;
    type: MemoryType;
    content: string;
    extractedAt: number;
    sourceChatId: string;
    status: 'suggested' | 'accepted' | 'dismissed';
}

export interface MemoryTopic {
    id: string;                   // "{personaId}-{slug}"
    personaId: string;
    slug: string;                 // "profile", "interests", etc.
    content: string;              // Markdown
    updatedAt: number;
}

export interface MemoryMeta {
    personaId: string;            // PK
    indexContent: string;         // Markdown index (topic overview)
    lastConsolidatedAt: number | null;
    pendingCount: number;
    nsfwEnabled: boolean;
}

export interface MemorySettings {
    workerModelId: string | null;     // null = use chat model
    autoConsolidate: boolean;
    consolidationThreshold: number;   // 5–25, default 10
    detectionInterval: number;        // 3–10 turns, default 5
}
```

### AppSettings erweitern

```typescript
export interface AppSettings {
    globalSystemPrompt: string;
    defaultModelId: string | null;
    theme: 'dark';
    memorySettings: MemorySettings;   // ← NEU
}
```

### Persona erweitern

```typescript
export interface Persona {
    // ... alle bestehenden Felder
    memoryEnabled?: boolean;          // ← NEU, default true
}
```

---

## 1.2 IndexedDB auf Version 4 (`frontend/src/services/db.ts`)

### DBSchema erweitern

Neue Stores zum `SecondSoulDB` Interface hinzufügen:

```typescript
memoryPending: {
    key: string;
    value: MemoryPendingEntry;
    indexes: { 'by-persona': string; 'by-status': string };
};
memoryTopics: {
    key: string;
    value: MemoryTopic;
    indexes: { 'by-persona': string };
};
memoryMeta: {
    key: string;
    value: MemoryMeta;
};
```

### Upgrade-Logik

Version von 3 auf 4 hochsetzen. Neuer Block:

```typescript
if (oldVersion < 4) {
    const pendingStore = db.createObjectStore('memoryPending', { keyPath: 'id' });
    pendingStore.createIndex('by-persona', 'personaId');
    pendingStore.createIndex('by-status', 'status');

    const topicStore = db.createObjectStore('memoryTopics', { keyPath: 'id' });
    topicStore.createIndex('by-persona', 'personaId');

    db.createObjectStore('memoryMeta', { keyPath: 'personaId' });
}
```

### DEFAULT_SETTINGS erweitern

```typescript
const DEFAULT_SETTINGS: AppSettings = {
    globalSystemPrompt: '',
    defaultModelId: 'nano-gpt/claude-sonnet-4-6',
    theme: 'dark',
    memorySettings: {
        workerModelId: null,
        autoConsolidate: true,
        consolidationThreshold: 10,
        detectionInterval: 5,
    },
};
```

---

## 1.3 CRUD-Funktionen (`frontend/src/services/db.ts`)

Neue Sektionen am Ende der Datei:

```typescript
// ─── Memory: Pending Entries ──────────────────────────────────────────────────

export async function getPendingEntries(personaId: string): Promise<MemoryPendingEntry[]> {
    const db = await getDB();
    return db.getAllFromIndex('memoryPending', 'by-persona', personaId);
}

export async function getAcceptedPendingEntries(personaId: string): Promise<MemoryPendingEntry[]> {
    const all = await getPendingEntries(personaId);
    return all.filter(e => e.status === 'accepted');
}

export async function savePendingEntry(entry: MemoryPendingEntry): Promise<void> {
    const db = await getDB();
    await db.put('memoryPending', entry);
}

export async function deletePendingEntry(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('memoryPending', id);
}

export async function clearAcceptedPendingEntries(personaId: string): Promise<void> {
    const entries = await getAcceptedPendingEntries(personaId);
    const db = await getDB();
    const tx = db.transaction('memoryPending', 'readwrite');
    for (const e of entries) {
        await tx.store.delete(e.id);
    }
    await tx.done;
}

// ─── Memory: Topics ───────────────────────────────────────────────────────────

export async function getMemoryTopics(personaId: string): Promise<MemoryTopic[]> {
    const db = await getDB();
    return db.getAllFromIndex('memoryTopics', 'by-persona', personaId);
}

export async function saveMemoryTopic(topic: MemoryTopic): Promise<void> {
    const db = await getDB();
    await db.put('memoryTopics', topic);
}

export async function deleteMemoryTopic(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('memoryTopics', id);
}

// ─── Memory: Meta ─────────────────────────────────────────────────────────────

export async function getMemoryMeta(personaId: string): Promise<MemoryMeta | undefined> {
    const db = await getDB();
    return db.get('memoryMeta', personaId);
}

export async function saveMemoryMeta(meta: MemoryMeta): Promise<void> {
    const db = await getDB();
    await db.put('memoryMeta', meta);
}

// ─── Memory: Cascade Delete ───────────────────────────────────────────────────

export async function deleteAllMemoryForPersona(personaId: string): Promise<void> {
    const db = await getDB();

    const pending = await db.getAllFromIndex('memoryPending', 'by-persona', personaId);
    const topics = await db.getAllFromIndex('memoryTopics', 'by-persona', personaId);

    const tx1 = db.transaction('memoryPending', 'readwrite');
    for (const e of pending) await tx1.store.delete(e.id);
    await tx1.done;

    const tx2 = db.transaction('memoryTopics', 'readwrite');
    for (const t of topics) await tx2.store.delete(t.id);
    await tx2.done;

    await db.delete('memoryMeta', personaId);
}
```

---

## 1.4 Zustand Store Skeleton (`frontend/src/stores/appStore.ts`)

Minimale Memory-State-Erweiterung (Actions kommen in späteren Playbooks):

```typescript
// Zum State-Interface hinzufügen:
turnsSinceLastDetection: Record<string, number>;
incrementTurnCount: (personaId: string) => void;
resetTurnCount: (personaId: string) => void;
```

Implementation:

```typescript
turnsSinceLastDetection: {},

incrementTurnCount: (personaId) => set(state => ({
    turnsSinceLastDetection: {
        ...state.turnsSinceLastDetection,
        [personaId]: (state.turnsSinceLastDetection[personaId] ?? 0) + 1,
    },
})),

resetTurnCount: (personaId) => set(state => ({
    turnsSinceLastDetection: {
        ...state.turnsSinceLastDetection,
        [personaId]: 0,
    },
})),
```

---

## 1.5 Persona Delete Cascade

In der bestehenden `deletePersona`-Funktion (oder im Store) sicherstellen, dass `deleteAllMemoryForPersona()` aufgerufen wird, wenn eine Persona gelöscht wird.

---

## Validierung

Nach Abschluss:
- [ ] `pnpm build` kompiliert ohne Fehler
- [ ] App startet und IndexedDB wird auf v4 migriert (DevTools → Application → IndexedDB prüfen)
- [ ] Bestehende Daten (Personas, Chats, Settings) sind noch intakt
- [ ] `DEFAULT_SETTINGS` hat `memorySettings` mit sinnvollen Defaults
