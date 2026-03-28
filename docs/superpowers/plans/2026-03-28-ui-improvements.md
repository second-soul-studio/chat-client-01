# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four targeted UI improvements: clickable chat avatar, unified per-persona page with 3 tabs, better bottom nav visibility, and renaming "Archive" to "Delete".

**Architecture:** All changes are frontend-only. The biggest change is creating `PersonaPage.tsx` (a restructured `MemoryPage` with an added inline Persona-edit tab), plus adding an `inline` prop to `PersonaFormModal` so it can render without the modal shell. Everything else is small CSS/label tweaks and navigation updates.

**Tech Stack:** React 19, TypeScript, React Router v7, Zustand, idb (IndexedDB), Tailwind CSS v4, Vite

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `frontend/src/components/PersonaCard.tsx` | Rename Archive→Delete; update Nostalgia nav to `/persona/:id` |
| Modify | `frontend/src/components/BottomNav.tsx` | Larger text, brighter inactive colour; update chat-history URL |
| Modify | `frontend/src/components/ChatPage.tsx` | Clickable avatar; update memory-badge URL |
| Modify | `frontend/src/components/PersonaFormModal.tsx` | Add `inline?: boolean` prop |
| Create | `frontend/src/components/PersonaPage.tsx` | Unified page: Persona / History / Memories tabs |
| Modify | `frontend/src/App.tsx` | Replace `/memory/:personaId` route with `/persona/:personaId` |
| Modify | `frontend/src/components/PersonasPage.tsx` | `onEdit` navigates to `/persona/:id?tab=persona` instead of opening modal |

---

## Task 1: Rename "Archive" → "Delete" and update Nostalgia nav

**Files:**
- Modify: `frontend/src/components/PersonaCard.tsx:10` (MENU_ITEMS)
- Modify: `frontend/src/components/PersonaCard.tsx:426` (onNostalgia navigate call)

- [ ] **Step 1: Update MENU_ITEMS**

In `PersonaCard.tsx`, replace line 10:
```ts
{ icon: '⊹', label: 'Archive', sub: 'saved moments' },
```
with:
```ts
{ icon: '✕', label: 'Delete', sub: 'remove persona' },
```

- [ ] **Step 2: Update Nostalgia navigation target**

In `PersonaCard.tsx`, find the `onNostalgia` call (line ~426):
```ts
onNostalgia={() => { navigate(`/memory/${persona.id}`); setMenuOpen(false); }}
```
Replace with:
```ts
onNostalgia={() => { navigate(`/persona/${persona.id}`); setMenuOpen(false); }}
```

- [ ] **Step 3: Verify in browser**

