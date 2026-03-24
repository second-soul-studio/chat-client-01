# Playbook 2 — Memory Service: Detection, Consolidation, Prompt Injection

> **Ziel:** `services/memory.ts` existiert mit Detection + Consolidation + Prompt Formatting.
> Memory wird in den System Prompt injiziert. Noch keine UI — alles programmatisch testbar.
> **Voraussetzung:** Playbook 1 abgeschlossen.

---

## 2.1 Neues Service File (`frontend/src/services/memory.ts`)

### Detection — `detectMemories()`

Nimmt die letzten N Messages, schickt sie an das Memory Worker Model, parst JSON zurück.

```typescript
import { v4 as uuid } from 'crypto'; // oder nanoid, je nachdem was im Projekt genutzt wird

// Prüfe wie IDs im Projekt generiert werden (crypto.randomUUID, nanoid, etc.)
// und nutze dasselbe Pattern.

export const DETECTION_PROMPT = `Extract noteworthy facts about the user from this conversation.

Categories: 💫 emotional, 📌 hard_fact, ⚙️ preference, 📅 event, 🔥 nsfw

Rules:
- Only genuinely new, useful information
- Be precise, no filler
- Skip anything trivial or already obvious
- Empty array if nothing worth remembering

Output ONLY a JSON array, no markdown fences:
[{"type": "hard_fact", "content": "..."}, ...]`;

export async function detectMemories(
    messages: Message[],
    personaId: string,
    chatId: string,
    provider: Provider,
    model: ModelConfig,
): Promise<MemoryPendingEntry[]> {
    // 1. Build prompt with last messages
    // 2. Make non-streaming LLM call (reuse sendMessage or a simpler fetch)
    // 3. Parse JSON response
    // 4. Map to MemoryPendingEntry[] with status: 'suggested'
    // 5. Return entries (caller decides what to do with them)
}
```

**Wichtig:** Für den Detection-Call brauchen wir eine einfache, nicht-streamende LLM-Aufruf-Funktion. Entweder:
- Eine neue `callLLMSimple()` in api.ts die nur den Text zurückgibt (kein streaming, keine CoT)
- Oder die bestehende `sendMessage()` nutzen mit `onChunk` das alles sammelt

→ Empfehlung: Kleine Hilfsfunktion `callMemoryWorker()` in memory.ts die direkt fetcht (analog zu sendOpenAIMessage, aber simpler — kein streaming, nur JSON response body).

### Consolidation — `consolidateMemory()`

```typescript
export const CONSOLIDATION_PROMPT = `Rebuild this persona's memory about the user.

You receive the current memory index, topic files, and new observations.

Your job:
- Merge new observations into existing topics
- Deduplicate — don't repeat what's already captured
- Create new topics if a theme emerges that doesn't fit existing ones
- Drop or shorten information that has become irrelevant
- Each topic: 5–8 concise sentences max
- Do NOT invent anything not present in the source material
- If NSFW content exists, keep it in relevant topics naturally

Output format (strict — parsed client-side):

## INDEX
- slug: One-line summary
- slug: One-line summary

## TOPIC: slug
Content here...

## TOPIC: slug
Content here...`;

export async function consolidateMemory(
    personaId: string,
    provider: Provider,
    model: ModelConfig,
): Promise<void> {
    // 1. Load current meta, topics, accepted pending entries from DB
    // 2. Build prompt with all data
    // 3. Call memory worker model
    // 4. Parse response into index + topics
    // 5. Write new topics + index to DB
    // 6. Clear accepted pending entries
    // 7. Update meta (lastConsolidatedAt, pendingCount)
}
```

### Output Parser — `parseConsolidationOutput()`

```typescript
export function parseConsolidationOutput(raw: string): {
    index: string;
    topics: Array<{ slug: string; content: string }>;
} {
    // Parse the ## INDEX and ## TOPIC: sections
    // Return structured data
    // Throw if unparseable (caller keeps old data)
}
```

### Prompt Injection — `formatMemoryForPrompt()`

```typescript
export async function formatMemoryForPrompt(personaId: string): Promise<string> {
    const meta = await getMemoryMeta(personaId);
    if (!meta) return '';

    const topics = await getMemoryTopics(personaId);
    const pending = await getAcceptedPendingEntries(personaId);

    const filteredPending = meta.nsfwEnabled
        ? pending
        : pending.filter(e => e.type !== 'nsfw');

    if (topics.length === 0 && filteredPending.length === 0) return '';

    let section = '## Your Memories of This User\n\n';

    if (meta.indexContent) {
        section += meta.indexContent + '\n\n';
    }

    for (const topic of topics) {
        section += `### ${topic.slug}\n${topic.content}\n\n`;
    }

    if (filteredPending.length > 0) {
        section += 'Recent (not yet consolidated):\n';
        section += filteredPending.map(e => `• ${e.content}`).join('\n');
    }

    return section.trim();
}
```

---

## 2.2 LLM Helper für Memory Calls

In `services/memory.ts` (oder `services/api.ts`):

Eine einfache nicht-streamende Funktion die den Memory Worker aufruft. Muss beide Adapter unterstützen (OpenAI-compatible + Anthropic).

```typescript
async function callMemoryWorker(
    systemPrompt: string,
    userMessage: string,
    provider: Provider,
    model: ModelConfig,
): Promise<string> {
    // Simpler fetch ohne streaming
    // Returns raw text content
}
```

Nutzt `proxiedFetch` wenn im Projekt vorhanden, sonst direkt `fetch`.

---

## 2.3 System Prompt Integration (`frontend/src/services/api.ts`)

In `sendMessage()`, nach dem bestehenden System-Prompt-Build:

```typescript
// Bestehend:
const systemPrompt = [
    settings.globalSystemPrompt,
    persona.systemPrompt,
    model.userSystemPrompt,
].filter(Boolean).join('\n\n');

// Neu:
import { formatMemoryForPrompt } from './memory';

const memoryBlock = persona.memoryEnabled !== false
    ? await formatMemoryForPrompt(persona.id)
    : '';

const systemPrompt = [
    settings.globalSystemPrompt,
    persona.systemPrompt,
    memoryBlock,              // ← zwischen persona prompt und model prompt
    model.userSystemPrompt,
].filter(Boolean).join('\n\n');
```

**Achtung:** `sendMessage()` muss ggf. `async` werden oder war es schon. Prüfen.

---

## 2.4 Detection Helper

```typescript
export function shouldRunDetection(
    turnsSinceLastDetection: number,
    detectionInterval: number,
): boolean {
    return turnsSinceLastDetection >= detectionInterval;
}
```

---

## Validierung

Nach Abschluss:
- [ ] `pnpm build` kompiliert ohne Fehler
- [ ] `formatMemoryForPrompt()` gibt leeren String wenn keine Memories existieren
- [ ] `parseConsolidationOutput()` parst den erwarteten Output korrekt
- [ ] System Prompt enthält Memory-Block wenn Memories vorhanden (manuell prüfen via console.log)
- [ ] Detection und Consolidation Prompts sind sauber formuliert
