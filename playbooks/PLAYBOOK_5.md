# Playbook 5 — Settings, Polish & Edge Cases

> **Ziel:** Memory Settings im Settings-Bereich, Worker Model Picker, Auto-Consolidation, alle Edge Cases abgedeckt, alles rund.
> **Voraussetzung:** Playbook 1–4 abgeschlossen.

---

## 5.1 Memory Settings UI (`frontend/src/components/SettingsPage.tsx`)

Neue Sektion in den Settings (eigener Tab oder unter Global Settings):

```
┌─────────────────────────────────────────────┐
│ Memory                                       │
│ ─────────────────────────────────────────── │
│                                              │
│ Worker Model                                 │
│ [Dropdown: Use Chat Model (default) ▾]       │
│   Lists all available models                 │
│                                              │
│ Detection Interval                           │
│ [Slider: ●───────── 5 turns]                 │
│   Range: 3–10, checks for memories every N   │
│                                              │
│ Auto-Consolidate                             │
│ [Toggle: ●]                                  │
│                                              │
│ Consolidation Threshold                      │
│ [Slider: ●───────── 10 entries]              │
│   Range: 5–25                                │
│                                              │
└─────────────────────────────────────────────┘
```

### Worker Model Dropdown

- Erster Eintrag: "Use Chat Model (default)" → `workerModelId: null`
- Dann alle verfügbaren Models aus allen Providers, gruppiert nach Provider
- Empfehlung: Capable models oben (Claude, GPT-4, GLM-5, etc.)

### Slider Komponente

Falls noch keine Slider-Komponente existiert, eine einfache bauen:
- Range Input mit Label + aktuellem Wert
- Styling: Dark theme, Persona-neutral (globale Settings)

---

## 5.2 Auto-Consolidation Logic

Wenn `autoConsolidate: true` und nach einer Detection der `pendingCount >= threshold`:

```typescript
// In der Detection-Trigger-Logik (ChatPage oder memory.ts):
if (settings.memorySettings.autoConsolidate) {
    const meta = await getMemoryMeta(personaId);
    if (meta && meta.pendingCount >= settings.memorySettings.consolidationThreshold) {
        // Auto-consolidate im Hintergrund
        try {
            await consolidateMemory(personaId, provider, model);
            // Subtle indicator: kleiner Toast "Memories consolidated ✓"
        } catch (err) {
            console.error('Auto-consolidation failed:', err);
        }
    }
}
```

**Wichtig:** Auto-Consolidation läuft NACH dem User-Approval-Flow, nicht parallel. Nur accepted Entries werden konsolidiert.

---

## 5.3 Persona Form Erweiterung (`frontend/src/components/PersonaFormModal.tsx`)

Einfaches Toggle in der Persona-Erstellung/Bearbeitung:

```
Memory: [Toggle: ● Enabled]
```

- Default: `true`
- Wenn disabled: Keine Detection, keine Injection, Memory Page zeigt "Memory disabled for this persona"

---

## 5.4 Edge Cases

### Worker Model nicht verfügbar
```typescript
async function resolveWorkerModel(): { provider: Provider; model: ModelConfig } | null {
    const { workerModelId } = settings.memorySettings;

    if (workerModelId) {
        const model = models.find(m => m.id === workerModelId);
        if (model) {
            const provider = providers.find(p => p.id === model.providerId);
            if (provider) return { provider, model };
        }
        // Configured but not found → fallback + warn
        console.warn('Memory worker model not found, using chat model');
    }

    // Fallback: current chat model
    return { provider: currentProvider, model: currentModel };
}
```

### Consolidation Output unparseable
- Behalte alle bestehenden Topics + Index
- Pending Entries NICHT löschen (nichts ging verloren)
- Zeige Fehlermeldung auf Memory Page
- Logge Raw-Output für Debugging

