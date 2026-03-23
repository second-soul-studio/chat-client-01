# UI Feedback — Group 2: Home & Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the persona cards (hamburger menu, click-to-chat), add drag-and-drop reordering, remove the persona limit, add a persona-filtered history view, and unify the persona edit form into one scrollable sheet.

**Architecture:** Changes are split across the Zustand store (new `reorderPersonas` action + IndexedDB persistence), three components (`PersonaCard`, `PersonasPage`, `HistoryPage`), and the edit modal (`PersonaFormModal`). The `@dnd-kit` library handles sortable drag interactions.

**Tech Stack:** React 19, TypeScript, Vite, Zustand, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (new), `react-router` v7

**Note on testing:** This project has no automated test suite. Each task ends with a TypeScript check (`cd frontend && pnpm build`) and a manual browser verification step.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/stores/appStore.ts` | Add `reorderPersonas` action, persist order to IndexedDB |
| Modify | `frontend/src/services/db.ts` | Add order field to persona storage (or store order as separate key) |
| Modify | `frontend/src/components/PersonaCard.tsx` | Card click → chat, hamburger button, remove Customise, Nostalgia nav, dnd-kit sortable |
| Modify | `frontend/src/components/PersonasPage.tsx` | DndContext + SortableContext, remove MAX_PERSONAS, keep 4-slot visual padding |
| Modify | `frontend/src/components/HistoryPage.tsx` | Persona filter via `useSearchParams` |
| Modify | `frontend/src/components/PersonaFormModal.tsx` | Unified scrollable form with four labelled sections |

---

### Task 1: Install @dnd-kit packages

**Files:**
- Modify: `frontend/package.json` (via pnpm)

- [ ] **Step 1: Install**

```bash
cd frontend && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "Add @dnd-kit packages for persona drag-and-drop"
```

---

### Task 2: Add reorderPersonas to the Zustand store

**Files:**
- Modify: `frontend/src/stores/appStore.ts`
- Modify: `frontend/src/services/db.ts`

The persona order needs to survive page refreshes. The simplest approach: add a numeric `order` field to the `Persona` type and persist it. On reorder, update all affected personas' `order` values and save them.

- [ ] **Step 1: Check the Persona type** in `frontend/src/types/index.ts`

Look for the `Persona` interface. If there is no `order` field, add one: `order?: number`. Optional so existing personas without the field still load.

- [ ] **Step 2: Add `reorderPersonas` to `AppState` interface**

```typescript
reorderPersonas: (ids: string[]) => Promise<void>;
```

- [ ] **Step 3: Implement `reorderPersonas`**

The action receives an array of persona IDs in the new order. It updates each persona's `order` field and persists to IndexedDB via `savePersona`:

```typescript
async reorderPersonas(ids) {
    const { personas } = get();
    const updated = ids.map((id, index) => {
        const p = personas.find(x => x.id === id);
        if (!p) return null;
        return { ...p, order: index };
    }).filter(Boolean) as Persona[];
    await Promise.all(updated.map(p => savePersona(p)));
    set({ personas: updated });
},
```

- [ ] **Step 4: Sort personas by `order` on `init`**

In the `init` action, after loading personas from IndexedDB, sort them:

```typescript
const sorted = personas.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
set({ settings, personas: sorted, providers, modelConfigs, initialised: true });
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/appStore.ts frontend/src/types/index.ts
git commit -m "Add reorderPersonas action with IndexedDB persistence via order field"
```

---

### Task 3: Card interaction redesign — hamburger button, click-to-chat

**Files:**
- Modify: `frontend/src/components/PersonaCard.tsx`

- [ ] **Step 1: Update `handleCardClick`** to navigate instead of opening the menu

Change `handleCardClick` to call `navigate`:

```typescript
const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-menu]')) return;
    navigate(`/chat/${persona.id}`);
};
```

- [ ] **Step 2: Replace the TALK button with a hamburger button**

Find the TALK button `div` (around line 357). Replace the content and interaction:

```tsx
<div
    data-menu="true"
    onClick={e => { e.stopPropagation(); setMenuOpen(prev => !prev); }}
    style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: `translateX(-50%) scale(${talkPressed ? 0.95 : 1})`,
        transition: 'transform 0.1s ease, background 0.2s ease',
        background: menuOpen ? persona.color : `${persona.color}22`,
        border: `1px solid ${persona.color}66`,
        borderRadius: 20,
        padding: '8px 28px',
        cursor: 'pointer',
        minWidth: 44,
        minHeight: 44,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backdropFilter: 'blur(10px)',
    }}
>
    {[0, 1, 2].map(i => (
        <div key={i} style={{
            width: 18,
            height: 1.5,
            background: menuOpen ? '#000000cc' : persona.color,
            borderRadius: 2,
            transition: 'background 0.2s ease',
        }} />
    ))}
