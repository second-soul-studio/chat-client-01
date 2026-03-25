# Playbook 04 — UI Enhancements

**Priority:** Medium — improves discoverability and usability of the memory feature.
**Scope:** Pure UI changes. No logic changes, no new DB operations (except reading counts).
**Depends on:** Playbook 01 (bug fixes) — the badge needs accurate suggested-entry counts.

---

## Context

Read before starting:
- `MEMORY-SYSTEM-CURRENT.md` — full system overview
- `MEMORY-SYSTEM-PROPOSALS.md` — proposals #7, #9, #10, #11

Key files:
- `frontend/src/components/ChatPage.tsx` — chat header, input area
- `frontend/src/components/MemoryPage.tsx` — memory management UI
- `frontend/src/components/MemorySuggestion.tsx` — in-chat suggestion popup
- `frontend/src/services/db.ts` — `getSuggestedPendingEntries`, `deletePendingEntry`

Read the current styling conventions from the existing components before writing any
new JSX — the app uses inline styles throughout (no Tailwind in these components),
with a consistent dark palette (`#07050c` background, `rgba(255,255,255,0.XX)` for
text, `persona.color` for accents).

---

## Enhancement 1 — NSFW Toggle Label Clarity (Proposal #7)

### Problem

`nsfwEnabled` already lives on `MemoryMeta` (per-persona), so the data model is
correct. The UI does not make clear that this toggle applies to this persona only.

### What to do

In `MemoryPage.tsx`, find the NSFW toggle and update the surrounding label/copy:

- Change the label from something like "Include NSFW" to:
  **"Include NSFW memories in [PersonaName]'s prompt"**
  (use the actual persona name from props/store)
- Add a small helper text beneath: *"This setting applies to this persona only."*

No logic changes.

---

## Enhancement 2 — "Delete All Suggested" Button (Proposal #9)

### Problem

Users accumulate unreviewed (`suggested`) entries with no way to bulk-clear them.
The existing "Delete Pending" button — verify what it currently does before changing
anything. If it already clears only `suggested` entries, just make it more prominent
and clearly labelled. If it clears both `suggested` and `accepted`, split the action.

### What to do

1. Read `MemoryPage.tsx` carefully to find the existing delete-pending logic.
2. Add (or rename/clarify) a button that deletes all `suggested` entries for this persona.
3. Accepted entries must not be affected.
4. Add a confirmation step (e.g. a simple `window.confirm` or an inline "Are you sure?")
   before deleting — users may click it by accident.

Label suggestion: **"Dismiss all unreviewed"** or **"Clear suggested"**.

---

## Enhancement 3 — In-Chat Pending Badge (Proposal #10)

### Problem

The `MemorySuggestion` popup is the only signal that new memory suggestions exist.
If the user misses it (or it was not shown due to the mount bug from Playbook 01),
there is no persistent indicator. Suggestions silently accumulate.

### What to do

**In `ChatPage.tsx`:**

1. Track a `suggestedCount` — this is just `suggestedEntries.length` (already in state
   after Playbook 01 fix). No new DB reads needed during the chat session.

2. Add a badge to the chat header, next to or after the persona name/tagline area.
   The badge shows the count when `suggestedCount > 0`.

3. When new entries are added to `suggestedEntries` (i.e. detection just fired),
   trigger a brief pulse/flash animation on the badge. Use a CSS animation, toggled
   by a boolean state that resets after ~1s.

4. Clicking the badge navigates to the Memory Page for this persona
   (`navigate(\`/persona/${personaId}/memory\`)`  or equivalent — check the router config).

**Visual design:**
- Small pill / circle, persona accent colour background, white text
- Keep it subtle — this is secondary information, not a primary action
- Example: a small `💾 3` pill with a glow pulse on new arrival

```tsx
{suggestedCount > 0 && (
    <button
        onClick={() => navigate(`/persona/${personaId}/memory`)}
        style={{
            marginLeft: 'auto',
            padding: '3px 10px',
            borderRadius: 20,
            border: `1px solid ${persona.color}55`,
            background: `${persona.color}22`,
            color: persona.color,
            fontSize: 11,
            fontFamily: "'Courier New', monospace",
            cursor: 'pointer',
            animation: isPulsing ? 'memoryPulse 0.8s ease-out' : 'none',
        }}
    >
        💾 {suggestedCount}
    </button>
)}
```

Add `memoryPulse` keyframes to the global CSS (check where other animations like
`heartFloat` and `slideUpFade` are defined — likely `index.css` or similar).

---

## Enhancement 4 — "Back to Chat" Button on Memory Page (Proposal #11)

### Problem

The Memory Page has no way to return to the active chat. The user must use the
browser back button or navigate manually.

### What to do

In `MemoryPage.tsx`, add a back button in the top-left of the page header.

- Use `navigate(-1)` — simple and correct for the common case (user came from chat).
- Style it consistently with the back arrow in `ChatPage` (same `←` character, same
  muted colour, same minimum tap target of 44×44px).

If the Memory Page can also be reached from a route that is not a chat (e.g. directly
via URL), consider falling back to `navigate('/')` if there is no history to go back
to — but do not over-engineer this for now.

---

## Done when

- [ ] NSFW toggle label includes persona name and "this persona only" note
- [ ] "Delete all suggested" button exists, clearly labelled, with confirmation
- [ ] Accepted entries are not deleted by the above button
- [ ] In-chat badge shows `suggestedCount` when > 0
- [ ] Badge pulses briefly when new suggestions arrive
- [ ] Clicking badge navigates to Memory Page
- [ ] Badge disappears when all suggestions are reviewed (count reaches 0)
- [ ] "Back to Chat" button exists on Memory Page, styled consistently
- [ ] Manual test: accept all suggestions in chat → badge disappears
- [ ] Manual test: navigate to Memory Page from chat → back button returns to chat
