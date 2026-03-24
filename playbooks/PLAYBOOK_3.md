# Playbook 3 — Detection Flow: Turn Tracking, Trigger, Suggestion UI

> **Ziel:** Memory Detection funktioniert end-to-end. User chattet → nach N Turns erscheint Suggestion Popup → User kann Accept/Edit/Dismiss → Entries landen in DB.
> **Voraussetzung:** Playbook 1 + 2 abgeschlossen.

---

## 3.1 Turn Counter in ChatPage (`frontend/src/components/ChatPage.tsx`)

### Nach jedem gesendeten Message

Wenn ein User-Turn + Assistant-Reply komplett ist:

```typescript
const { incrementTurnCount, turnsSinceLastDetection } = useAppStore();

// Nach erfolgreichem Assistant-Reply:
incrementTurnCount(personaId);

// Prüfen ob Detection fällig:
const interval = settings.memorySettings.detectionInterval;
const turns = turnsSinceLastDetection[personaId] ?? 0;
if (shouldRunDetection(turns, interval)) {
    // Detection triggern (siehe 3.3)
}
```

### Session End Hook

```typescript
useEffect(() => {
    return () => {
        // Cleanup: Detection bei Unmount wenn mind. 1 Turn seit letzter Detection
        const turns = useAppStore.getState().turnsSinceLastDetection[personaId] ?? 0;
        if (turns > 0) {
            // Fire-and-forget Detection
            triggerDetection(personaId, messages);
        }
    };
}, [personaId]);
```

**Achtung:** Session-End Detection sollte "silent" sein — kein Popup, Ergebnisse direkt als `suggested` speichern. User sieht sie beim nächsten Mal auf der Memory Page.

---

## 3.2 Detection State

Temporärer State für den Suggestion-Flow (in ChatPage oder appStore):

```typescript
// Lokaler State in ChatPage:
const [suggestedEntries, setSuggestedEntries] = useState<MemoryPendingEntry[]>([]);
const [isDetecting, setIsDetecting] = useState(false);
```

---

## 3.3 Detection Trigger Funktion

```typescript
async function triggerDetection(personaId: string, messages: Message[]) {
    setIsDetecting(true);
    try {
        // Bestimme Worker Model (oder Chat Model als Fallback)
        const workerModelId = settings.memorySettings.workerModelId;
        const model = workerModelId ? getModelById(workerModelId) : currentChatModel;
        const provider = getProviderForModel(model);

        // Nur die letzten N Messages seit letzter Detection
        const recentMessages = messages.slice(-10); // oder smarter basierend auf Turn-Count

        const entries = await detectMemories(recentMessages, personaId, chatId, provider, model);

        if (entries.length > 0) {
            setSuggestedEntries(entries);
        }

        resetTurnCount(personaId);
    } catch (err) {
        console.error('Memory detection failed:', err);
        // Silently fail — Memory ist nice-to-have, kein Showstopper
    } finally {
        setIsDetecting(false);
    }
}
```

---

## 3.4 MemorySuggestion Popup (`frontend/src/components/MemorySuggestion.tsx`)

### Props

```typescript
interface MemorySuggestionProps {
    entries: MemoryPendingEntry[];
    personaColor: string;
    onAccept: (entry: MemoryPendingEntry) => void;
    onAcceptAll: () => void;
    onDismiss: (entryId: string) => void;
    onDismissAll: () => void;
    onEdit: (entryId: string, newContent: string) => void;
}
```

### Layout

```
┌─────────────────────────────────────────┐
│ 💾 Memory Detected                      │
│ ────────────────────────────────────     │
│ 📌 User is a dev from Vienna    [✓] [✗] │
│ 💫 Excited about AI features    [✓] [✗] │
│ ⚙️ Prefers German in chat       [✓] [✗] │
│                                          │
│ [✓ Accept All]        [✗ Dismiss All]    │
└─────────────────────────────────────────┘
```

### Verhalten

- **Positionierung:** Über dem Chat-Input, Slide-Up Animation
- **Pro Entry:** Emoji + Content (klickbar zum Editieren) + Accept + Dismiss Buttons
- **Edit:** Tap auf Content → Inline Input/Textarea, Enter bestätigt
- **Accept:** Entry wird mit `status: 'accepted'` in `memoryPending` Store gespeichert
- **Dismiss:** Entry wird mit `status: 'dismissed'` gespeichert (oder einfach verworfen)
- **Accept All / Dismiss All:** Batch-Operation
- **Auto-Close:** Popup verschwindet wenn alle Entries behandelt
- **Styling:** Persona-Akzentfarbe für Borders/Highlights, dark theme passend

### Accept Handler (in ChatPage)

```typescript
async function handleAcceptEntry(entry: MemoryPendingEntry) {
    const accepted = { ...entry, status: 'accepted' as const };
    await savePendingEntry(accepted);

    // Update meta pending count
    const meta = await getMemoryMeta(personaId) ?? createDefaultMeta(personaId);
    meta.pendingCount++;
    await saveMemoryMeta(meta);

    // Trigger hearts for emotional/nsfw
    if (entry.type === 'emotional' || entry.type === 'nsfw') {
        triggerFloatingHearts();
    }

    // Remove from suggestion list
    setSuggestedEntries(prev => prev.filter(e => e.id !== entry.id));
}
```

---

## 3.5 FloatingHearts Animation (`frontend/src/components/FloatingHearts.tsx`)

### Einfache CSS-basierte Animation

```typescript
interface FloatingHeartsProps {
    color: string;       // Persona accent color
    trigger: boolean;    // true = start animation
    onComplete: () => void;
}
```

- Spawnt 3–5 Herzen (❤️ oder ♥) an zufälligen X-Positionen
- Float-Up mit leichtem Wobble, Fade-Out
- Dauer: ~1.5s
- Prüfen ob `heartFloat` Keyframe in `index.css` existiert, sonst anlegen:

```css
@keyframes heartFloat {
    0% { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-120px) scale(0.6); }
}
```

---

## 3.6 Integration in ChatPage

```tsx
{/* Vor dem Chat-Input: */}
{suggestedEntries.length > 0 && (
    <MemorySuggestion
        entries={suggestedEntries}
        personaColor={persona.color}
        onAccept={handleAcceptEntry}
        onAcceptAll={handleAcceptAll}
        onDismiss={handleDismissEntry}
        onDismissAll={handleDismissAll}
        onEdit={handleEditEntry}
    />
)}

{showHearts && (
    <FloatingHearts
        color={persona.color}
        trigger={showHearts}
        onComplete={() => setShowHearts(false)}
    />
)}
```

---

## Validierung

Nach Abschluss:
- [ ] `pnpm build` kompiliert ohne Fehler
- [ ] Chat starten, 5+ Turns senden → Suggestion Popup erscheint
- [ ] Accept → Entry in IndexedDB (memoryPending Store prüfen)
- [ ] Dismiss → Entry verschwindet
- [ ] Edit → Content ändern, dann Accept
- [ ] Hearts Animation bei emotional Accept
- [ ] Session verlassen und zurückkommen → keine doppelte Detection
- [ ] Nächste Chat-Nachricht enthält Memory im System Prompt (console.log prüfen)