</div>
```

- [ ] **Step 3: Remove `talkPressed` state and `handleTalk` function**

These are no longer needed. Delete:
- `const [talkPressed, setTalkPressed] = useState(false);`
- The `handleTalk` function

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 5: Manual verification**

- [ ] Clicking card body navigates to chat
- [ ] Hamburger button opens context menu
- [ ] Hamburger button fills with persona colour when menu is open

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PersonaCard.tsx
git commit -m "Replace TALK button with hamburger, card click now navigates to chat"
```

---

### Task 4: Update context menu — remove Customise, fix Nostalgia navigation

**Files:**
- Modify: `frontend/src/components/PersonaCard.tsx`

- [ ] **Step 1: Update `MENU_ITEMS`**

Remove the "Customise" entry (index 0). The new array should be:

```typescript
const MENU_ITEMS = [
    { icon: '◎', label: 'Nostalgia', sub: 'memory & history' },
    { icon: '⟡', label: 'Persona', sub: 'edit character' },
    { icon: '⊹', label: 'Archive', sub: 'saved moments' },
] as const;
```

- [ ] **Step 2: Update the `ContextMenu` click handlers**

The `MENU_ITEMS` indices have shifted. Update the handler:
- Index 0 (Nostalgia): call `onNostalgia()` and close the menu
- Index 1 (Persona): call `onEdit()`
- Index 2 (Archive): the two-step confirm + archive (previously index 3, now 2)

Add an `onNostalgia: () => void` prop to the `ContextMenu` component interface. In `PersonaCard`, pass it as:
```typescript
onNostalgia={() => { navigate(`/history?persona=${persona.id}`); setMenuOpen(false); }}
```

This keeps `navigate` in `PersonaCard` where `useNavigate()` is already called, and avoids calling `useNavigate` inside `ContextMenu`.

- [ ] **Step 3: Update the archive index guard**

The archive check in `ContextMenu` currently uses `i === 3`. Change to `i === 2`.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PersonaCard.tsx
git commit -m "Remove Customise menu item, wire Nostalgia to filtered history"
```

---

### Task 5: Add dnd-kit sortable to PersonaCard

**Files:**
- Modify: `frontend/src/components/PersonaCard.tsx`

`useSortable` from `@dnd-kit/sortable` provides: `attributes`, `listeners`, `setNodeRef`, `transform`, `transition`, `isDragging`. The card uses these to become draggable.

- [ ] **Step 1: Import dnd-kit hooks**

```typescript
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

- [ ] **Step 2: Add `id` prop to `PersonaCardProps`** (dnd-kit requires a stable id)

```typescript
interface PersonaCardProps {
    persona: Persona;
    index: number;
    id: string;  // same as persona.id, passed explicitly for dnd-kit
    onEdit?: (persona: Persona) => void;
    onArchive?: (persona: Persona) => void;
}
```

- [ ] **Step 3: Call `useSortable` inside `PersonaCard`**

```typescript
const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
```

- [ ] **Step 4: Apply sortable props to the card's root `div`**

```typescript
ref={setNodeRef}
style={{
    // ...existing style...
    // Replace or add transform:
    transform: isDragging
        ? CSS.Transform.toString(transform)
        : hovered ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
    transition: isDragging ? transition ?? undefined : 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 10 : undefined,
}}
```

- [ ] **Step 5: Add a drag handle** — a subtle grip icon in the top-left corner, visible on hover

```tsx
<div
    {...attributes}
    {...listeners}
    style={{
        position: 'absolute',
        top: 10,
        left: 10,
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: hovered ? 0.4 : 0,
        transition: 'opacity 0.2s',
        cursor: 'grab',
        color: persona.color,
        fontSize: 14,
        userSelect: 'none',
        touchAction: 'none',
    }}
    onClick={e => e.stopPropagation()}
>
    ⠿
</div>
```

The `touchAction: 'none'` is required by dnd-kit for pointer events to work correctly on touch devices.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/PersonaCard.tsx
git commit -m "Add dnd-kit sortable wrapper and drag handle to PersonaCard"
```

---

### Task 6: Wire up DndContext and SortableContext in PersonasPage

**Files:**
- Modify: `frontend/src/components/PersonasPage.tsx`

- [ ] **Step 1: Import dnd-kit and store action**

```typescript
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useAppStore } from '@/stores/appStore';
```

- [ ] **Step 2: Destructure `reorderPersonas` from store**

```typescript
const { personas, removePersona, reorderPersonas } = useAppStore();
```

- [ ] **Step 3: Remove `MAX_PERSONAS` constant** and update empty-slot logic

Replace:
```typescript
const MAX_PERSONAS = 4;
// ...
const emptySlots = Math.max(0, MAX_PERSONAS - personas.length);
```

With:
```typescript
const emptySlots = Math.max(0, 4 - personas.length);
```

(Hardcoded `4` is purely cosmetic — fills empty slots on first use, no cap on persona count.)

- [ ] **Step 4: Add `handleDragEnd`**

```typescript
const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = personas.findIndex(p => p.id === active.id);
    const newIndex = personas.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...personas];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    await reorderPersonas(reordered.map(p => p.id));
};
```

- [ ] **Step 5: Wrap persona cards with `DndContext` and `SortableContext`**

```tsx
<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={personas.map(p => p.id)} strategy={rectSortingStrategy}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
            {personas.map((persona, i) => (
                <PersonaCard
                    key={persona.id}
                    id={persona.id}
                    persona={persona}
                    index={i}
                    onEdit={openEdit}
                    onArchive={handleArchive}
                />
            ))}
            {Array.from({ length: emptySlots }, (_, i) => (
                <AddPersonaCard key={`empty-${i}`} index={personas.length + i} onClick={openCreate} />
            ))}
            {/* "+" card always at end when no more empty slots */}
            {personas.length >= 4 && (
                <AddPersonaCard index={personas.length} onClick={openCreate} />
            )}
        </div>
    </SortableContext>
