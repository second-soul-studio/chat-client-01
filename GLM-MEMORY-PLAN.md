# Memory System Implementation Plan

**Project:** Second Soul Chat Client  
**Feature:** Per-Persona Memory System  
**Focus:** User Experience & Persistent Context

---

## Overview

Ein append-only Memory System, das es Personas ermöglicht, Informationen über den User über mehrere Konversationen hinweg zu speichern. Dadurch entsteht eine persönliche, kontextreiche Erfahrung.

**Kernprinzipien:**
- User Experience steht im Mittelpunkt
- Memories sind Persona-spezifisch
- User hat volle Kontrolle (einsehen, editieren, löschen)
- Efficient & Lazy — Detection wird nicht bei jedem Turn ausgeführt

---

## Memory Types

Jeder Memory Entry hat einen Type, der in der UI mit Emoji dargestellt wird:

| Type | Emoji | Beschreibung |
|------|-------|--------------|
| `emotional` | 💫 | Emotionale Momente, Gefühle, Reaktionen |
| `hard_fact` | 📌 | Konkrete Fakten (Name, Alter, Wohnort, Job) |
| `preference` | ⚙️ | Vorlieben, Abneigungen, Preferences |
| `event` | 📅 | Lebensereignisse, Erfahrungen |
| `nsfw` | 🔥 | Adult/intimate Content (ERP) |

**Max Entry Length:** 250 Characters (kürzer als ein Tweet)

---

## Data Models

### `MemoryEntry`

```typescript
interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;          // max 250 chars
  timestamp: number;
  source: 'detected' | 'manual';
}
```

### `Memory`

```typescript
interface Memory {
  id: string;
  personaId: string;
  entries: MemoryEntry[];
  consolidated: string | null;          // Consolidated summary
  consolidatedAt: number | null;        // Timestamp of last consolidation
  consolidatedEntryCount: number;       // How many entries were consolidated
  nsfwEnabled: boolean;                 // Whether to inject nsfw memories into prompt
}
```

### Persona Extension

```typescript
interface Persona {
  // ... existing fields
  memoryEnabled?: boolean;               // default: true
}
```

### AppSettings Extension

```typescript
interface AppSettings {
  // ... existing fields
  memorySettings: {
    detectionModelId: string | null;    // Model for detection (null = use chat model)
    autoConsolidate: boolean;            // Enable auto-consolidation
    consolidationThreshold: number;       // 5-25 entries before auto-consolidate
  };
}
```

**Default Values:**
- `detectionModelId: null` (use same model as conversation)
- `autoConsolidate: true`
- `consolidationThreshold: 10`

---

## Detection Logic

### When is Memory Detection Triggered?

Memory Detection analyzes the last 3-5 turns of conversation for memory-worthy information.

**Automatic Triggers:**
1. **Every 2nd Turn** — Turn 2, 4, 6, 8, etc. (not every turn to save API costs)
2. **Session End** — When user navigates away from chat
3. **Existing conversation load** — Not triggered (preserves turn count)

**Manual Trigger:**
- User can manually trigger via Memory Page
- **Debounce:** 1 turn must pass before manual trigger is allowed again
- If automatic detection just ran, manual is blocked until a turn happens

### Turn Counter

Tracked in-memory (not persisted):

```typescript
// In appStore or separate state
turnCount: Map<personaId, lastCheckedTurn>
lastDetectionTurn: Map<personaId, turnNumber>
```

### Detection Prompt

```
Analyze the last few messages of a conversation for memory-worthy information about the user.

Memory types:
- emotional: 💫 Emotional moments, feelings, reactions
- hard_fact: 📌 Concrete facts (name, age, location, job)
- preference: ⚙️ Likes, dislikes, preferences
- event: 📅 Life events, experiences
- nsfw: 🔥 Adult/intimate content (ERP)

Rules:
- Only extract NEW information not likely already known
- Keep each entry under 250 characters
- Be conservative — only truly memorable things
- Output empty array if nothing memorable

Output JSON array:
[{"type": "emotional", "content": "..."}, ...]

Conversation:
{conversation}

Output:
```