Open the home page, long-press or hover a persona card, open the menu. Confirm:
- Third item shows `✕  Delete  remove persona` in red
- Clicking "Nostalgia" navigates to `/persona/:id` (will 404 until Task 5 — that's fine)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PersonaCard.tsx
git commit -m "Rename Archive to Delete in persona context menu"
```

---

## Task 2: Improve BottomNav visibility

**Files:**
- Modify: `frontend/src/components/BottomNav.tsx`

- [ ] **Step 1: Increase font size**

In `BottomNav.tsx`, find:
```tsx
className="text-[9px] tracking-widest uppercase font-mono"
```
Replace with:
```tsx
className="text-[11px] tracking-widest uppercase font-mono"
```

- [ ] **Step 2: Increase inactive item opacity**

Find:
```tsx
style={{ opacity: isActive ? 1 : 0.35 }}
```
Replace with:
```tsx
style={{ opacity: isActive ? 1 : 0.6 }}
```

- [ ] **Step 3: Brighten inactive label colour**

Find:
```tsx
style={{ color: isActive ? '#C9A96E' : 'rgba(255,255,255,0.4)' }}
```
(This is the label colour span — second `style` block inside the button map)
Replace with:
```tsx
style={{ color: isActive ? '#C9A96E' : 'rgba(255,255,255,0.7)' }}
```

- [ ] **Step 4: Verify in browser**

Open any page. Confirm the inactive nav labels are clearly readable and noticeably larger.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BottomNav.tsx
git commit -m "Improve bottom nav visibility: larger text, brighter inactive colour"
```

---

## Task 3: Make chat header avatar clickable

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx` (~lines 507–528)

- [ ] **Step 1: Convert avatar div to button**

In `ChatPage.tsx`, find the avatar block (lines ~507–528):
```tsx
{/* Avatar */}
<div
    style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: persona.gradient,
        border: `1px solid ${persona.color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontFamily: "'Instrument Serif', Georgia, serif",
        color: persona.color,
        boxShadow: `0 0 10px ${persona.glow}`,
    }}
>
    {persona.avatarUrl ? (
        <img src={persona.avatarUrl} alt={persona.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
    ) : (
        persona.name[0]
    )}
</div>
```

Replace with:
```tsx
{/* Avatar — click to open persona page */}
<button
    onClick={() => navigate(`/persona/${personaId}`)}
    aria-label={`Open ${persona.name} settings`}
    style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: persona.gradient,
        border: `1px solid ${persona.color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontFamily: "'Instrument Serif', Georgia, serif",
        color: persona.color,
        boxShadow: `0 0 10px ${persona.glow}`,
        cursor: 'pointer',
        padding: 0,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}
    onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 18px ${persona.glow}`;
    }}
    onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 10px ${persona.glow}`;
    }}