</DndContext>
```

Note: `AddPersonaCard` is rendered outside `SortableContext` (the array after persona cards, but outside the sortable items list) so it is not draggable.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 7: Manual verification**

- [ ] Persona cards are draggable (grip icon visible on hover)
- [ ] Drag reorders cards
- [ ] Order persists after page reload
- [ ] More than 4 personas can be created
- [ ] "+" card always appears after all persona cards

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/PersonasPage.tsx
git commit -m "Add DndContext, remove persona limit, wire reorderPersonas"
```

---

### Task 7: HistoryPage — persona filter via query param

**Files:**
- Modify: `frontend/src/components/HistoryPage.tsx`

- [ ] **Step 1: Add `useSearchParams` import**

```typescript
import { useNavigate, useSearchParams } from 'react-router';
```

- [ ] **Step 2: Read the `persona` query param**

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const filterPersonaId = searchParams.get('persona');
const filteredPersonas = filterPersonaId
    ? personas.filter(p => p.id === filterPersonaId)
    : personas;
```

- [ ] **Step 3: Replace `personas.map` with `filteredPersonas.map`** in the render

- [ ] **Step 4: Add filter indicator badge** when `filterPersonaId` is set

Above the persona list, render a pill showing which persona is filtered, with an × to clear:

```tsx
{filterPersonaId && (() => {
    const fp = personas.find(p => p.id === filterPersonaId);
    if (!fp) return null;
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '4px 10px 4px 8px', borderRadius: 20, background: `${fp.color}18`, border: `1px solid ${fp.color}33` }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: fp.gradient, border: `1px solid ${fp.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: fp.color }}>
                {fp.name[0]}
            </div>
            <span style={{ fontSize: 11, color: fp.color, fontFamily: "'Courier New', monospace", letterSpacing: '0.08em' }}>
                {fp.name}
            </span>
            <button
                onClick={() => setSearchParams({})}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
                aria-label="Clear filter"
            >
                ×
            </button>
        </div>
    );
})()}
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 6: Manual verification**

- [ ] Navigate to `/history?persona=<some-id>` — only that persona's chats are shown
- [ ] Filter pill shows persona name with × button
- [ ] Clicking × shows all conversations again
- [ ] Nostalgia menu item on persona card navigates to filtered view

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/HistoryPage.tsx
git commit -m "Add persona filter to HistoryPage via query param"
```

---

### Task 8: PersonaFormModal — unified scrollable form

**Files:**
- Modify: `frontend/src/components/PersonaFormModal.tsx`

The existing modal is already a bottom-sheet with `overflowY: 'auto'`. The fields are already present but flat. This task adds visual section dividers to group them into four sections: Identity, Character, Appearance, and Model.

- [ ] **Step 1: Add a `SectionHeader` helper component** at the bottom of the file

```typescript
function SectionHeader({ label }: { label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' }}>
                {label}
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>
    );
}
```

- [ ] **Step 2: Reorder fields and insert `SectionHeader` elements**

The current field order in JSX is: Name → Tagline → Soul Colour → Personality Prompt → Model Picker → Show Thinking toggle → Enable Thinking toggle.

**Both reorder the fields AND insert headers.** The target order:

```
<SectionHeader label="Identity" />
<Field label="Name">...</Field>
<Field label="Tagline">...</Field>

<SectionHeader label="Character" />
<Field label="Personality Prompt">...</Field>
[Show Thinking toggle]
[Enable Thinking by Default toggle]

<SectionHeader label="Appearance" />
<Field label="Soul Colour">...</Field>      ← moved from before Personality Prompt

<SectionHeader label="Model" />
<ModelPicker ... />
```

Soul Colour moves from its current position (3rd) to after the Character section. Model Picker stays last. Save buttons remain at the very bottom after all sections.

- [ ] **Step 3: Remove the top-level modal header's sub-label** ("customise your companion" / "bring someone new to life")

The section headers now provide structure, so the sub-label is redundant. Keep only the main title ("Edit Persona" / "New Persona").

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 5: Manual verification**

Open a persona edit modal:
- [ ] Four section headers visible (Identity, Character, Appearance, Model)
- [ ] All fields are present and functional
- [ ] Form scrolls smoothly through all sections
- [ ] Save/Cancel buttons work as before

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PersonaFormModal.tsx
git commit -m "Add section headers to PersonaFormModal for unified scrollable form"
```