### Detection Result Handling

1. If result is empty array → No UI shown
2. If result has entries → Show `MemorySuggestion` popup
3. User can: Accept, Edit then Accept, or Dismiss
4. On Accept → Append to `memory.entries[]`
5. If type is `emotional` or `nsfw` → Trigger floating hearts animation

---

## UI Components

### 1. Memory Suggestion Popup (`components/MemorySuggestion.tsx`)

Appears above chat input after detection:

```
┌─────────────────────────────────────────┐
│ 💾 Memory Suggested                    │
│ ────────────────────────────────────    │
│ 💫 User loves their cat Mittens        │
│                                         │
│ [✏️ Edit]  [✓ Save]  [✗ Dismiss]       │
└─────────────────────────────────────────┘
```

**Behavior:**
- Slides up from bottom
- Shows type emoji + content
- Edit opens inline textarea
- Save appends to memory
- Dismiss closes without saving

### 2. Floating Hearts Animation

- Triggered when saving `emotional` or `nsfw` memory
- Uses existing `heartFloat` keyframe from `index.css`
- Spawns 3-5 hearts floating up from detected message
- Heart color = Persona's accent color

### 3. Memory Page (`components/MemoryPage.tsx`)

Route: `/memory/:personaId`

```
┌─────────────────────────────────────────────────┐
│ [← Back]          Memories for Luna            │
│ ───────────────────────────────────────────────│
│ 🔥 NSFW Memories: [Toggle]                     │
│ ───────────────────────────────────────────────│
│ [💾 Consolidate Now]    [+ Add Memory]          │
│ ───────────────────────────────────────────────│
│                                                 │
│ ## Consolidated Summary                         │
│ (editable textarea if exists)                   │
│ [Save Summary]                                  │
│                                                 │
│ ───────────────────────────────────────────────│
│                                                 │
│ ## Memory Entries                        [Count]│
│                                                 │
│ 💫 User loves their cat Mittens         [✗]    │
│ 📌 User is 47 years old                  [✗]    │
│ ⚙️ Prefers dark mode                     [✗]    │
│ 📅 Got married in 2020                   [✗]    │
│ 🔥 [content hidden if nsfw disabled]    [✗]    │
│                                                 │
│ [Load More...]                                  │
└─────────────────────────────────────────────────┘
```

**Features:**
- Toggle for `nsfwEnabled` (hides nsfw entries from view when off)
- Manual consolidation button
- Manual memory addition
- Editable consolidated summary
- Entry list with individual delete buttons
- If `nsfwEnabled: false` → NSFW entries hidden, not deleted

### 4. Persona Card Menu Update

Current `Nostalgia` menu item routes to history. New routing:

- `◎ Nostalgia` → `/memory/:personaId` (Memory Page)
- Keep history accessible from Memory Page header ("View History" link)

---

## Prompt Integration

### System Prompt Structure

In `services/api.ts`, the system prompt is currently:

```typescript
const systemPrompt = [
    settings.globalSystemPrompt,
    persona.systemPrompt,
    model.userSystemPrompt,
].filter(Boolean).join('\n\n');
```

**New structure:**

```typescript
const memory = await getMemory(persona.id);
const memorySection = formatMemoryForPrompt(memory, settings.memorySettings.consolidationThreshold);

const systemPrompt = [
    settings.globalSystemPrompt,
    persona.systemPrompt,
    memorySection,
    model.userSystemPrompt,
].filter(Boolean).join('\n\n');
```

### Memory Formatting

