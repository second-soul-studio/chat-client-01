# Memory UX Improvements — Design Spec

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Three UX improvements to the chat interface, plus a bonus bug fix for the memory popup:

1. **Focus restore** — input field keeps focus while the assistant streams
2. **Memory Sidebar** — persistent hover/tap panel on the left showing all pending memory entries
3. **Detection Spinner + Bubble** — visual feedback during and after memory extraction
4. **Popup bug fix** — the existing `MemorySuggestion` popup is never shown in practice; the sidebar makes it a non-issue

---

## 1. Focus Restore

**Problem:** The `<textarea>` has `disabled={isStreaming}`. The browser removes focus when an element is disabled, and does not restore it when re-enabled.

**Solution:** A `useEffect` in `ChatPage.tsx` that watches `isStreaming`:

```ts
useEffect(() => {
    if (!isStreaming) {
        textareaRef.current?.focus();
    }
}, [isStreaming]);
```

No new state, no new component. One effect.

---

## 2. Memory Sidebar

### New component: `MemorySidebar.tsx`

Overlays the chat from the left. Does not shift layout.

### Trigger Button

- Fixed to the left edge of the chat container
- Always visible: narrow vertical tab (~32px wide, ~80px tall)
- Shows 💾 icon + badge count of pending entries
- Styled with persona colour (transparent background, coloured border + icon)
- Pulses briefly (existing `memoryPulse` keyframe animation) when new entries are added

### Panel

- Width: 320px
- Slides in from left via CSS transition: `transform: translateX(-100%)` → `translateX(0)`
- Layered above chat content (`position: absolute`, high `z-index`)
- Background: `rgba(7,5,12,0.97)` with `backdropFilter: blur(20px)`
- Border-right: `1px solid ${personaColor}33`

### Desktop Behaviour

- `onMouseEnter` on button → 200ms delay → open panel
- `onMouseLeave` on the entire sidebar area (button + panel) → close panel
- Delay prevents accidental opens when the cursor passes over the button

### Mobile Behaviour

- Tap on button → toggle open/close
- No hover events

### Panel Content

- Header: `💾 Pending Memories` in persona colour, monospace, uppercase
- List of all entries with `status: 'suggested'`
- Per entry:
  - Type emoji (`MEMORY_TYPE_EMOJI[entry.type]`)
  - Content text — click to edit inline (same pattern as existing `MemorySuggestion`)
  - ✓ Accept button
  - ✗ Dismiss button
- If `entries.length > 1`: "Accept All" / "Dismiss All" batch actions at the bottom
- Empty state: `"No pending memories"` in muted text

### Props

```ts
interface MemorySidebarProps {
    entries: MemoryPendingEntry[];
    personaColor: string;
    isOpen: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onAccept: (entry: MemoryPendingEntry) => void;
    onAcceptAll: () => void;
    onDismiss: (entryId: string) => void;
    onDismissAll: () => void;
    onEdit: (entryId: string, newContent: string) => void;
}
```

### State in ChatPage

```ts
const [sidebarOpen, setSidebarOpen] = useState(false);
const sidebarOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleSidebarMouseEnter = () => {
    sidebarOpenTimer.current = setTimeout(() => setSidebarOpen(true), 200);
};
const handleSidebarMouseLeave = () => {
    if (sidebarOpenTimer.current) clearTimeout(sidebarOpenTimer.current);
    setSidebarOpen(false);
};
```

On mobile, replace hover handlers with a simple `onClick={() => setSidebarOpen(v => !v)}` on the button.

### Relationship to Existing Popup

The `MemorySuggestion` popup above the input field remains. It serves as a short-lived in-chat notification when new entries are freshly detected. The sidebar is the persistent, always-accessible view. Both share the same `suggestedEntries` state and handlers.

---

## 3. Detection Spinner + Bubble

### During Detection (`isDetecting = true`)

- A small pulsing dot (`●`) appears at the left inside the input wrapper, before the textarea
- Animated with a `pulse` keyframe in persona colour (scale + opacity)
- The input border already switches to `personaColor + '88'` when detecting — this is kept

### After Detection — Rising Bubble

Shown only when `entries.length > 0` after a non-silent detection run.

**Content:** Type breakdown, e.g. `💫 ×3 · 📌 ×1 · ⚙️ ×2`
Only types with count ≥ 1 are shown.

**State:**

```ts
const [detectionBubble, setDetectionBubble] = useState<Record<MemoryType, number> | null>(null);
```

Set at the end of `triggerDetection` when entries are found and `!silent`. Auto-cleared after 3 seconds via `setTimeout`.

**Positioning:** Absolutely positioned above the input wrapper, horizontally centred.

**Animation (CSS keyframe):**

```css
@keyframes bubbleRise {
    0%   { opacity: 0; transform: translateY(0); }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-44px); }
}
```

Duration: 3s, `animation-fill-mode: forwards`.

**Styling:** Small pill shape, persona colour border + faint background, monospace font. Clicking the bubble opens the sidebar.

---

## 4. Popup Bug Fix (Bonus)

**Root cause:** Memory detection almost always runs as `silent` (session-end unmount effect). Non-silent in-chat detection requires N turns (default: 5) without navigation — rarely reached in short sessions.

**Practical fix:** The sidebar makes this a non-issue. Entries saved during silent runs appear in the sidebar the next time the chat is opened (via the existing `getSuggestedPendingEntries` call on init).

**Additional check:** Verify `suggestedEntryExpiryDays` default in `db.ts` / settings defaults. If it is very short (e.g. 1–2 days), entries may expire before the user sees them. Should be at least 7 days.

---

## Files Affected

| File | Change |
|------|--------|
| `frontend/src/components/ChatPage.tsx` | Focus restore effect, sidebar state + handlers, detection bubble state, pulse dot in input |
| `frontend/src/components/MemorySidebar.tsx` | New component |
| `frontend/src/index.css` (or equivalent global CSS) | `bubbleRise` keyframe |

---

## Out of Scope

- Changing the memory detection interval or threshold
- Modifying the `MemorySuggestion` popup behaviour
- Any backend changes
