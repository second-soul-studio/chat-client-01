# Playbook 4 — Memory Page: Viewing, Editing, Consolidation UI

> **Ziel:** Vollständige Memory Page mit Topic-Ansicht, Pending-Liste, Consolidation, CRUD.
> Route `/memory/:personaId` funktioniert. PersonaCard verlinkt dort hin.
> **Voraussetzung:** Playbook 1–3 abgeschlossen.

---

## 4.1 Route hinzufügen (`frontend/src/App.tsx`)

```typescript
import MemoryPage from '@/components/MemoryPage';

// Neue Route:
<Route path="/memory/:personaId" element={<MemoryPage />} />
```

---

## 4.2 PersonaCard Menu Update (`frontend/src/components/PersonaCard.tsx`)

Der bestehende "Nostalgia" Menu-Eintrag navigiert aktuell zu `/history?persona=${persona.id}`.

**Änderung:** Nostalgia → Memory Page, History als eigener Eintrag oder von Memory Page aus erreichbar.

```typescript
// MENU_ITEMS aktualisieren oder Nostalgia-Handler ändern:
onNostalgia={() => { navigate(`/memory/${persona.id}`); setMenuOpen(false); }}
```

Optional: History-Link auf Memory Page Header ("📜 View History" → `/history?persona=${persona.id}`)

---

## 4.3 Memory Page (`frontend/src/components/MemoryPage.tsx`)

### URL Param

```typescript
const { personaId } = useParams<{ personaId: string }>();
```

### Daten laden

```typescript
const [meta, setMeta] = useState<MemoryMeta | null>(null);
const [topics, setTopics] = useState<MemoryTopic[]>([]);
const [pending, setPending] = useState<MemoryPendingEntry[]>([]);
const [isConsolidating, setIsConsolidating] = useState(false);

useEffect(() => {
    loadMemoryData();
}, [personaId]);

async function loadMemoryData() {
    const [m, t, p] = await Promise.all([
        getMemoryMeta(personaId),
        getMemoryTopics(personaId),
        getAcceptedPendingEntries(personaId),
    ]);
    setMeta(m ?? null);
    setTopics(t);
    setPending(p);
}
```

### Layout

```
┌──────────────────────────────────────────────────┐
│ [← Back]              Memories for {name}         │
│ ────────────────────────────────────────────────  │
│ 🔥 Include NSFW in prompt: [Toggle]               │
│ ────────────────────────────────────────────────  │
│ [💾 Consolidate Now (3 pending)]  [+ Add Memory]  │
│ ────────────────────────────────────────────────  │
│                                                   │
│ ## Topics                               ~1.2k tok │
│                                                   │
│ ▼ profile                                         │
│   Chris, 47, developer from Vienna who loves      │
│   cats. Has a cat named Mittens...                 │
│   [Edit] [🗑 Delete]                               │
│                                                   │
│ ▼ interests                                       │
│   AI/ML, TypeScript, dark mode, indie games...     │
│   [Edit] [🗑 Delete]                               │
│                                                   │
│ ────────────────────────────────────────────────  │
│                                                   │
│ ## Pending Entries (3)                             │
│                                                   │
│ 💫 User loved the new feature        [🗑]         │
│ 📌 Uses pnpm as package manager      [🗑]         │
│ ⚙️ Prefers concise responses          [🗑]         │
│                                                   │
│ ────────────────────────────────────────────────  │
│ 📜 View Chat History                               │
└──────────────────────────────────────────────────┘
```

---

## 4.4 Topic-Ansicht

### Collapsible Topics

Jeder Topic ist ein aufklappbares Accordion:
- Header: Slug-Name + One-Liner aus Index
- Body: Voller Markdown-Content
- Actions: Edit (Inline Textarea) + Delete

### Topic Edit

```typescript
const [editingTopic, setEditingTopic] = useState<string | null>(null);
const [editContent, setEditContent] = useState('');

async function handleSaveTopic(topicId: string) {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    await saveMemoryTopic({ ...topic, content: editContent, updatedAt: Date.now() });
    setEditingTopic(null);
    loadMemoryData();
}
```