```typescript
function formatMemoryForPrompt(memory: Memory | null, threshold: number): string {
  if (!memory || memory.entries.length === 0) return '';
  
  // Filter out nsfw if disabled
  const filtered = memory.nsfwEnabled 
    ? memory.entries 
    : memory.entries.filter(e => e.type !== 'nsfw');
  
  if (filtered.length === 0) return '';
  
  let section = '## Your Memories of This User\n\n';
  
  // Add consolidated summary if exists
  if (memory.consolidated) {
    section += memory.consolidated + '\n\n';
  }
  
  // Add recent unconsolidated entries
  const recentStart = Math.max(0, memory.consolidatedEntryCount);
  const recent = filtered.slice(recentStart);
  
  if (recent.length > 0) {
    section += 'Recent observations:\n';
    section += recent.map(e => `• ${e.content}`).join('\n');
  }
  
  return section;
}
```

**Example Output:**

```
## Your Memories of This User

Luna's user is named Chris, a 47-year-old developer from Vienna who loves cats. 
They have a cat named Mittens whom they adore. Chris prefers dark mode and 
works as a software engineer. They mentioned getting married in 2020.

Recent observations:
• User expressed excitement about the new AI feature
• User prefers concise responses over lengthy explanations
```

---

## Consolidation

### What is Consolidation?

Consolidation takes all memory entries (or entries since last consolidation) and produces a concise summary paragraph. This:
- Removes redundancy
- Preserves important details
- Keeps memories contextual
- Reduces token usage in prompts

### Consolidation Prompt

```
You are summarizing memories about a user for an AI persona.

Given these memory entries, produce a concise paragraph that:
- Preserves important facts and emotional context
- Removes redundancy and repeated information
- Keeps a neutral, observational tone
- Does NOT invent new information
- Stays under 500 words

Memory entries:
{entries}

Consolidated summary:
```

### When to Consolidate?

**Manual (Primary):**
- User clicks "Consolidate Now" on Memory Page
- Shows progress indicator during consolidation
- Updates consolidated summary on completion

**Automatic (Optional):**
- Configurable via `autoConsolidate` setting
- Triggered when `entries.length - consolidatedEntryCount >= consolidationThreshold`
- Default threshold: 10 entries
- Range: 5-25 entries
- Runs in background, user sees subtle "Consolidating..." indicator

### Consolidation Behavior

```typescript
async function consolidateMemory(memory: Memory, provider: Provider, model: ModelConfig): Promise<string> {
  // Get entries to consolidate
  const toConsolidate = memory.entries.slice(memory.consolidatedEntryCount);
  
  if (toConsolidate.length === 0) return memory.consolidated || '';
  
  // Build prompt with entries
  const prompt = CONSOLIDATION_PROMPT.replace('{entries}', 
    toConsolidate.map(e => `[${e.type}] ${e.content}`).join('\n')
  );
  
  // Call LLM
  const result = await callLLM(prompt, provider, model);
  
  // Update memory
  memory.consolidated = result;
  memory.consolidatedAt = Date.now();
  memory.consolidatedEntryCount = memory.entries.length;
  
  return result;
}
```

---

## Settings & Configuration

### Memory Settings Location

In Settings Page, under new "Memory" tab or Global Settings section:

```
┌─────────────────────────────────────────────┐
│ Memory Settings                              │
│ ───────────────────────────────────────────│
│ Detection Model: [Dropdown: Select Model]   │
│                                              │
│ Auto-Consolidate: [Toggle]                   │
│ Consolidation Threshold: [Slider: 5-25]     │
│                                              │
│ [Consolidate All Memories Now]               │
└─────────────────────────────────────────────┘
```

**Detection Model Dropdown:**
- Lists all available models from all providers
- "Use Chat Model (default)" option at top
- Uses selected model for memory detection calls

**Consolidation Threshold Slider:**
- Range: 5 to 25
- Default: 10
- Shows current value: "Consolidate after 10 new memories"

---

## Session End Detection

### Implementation

In `ChatPage.tsx`:

```typescript
useEffect(() => {
  return () => {
    // Cleanup: trigger detection on unmount
    const currentTurnCount = getTurnCount(personaId);
    const lastDetection = getLastDetectionTurn(personaId);
    
    // Only run if at least 1 turn since last detection
    if (currentTurnCount > lastDetection) {
      maybeDetectMemory(personaId, currentTurn, messages, true);
    }
  };
}, [personaId]);
```