### Persona gelöscht
- `deletePersona()` im Store muss `deleteAllMemoryForPersona()` aufrufen
- Implementiert in Playbook 1, hier sicherstellen dass es korrekt verdrahtet ist

### Leere Memory
- Memory Page: "No memories yet. Chat with {name} and memories will be detected automatically."
- Prompt Injection: Leerer String → kein Memory-Block im System Prompt

### Viele Pending Entries (>25)
- Consolidation Prompt könnte groß werden
- Soft Warning auf Memory Page: "You have many pending entries. Consider consolidating."
- Kein harter Cutoff — dem Model vertrauen

### Concurrent Detection + Chat
- Detection ist async, Chat soll nicht blockiert sein
- Detection-Fehler werden leise geschluckt (Toast nur bei expliziten manuellen Aktionen)

---

## 5.5 AppSettings Migration

Bestehende User haben `AppSettings` ohne `memorySettings`. Sicherstellen dass beim Laden gemerged wird:

```typescript
export async function getSettings(): Promise<AppSettings> {
    const db = await getDB();
    const stored = await db.get('settings', 'main');
    // Merge with defaults to handle missing fields
    return { ...DEFAULT_SETTINGS, ...stored, memorySettings: { ...DEFAULT_SETTINGS.memorySettings, ...(stored?.memorySettings ?? {}) } };
}
```

---

## 5.6 Consolidation Progress Feedback

### Memory Page
- Consolidating: Button wird Spinner, Text "Consolidating..."
- Success: Topics refreshen, Pending-Liste leert sich, Success Toast
- Error: Error Toast mit "Consolidation failed — your data is safe"

### Auto-Consolidation (Background)
- Kleiner, unauffälliger Toast: "✓ Memories consolidated"
- Kein blocking UI

---

## 5.7 Manual Detection Button

Auf der Memory Page: Kleiner Button "🔍 Detect from recent chat"
- Nimmt die letzten Messages der aktuellsten Conversation
- Führt Detection durch
- Zeigt Ergebnisse direkt auf der Memory Page (statt Popup)
- Geblockt wenn kein aktueller Chat vorhanden

---

## 5.8 Final Polish

### Saubere Fehlerbehandlung
- Alle LLM-Calls in try/catch
- User-facing Errors als Toast (nicht console.error)
- Nie Daten verlieren bei Fehlern

### Performance
- Memory-Daten nicht bei jedem Render laden — cachen im Component State
- formatMemoryForPrompt() wird pro Message aufgerufen → sollte schnell sein (nur DB reads)
- Consolidation ist teuer → nur explizit oder auto mit Threshold

### Accessibility
- ARIA Labels auf allen Buttons
- Keyboard Navigation für Suggestion Popup
- Screen Reader: Type-Emojis haben Textäquivalente

### Cleanup
- Dismissed Entries: Können nach 7 Tagen gelöscht werden (optional, low priority)
- Alte Topics ohne Content: Entfernen bei Consolidation

---

## Validierung — Gesamtsystem

Nach Abschluss aller 5 Playbooks:

- [ ] `pnpm build` kompiliert ohne Fehler
- [ ] Neue App-Installation: Settings haben memorySettings Defaults
- [ ] Bestehende App: Settings werden korrekt migriert
- [ ] Chat → 5 Turns → Suggestion Popup
- [ ] Accept → Pending Entry in DB
- [ ] Memory Page: Topics + Pending sichtbar
- [ ] Consolidate → Topics werden aufgebaut
- [ ] Nächster Chat: Memory im System Prompt (DevTools Network Tab prüfen)
- [ ] NSFW Toggle → filtert korrekt
- [ ] Worker Model wechseln → Detection nutzt neues Model
- [ ] Persona löschen → alle Memory-Daten weg
- [ ] Persona mit memoryEnabled: false → keine Detection, kein Memory in Prompt
- [ ] Auto-Consolidation bei Threshold
- [ ] Error Handling: Detection-Fehler crashen Chat nicht