>
    {persona.avatarUrl ? (
        <img src={persona.avatarUrl} alt={persona.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
    ) : (
        persona.name[0]
    )}
</button>
```

- [ ] **Step 2: Update memory-badge URL**

In `ChatPage.tsx`, find (line ~541):
```tsx
onClick={() => navigate(`/persona/${personaId}/memory`)}
```
Replace with:
```tsx
onClick={() => navigate(`/persona/${personaId}`)}
```

- [ ] **Step 3: Verify in browser**

Open a chat. Hover the avatar — it should scale up with a brighter glow. Click it — navigates to `/persona/:id` (will 404 until Task 5 — fine). Memory badge button also navigates to the same URL.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatPage.tsx
git commit -m "Make chat header avatar clickable, navigate to persona page"
```

---

## Task 4: Add `inline` prop to PersonaFormModal

**Files:**
- Modify: `frontend/src/components/PersonaFormModal.tsx`

This task makes the form renderable inline (without the backdrop + fixed bottom sheet) so it can be embedded in the PersonaPage "Persona" tab.

- [ ] **Step 1: Update the props interface**

In `PersonaFormModal.tsx`, find:
```ts
interface PersonaFormModalProps {
    /** Pass an existing persona to enter edit mode; null for create mode */
    persona?: Persona | null;
    onClose: () => void;
}
```
Replace with:
```ts
interface PersonaFormModalProps {
    /** Pass an existing persona to enter edit mode; null for create mode */
    persona?: Persona | null;
    onClose: () => void;
    /** When true, renders as a scrollable div without backdrop/fixed sheet */
    inline?: boolean;
}
```

- [ ] **Step 2: Destructure the new prop**

Find:
```ts
export default function PersonaFormModal({ persona, onClose }: PersonaFormModalProps) {
```
Replace with:
```ts
export default function PersonaFormModal({ persona, onClose, inline = false }: PersonaFormModalProps) {
```

- [ ] **Step 3: Wrap the return in a conditional**

Find the `return (` statement (line ~131). The current return renders:
```tsx
return (
    <>
        {/* Backdrop */}
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, ... }} />

        {/* Sheet */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '90dvh', ... }}>
            {/* Handle */}
            <div .../>
            <div style={{ padding: '8px 24px 24px' }}>
                ...form content...
            </div>
        </div>
    </>
);
```

Replace the entire return with:
```tsx
if (inline) {
    return (
        <div style={{ padding: '8px 0 24px', overflowY: 'auto' }}>
            {/* form content — identical to the inner div below */}
            <div style={{ padding: '0 0 24px' }}>
                {/* Header */}
                <div style={{ marginBottom: 8, textAlign: 'center' }}>
                    <h2
                        style={{
                            fontFamily: "'Instrument Serif', Georgia, serif",
                            fontSize: 22,
                            color: '#fff',
                            fontWeight: 400,
                            margin: 0,
                        }}
                    >
                        {persona ? 'Edit Persona' : 'New Persona'}
                    </h2>
                </div>
                {/* === paste all form fields here — same as inside the Sheet below === */}
            </div>
        </div>
    );
}

return (
    <>
        {/* Backdrop */}
        ...unchanged...
    </>
);
```

**Important — the correct implementation approach:** Rather than duplicating 600+ lines of JSX, extract the shared form body into a named helper inside the component function and call it from both branches:

Add this right before the `return` statement (after all state/handlers):

```tsx
const formBody = (
    <div>
        {/* Header */}
        <div style={{ marginBottom: 8, textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, color: '#fff', fontWeight: 400, margin: 0 }}>
                {persona ? 'Edit Persona' : 'New Persona'}
            </h2>
        </div>

        {/* ── cut everything from <SectionHeader label="Identity" /> down to and
            including the Save/Cancel button row from inside the Sheet div,
            and paste it here ── */}
    </div>
);
```

Then the two return paths become:

```tsx
if (inline) {
    return (
        <div style={{ padding: '8px 24px 24px', overflowY: 'auto' }}>
            {formBody}
        </div>
    );
}

return (
    <>
        {/* Backdrop */}
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 100, animation: 'slideUpFade 0.25s ease both' }} />
        {/* Sheet */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '90dvh', background: '#0f0d17', borderTop: `1px solid ${palette.color}30`, borderRadius: '20px 20px 0 0', zIndex: 101, overflowY: 'auto', animation: 'sheetSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>
            <div style={{ padding: '8px 24px 24px' }}>
                {formBody}
            </div>
        </div>
    </>
);
```

- [ ] **Step 4: Verify modal still works**

Open the home page, click "+ add persona". The modal should open and function identically to before.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PersonaFormModal.tsx
git commit -m "Add inline prop to PersonaFormModal for tab-embedded rendering"
```

---

## Task 5: Create PersonaPage and wire up all routing

**Files:**
- Create: `frontend/src/components/PersonaPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/BottomNav.tsx`
- Modify: `frontend/src/components/PersonasPage.tsx`

The `PersonaPage` is essentially the existing `MemoryPage` with:
1. The route param changed from nothing to being reached via `/persona/:personaId`
2. A third tab "Persona" added as the default (index) tab
3. The "Persona" tab renders `<PersonaFormModal persona={persona} inline onClose={() => {}} />`
4. The tab default changes from `'memories'` to `'persona'`

- [ ] **Step 1: Create PersonaPage.tsx**

Copy `frontend/src/components/MemoryPage.tsx` to `frontend/src/components/PersonaPage.tsx`.

Then apply these changes to `PersonaPage.tsx`:

**a) Change the active tab default:**
```ts
// Old (line ~31):
const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'memories';

// New:
const activeTab = (searchParams.get('tab') as 'persona' | 'history' | 'memories') || 'persona';
```

**b) Add PersonaFormModal import at the top:**
```ts
import PersonaFormModal from './PersonaFormModal';
```

**c) Find the tab bar in the JSX** (look for the two tab buttons rendering 'memories' and 'history') and replace it with three tabs:

```tsx
{/* Tab bar */}
<div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
    {(['persona', 'history', 'memories'] as const).map(tab => (
        <button
            key={tab}
            onClick={() => setSearchParams({ tab })}
            style={{
                flex: 1,
                padding: '12px 0',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? `2px solid ${color}` : '2px solid transparent',
                color: activeTab === tab ? color : 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontFamily: "'Courier New', monospace",
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}
        >
            {tab}
        </button>
    ))}
</div>
```

**d) Add the "Persona" tab panel** — insert before the existing `{activeTab === 'history' && ...}` block:

```tsx
{/* Persona tab */}
{activeTab === 'persona' && persona && (
    <div style={{ overflowY: 'auto', flex: 1 }}>
        <PersonaFormModal
            persona={persona}
            inline
            onClose={() => {}}
        />
    </div>
)}
```

**e) Rename the component:**
```ts
// Old:
export default function MemoryPage() {
// New:
export default function PersonaPage() {
```

- [ ] **Step 2: Update App.tsx**

Replace:
```tsx
import MemoryPage from '@/components/MemoryPage';
```
with:
```tsx
import PersonaPage from '@/components/PersonaPage';
```

Replace:
```tsx
<Route path="/memory/:personaId" element={<MemoryPage />} />
```
with:
```tsx
<Route path="/persona/:personaId" element={<PersonaPage />} />
```

- [ ] **Step 3: Update BottomNav history URL**

In `BottomNav.tsx`, find:
```ts
navigate(`/memory/${chatPersonaId}?tab=history`);
```
Replace with:
```ts
navigate(`/persona/${chatPersonaId}?tab=history`);
```

- [ ] **Step 4: Update PersonasPage to navigate instead of opening edit modal**

In `PersonasPage.tsx`, the `openEdit` function currently sets `editingPersona` to open the modal. Change it to navigate:

First add `useNavigate` import at the top:
```ts
import { useNavigate } from 'react-router';
```

Then inside the component, add:
```ts
const navigate = useNavigate();
```

Replace the `openEdit` function:
```ts
// Old:
const openEdit = (persona: Persona) => {
    setEditingPersona(persona);
    setModalOpen(true);
};

// New:
const openEdit = (persona: Persona) => {
    navigate(`/persona/${persona.id}?tab=persona`);
};
```

The `editingPersona` state variable and the `<PersonaFormModal persona={editingPersona} ...>` block (used for editing) can be removed. Keep only the create-modal block:
```tsx
{modalOpen && (
    <PersonaFormModal
        persona={null}
        onClose={() => setModalOpen(false)}
    />
)}
```

- [ ] **Step 5: Verify full flow in browser**

Check these flows work:
1. Home → hover persona card → menu → "Nostalgia" → lands on `/persona/:id` with Memories tab showing
2. Chat header → click avatar → lands on `/persona/:id` with Persona tab (default)
3. Chat → BottomNav "History" → lands on `/persona/:id?tab=history`
4. PersonaPage Persona tab → edit name/tagline/prompt → Save → stays on page with updated data
5. Home → "+ add persona" → modal opens for create (unchanged)
6. BottomNav labels are larger and brighter when inactive

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PersonaPage.tsx \
        frontend/src/App.tsx \
        frontend/src/components/BottomNav.tsx \
        frontend/src/components/PersonasPage.tsx
git commit -m "Add unified PersonaPage with Persona/History/Memories tabs"
```

---

## Self-Review Notes

- **Spec coverage:** All four requirements covered across Tasks 1–5.
- **MemoryPage.tsx:** The original file is no longer imported anywhere after Task 5. It can be deleted in a follow-up, or left in place (unused). The plan does not delete it to keep the diff minimal and reversible.
- **`/persona/:personaId/memory` URL** in ChatPage (memory badge): updated in Task 3 Step 2 to `/persona/:personaId`.
- **Tab default in PersonaPage:** set to `'persona'` so clicking the avatar from chat lands on the edit form, not memories.
- **`onClose` in inline mode:** passed as no-op `() => {}`. The save action calls `updatePersona` and the modal stays rendered — no navigation needed. The user stays on the Persona tab after saving.