### Debouncing Rules

1. **Automatic Detection (Turn-based):**
   - Only on turn 2, 4, 6, 8...
   - Tracks last detection turn number
   - Won't run if already ran this turn

2. **Manual Detection:**
   - Blocked for 1 turn after any detection (auto or manual)
   - User sees "Already checked this turn" message if blocked

3. **Session End:**
   - Always runs if there's been at least 1 new turn
   - Doesn't count as "detection" for debounce purposes
   - But still won't run if automatic just finished

---

## IndexedDB Schema

### New ObjectStore: `memories`

```typescript
const db = await openDB('second-soul', 4, (upgradeDB) => {
  // ... existing stores
  
  if (!upgradeDB.objectStoreNames.contains('memories')) {
    const memoriesStore = upgradeDB.createObjectStore('memories', { keyPath: 'id' });
    memoriesStore.createIndex('by-persona', 'personaId');
  }
});
```

### Database Functions (`services/db.ts`)

```typescript
export async function getMemory(personaId: string): Promise<Memory | undefined>;
export async function saveMemory(memory: Memory): Promise<void>;
export async function deleteMemory(id: string): Promise<void>;
export async function getAllMemories(): Promise<Memory[]>;
```

---

## Zustand Store Additions

```typescript
interface AppState {
  // ... existing state
  
  // Memory State
  memories: Memory[];
  getMemory: (personaId: string) => Memory | undefined;
  
  // Memory Actions
  addMemoryEntry: (personaId: string, entry: Omit<MemoryEntry, 'id' | 'timestamp'>) => Promise<void>;
  updateMemory: (memory: Memory) => Promise<void>;
  deleteMemoryEntry: (personaId: string, entryId: string) => Promise<void>;
  consolidateMemory: (personaId: string) => Promise<void>;
  
  // Detection State (in-memory only, not persisted)
  turnCount: Map<string, number>;
  lastDetectionTurn: Map<string, number>;
  incrementTurnCount: (personaId: string) => void;
  shouldRunDetection: (personaId: string) => boolean;
  runDetection: (personaId: string, messages: Message[]) => Promise<MemoryCandidate[]>;
}
```

---

## File Changes

| File | Changes |
|------|---------|
| `types/index.ts` | Add `MemoryType`, `MemoryEntry`, `Memory`, extend `Persona`, extend `AppSettings` |
| `types/providers.ts` | No changes |
| `services/db.ts` | Add `memories` ObjectStore, get/save/delete functions |
| `services/memory.ts` | **NEW** — Detection, consolidation, formatting logic |
| `services/api.ts` | Inject memory section into system prompt |
| `stores/appStore.ts` | Add memories state, turn tracking, detection actions |
| `components/MemoryPage.tsx` | **NEW** — Memory viewing/editing UI |
| `components/MemorySuggestion.tsx` | **NEW** — Post-detection popup |
| `components/FloatingHearts.tsx` | **NEW** — Animation component |
| `components/ChatPage.tsx` | Turn counter, session end hook, detection trigger |
| `components/PersonaCard.tsx` | Update Nostalgia menu routing |
| `components/SettingsPage.tsx` | Add Memory Settings tab |
| `App.tsx` | Add `/memory/:personaId` route |
| `index.css` | No changes (heartFloat already exists) |

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Add types to `types/index.ts`
- [ ] Extend `AppSettings` with `memorySettings`
- [ ] Add `memories` ObjectStore in `services/db.ts`
- [ ] Add memory functions to db.ts
- [ ] Add memories state to `stores/appStore.ts`

### Phase 2: Memory Service
- [ ] Create `services/memory.ts`
- [ ] Implement `detectMemoryWorthy()` function
- [ ] Implement `formatMemoryForPrompt()` function
- [ ] Implement `consolidateMemory()` function
- [ ] Add turn counter tracking