### Topic Delete

```typescript
async function handleDeleteTopic(topicId: string) {
    await deleteMemoryTopic(topicId);
    loadMemoryData();
}
```

---

## 4.5 Pending Entries Liste

- Zeigt alle `status: 'accepted'` Entries (die noch nicht konsolidiert sind)
- Pro Entry: Typ-Emoji + Content + Delete Button
- Delete entfernt aus DB und aktualisiert Meta pendingCount

---

## 4.6 Consolidation UI

### Consolidate Button

```typescript
async function handleConsolidate() {
    if (pending.length === 0) return;
    setIsConsolidating(true);
    try {
        // Worker Model bestimmen
        const workerModelId = settings.memorySettings.workerModelId;
        const model = workerModelId ? getModelById(workerModelId) : getDefaultModel();
        const provider = getProviderForModel(model);

        await consolidateMemory(personaId, provider, model);
        await loadMemoryData(); // Refresh
    } catch (err) {
        // Error Toast/Message
        console.error('Consolidation failed:', err);
    } finally {
        setIsConsolidating(false);
    }
}
```

### UI States

- **Keine Pending:** Button disabled, Text "Nothing to consolidate"
- **Pending vorhanden:** Button enabled mit Badge-Count
- **Consolidating:** Spinner/Progress, Button disabled
- **Fehler:** Error-Message, Daten bleiben intakt

---

## 4.7 Manual Memory Addition

Button "+ Add Memory" öffnet kleines Modal/Inline-Form:

```
┌────────────────────────────────┐
│ Add Memory                     │
│ Type: [Dropdown: 📌📫⚙️📅🔥]   │
│ Content: [________________]    │
│ [Cancel]  [Save]               │
└────────────────────────────────┘
```

Speichert direkt als `MemoryPendingEntry` mit `status: 'accepted'`, `source: 'manual'`.

---

## 4.8 NSFW Toggle

```typescript
async function handleToggleNsfw() {
    const updated = { ...meta!, nsfwEnabled: !meta!.nsfwEnabled };
    await saveMemoryMeta(updated);
    setMeta(updated);
}
```

Wenn `nsfwEnabled: false`:
- NSFW Pending Entries werden in der Liste ausgeblendet (nicht gelöscht)
- NSFW-Inhalte in Topics werden nicht extra gefiltert (sind in Fließtext eingebettet)
- Memory-Injection filtert NSFW Pending Entries aus Prompt raus

---

## 4.9 Token-Schätzung

Einfache Anzeige rechts oben im Topics-Bereich:

```typescript
function estimateMemoryTokens(meta: MemoryMeta, topics: MemoryTopic[], pending: MemoryPendingEntry[]): number {
    let text = meta.indexContent || '';
    for (const t of topics) text += t.content;
    for (const p of pending) text += p.content;
    return Math.ceil(text.length / 4); // grobe Schätzung
}
```

Anzeige: `~1.2k tok` — rein informativ, keine Warnung unter 2500.

---

## 4.10 Styling

- Dark theme, konsistent mit restlicher App
- Persona-Akzentfarbe für Highlights, Borders, Buttons
- Responsive (mobile-first, wie der Rest der App)
- Consistent mit HistoryPage / SettingsPage Layout

---

## Validierung

Nach Abschluss:
- [ ] `pnpm build` kompiliert ohne Fehler
- [ ] `/memory/:personaId` Route erreichbar
- [ ] PersonaCard "Nostalgia" → Memory Page
- [ ] Topics werden angezeigt (nach mind. einer Consolidation)
- [ ] Pending Entries sichtbar mit Emoji-Typen
- [ ] Topic Edit → speichert → wird injiziert
- [ ] Topic Delete → Topic weg
- [ ] Pending Delete → Entry weg, Count aktualisiert
- [ ] Consolidate Button → LLM Call → Topics werden neu aufgebaut
- [ ] Add Memory → neuer Pending Entry
- [ ] NSFW Toggle → filtert aus Prompt
- [ ] Token-Schätzung wird angezeigt