### Phase 3: Detection Integration
- [ ] Add turn counter to `ChatPage.tsx`
- [ ] Implement session end detection
- [ ] Integrate detection API call
- [ ] Handle detection results

### Phase 4: UI Components
- [ ] Create `MemorySuggestion.tsx` popup
- [ ] Create `FloatingHearts.tsx` animation
- [ ] Create `MemoryPage.tsx` with full CRUD
- [ ] Add route to `App.tsx`
- [ ] Update PersonaCard menu routing

### Phase 5: Prompt Integration
- [ ] Modify `api.ts` to inject memory section
- [ ] Test with various memory combinations
- [ ] Handle nsfw filtering

### Phase 6: Settings & Polish
- [ ] Add Memory Settings to Settings Page
- [ ] Add consolidation controls
- [ ] Add editing/deletion functionality
- [ ] Testing & refinement

---

## Edge Cases & Considerations

### Empty Memory
- If persona has no memory yet, create new Memory on first entry
- If all entries deleted, keep empty Memory object (preserve nsfwEnabled setting)

### NSFW Toggle
- Toggling `nsfwEnabled` doesn't delete entries
- Only affects visibility in UI and prompt injection
- NSFW entries remain in database regardless

### Consolidation Token Limits
- If consolidated summary gets too long, prompt may exceed limits
- Consider: Only consolidate last N entries + existing summary
- Or: Split summary into sections (facts, preferences, events)

### Detection Model Unavailable
- If selected detection model is unavailable, fall back to chat model
- Show warning toast: "Using chat model for detection"

### Multiple Personas
- Each persona has independent memory
- Same user can have different memories with different personas
- Memories are NOT shared between personas

### Import/Export
- Memory should be included in future export/import functionality
- JSON format for portability

---

## Future Enhancements (Out of Scope)

- [ ] Memory search/filter functionality
- [ ] Memory categories/tags (beyond type)
- [ ] Memory importance scoring
- [ ] Auto-forget old/irrelevant memories
- [ ] Memory sharing between personas (optional)
- [ ] Memory timeline view
- [ ] Memory-based conversation summaries
- [ ] Export memory as markdown

---

## Cost Estimates

### Detection Calls
- Called every 2nd turn (not every turn)
- Uses small/cheap model by default
- Prompt ~500 tokens + conversation history (3-5 turns ~1000 tokens)
- Output ~100 tokens
- **~1600 tokens per detection call**

### Consolidation Calls
- Called manually or every N entries (default 10)
- Prompt ~500 tokens + entries (10 × 50 avg = 500) = ~1000 tokens
- Output ~200 tokens
- **~1200 tokens per consolidation call**

### Memory Injection
- Every conversation includes memory section in system prompt
- Consolidated: ~200-500 tokens
- Recent entries: 5-10 × 50 = 250-500 tokens
- **~450-1000 tokens added to every prompt**

---

## Questions Resolved

| Question | Decision |
|----------|-----------|
| Detection trigger | Turn 2, 4, 6... + session end |
| Detection model | Global setting (default: use chat model) |
| Memory entry scope | Persona-specific, not shared |
| Max entry length | 250 characters |
| NSFW handling | Per-persona toggle, filter from prompt if disabled |
| Consolidation | Manual + optional auto (configurable threshold 5-25, default 10) |
| Memory Page route | `/memory/:personaId` |
| Memory types | emotional 💫, hard_fact 📌, preference ⚙️, event 📅, nsfw 🔥 |
| Settings location | Global Settings (detection model, auto-consolidate, threshold) |
| Debounce | 1 turn after any detection (auto or manual) |

---

## Summary

This Memory System enables Personas to build lasting, personalized relationships with users through persistent context storage. The implementation balances:

- **User Control:** Full visibility and editability of memories
- **Efficiency:** Lazy detection, configurable settings
- **Flexibility:** Multiple memory types, optional auto-consolidation
- **Performance:** Token-conscious prompt construction

The system integrates seamlessly with the existing architecture, adding value without disrupting current functionality.