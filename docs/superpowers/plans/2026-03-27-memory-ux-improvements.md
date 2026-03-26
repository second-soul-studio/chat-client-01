# Memory UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focus restore after streaming, a hover/tap memory sidebar, and a detection spinner + rising bubble to the chat interface.

**Architecture:** All changes are confined to `ChatPage.tsx` (state + wiring) and a new `MemorySidebar.tsx` component. One new CSS keyframe in `index.css`. No new state management, no new services.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite — `pnpm build` for type-checking.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/index.css` | Modify | Add `bubbleRise` keyframe |
| `frontend/src/components/MemorySidebar.tsx` | Create | Drawer-with-handle sidebar component |
| `frontend/src/components/ChatPage.tsx` | Modify | Focus restore, sidebar state/handlers, detection bubble, pulse dot |

---

## Task 1: Add `bubbleRise` keyframe to `index.css`

**Files:**
- Modify: `frontend/src/index.css` (after line 278, end of `memoryPulse`)

- [ ] **Step 1: Add keyframe**

Open `frontend/src/index.css`. After the closing `}` of `@keyframes memoryPulse` (currently line 278), insert:

```css
@keyframes bubbleRise {

    0% {
        opacity: 0;
        transform: translateY(0);
    }

    15% {
        opacity: 1;
        transform: translateY(-6px);
    }

    85% {
        opacity: 1;
        transform: translateY(-38px);
    }

    100% {
        opacity: 0;
        transform: translateY(-44px);
    }
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/chris/workspace/chat-client-01/frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "Add bubbleRise keyframe for memory detection bubble"
```

---

## Task 2: Focus restore after streaming

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx`

- [ ] **Step 1: Add `useEffect` to restore focus**

In `ChatPage.tsx`, after the scroll effect (currently around line 87):

```tsx
// Scroll to bottom when messages change
useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [activeChat?.messages.length, isStreaming]);

// Restore focus to input after streaming ends
useEffect(() => {
    if (!isStreaming) {
        textareaRef.current?.focus();
    }
}, [isStreaming]);
```

- [ ] **Step 2: Verify build**

```bash
cd /home/chris/workspace/chat-client-01/frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatPage.tsx
git commit -m "Restore input focus after assistant finishes streaming"
```

---

## Task 3: Create `MemorySidebar.tsx`

**Files:**
- Create: `frontend/src/components/MemorySidebar.tsx`

The component uses the **drawer-with-handle** pattern:
- Outer div: `position: absolute, left: 0, top: 0, bottom: 0, width: 320px`
- When closed: `transform: translateX(calc(-100% + 32px))` — slides left until only the 32px tab handle is visible at screen x=0..32
- When open: `transform: translateX(0)` — full 320px panel visible
- Tab handle: `position: absolute, right: 0` within the outer div — always at screen x=0..32
- Panel content: has `paddingRight: 32px` so text doesn't go behind the tab handle

Mouse events on the outer div drive desktop hover behaviour (wired from ChatPage).
`onClick={onToggle}` on the tab button drives mobile tap.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import type { MemoryPendingEntry } from '@/types';
import { MEMORY_TYPE_EMOJI } from '@/types';

interface MemorySidebarProps {
    entries: MemoryPendingEntry[];
    personaColor: string;
    isOpen: boolean;
    isPulsing: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onToggle: () => void;
    onAccept: (entry: MemoryPendingEntry) => void;
    onAcceptAll: () => void;
    onDismiss: (entryId: string) => void;
    onDismissAll: () => void;
    onEdit: (entryId: string, newContent: string) => void;
}

export default function MemorySidebar({
    entries, personaColor, isOpen, isPulsing,
    onMouseEnter, onMouseLeave, onToggle,
    onAccept, onAcceptAll, onDismiss, onDismissAll, onEdit,
}: MemorySidebarProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    function startEdit(entry: MemoryPendingEntry) {
        setEditingId(entry.id);
        setEditContent(entry.content);
    }

    function commitEdit(entryId: string) {
        if (editContent.trim()) onEdit(entryId, editContent.trim());
        setEditingId(null);
    }

    function handleEditKeyDown(e: React.KeyboardEvent, entryId: string) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(entryId); }
        if (e.key === 'Escape') setEditingId(null);
    }

    return (
        <div
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 320,
                transform: isOpen ? 'translateX(0)' : 'translateX(calc(-100% + 32px))',
                transition: 'transform 0.25s ease',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {/* Panel content — fades in/out, hides behind handle when closed */}
            <div
                style={{
                    flex: 1,
                    background: 'rgba(7,5,12,0.97)',
                    backdropFilter: 'blur(20px)',
                    borderRight: `1px solid ${personaColor}33`,
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: isOpen ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    pointerEvents: isOpen ? 'auto' : 'none',
                    paddingRight: 32,
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 14px 10px',
                        fontSize: 11,
                        fontFamily: "'Courier New', monospace",
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: personaColor,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 14 }}>💾</span>
                    Pending Memories
                </div>

                {/* Entry list */}
                <div
                    style={{
                        flex: 1,
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        overflowY: 'auto',
                        scrollbarWidth: 'thin',
                        scrollbarColor: `${personaColor}44 transparent`,
                    }}
                >
                    {entries.length === 0 ? (
                        <div
                            style={{
                                color: 'rgba(255,255,255,0.25)',
                                fontSize: 12,
                                fontFamily: "'Lora', Georgia, serif",
                                fontStyle: 'italic',
                                textAlign: 'center',
                                marginTop: 20,
                            }}
                        >
                            No pending memories
                        </div>
                    ) : (
                        entries.map(entry => (
                            <div
                                key={entry.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 8px',
                                    borderRadius: 10,
                                    background: 'rgba(255,255,255,0.02)',
                                }}
                            >
                                <span style={{ fontSize: 14, flexShrink: 0 }}>
                                    {MEMORY_TYPE_EMOJI[entry.type]}
                                </span>

                                {editingId === entry.id ? (
                                    <input
                                        autoFocus
                                        value={editContent}
                                        onChange={e => setEditContent(e.target.value)}
                                        onKeyDown={e => handleEditKeyDown(e, entry.id)}
                                        onBlur={() => commitEdit(entry.id)}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.06)',
                                            border: `1px solid ${personaColor}44`,
                                            borderRadius: 6,
                                            color: '#e8e0d4',
                                            fontSize: 12,
                                            fontFamily: "'Lora', Georgia, serif",
                                            padding: '3px 6px',
                                            outline: 'none',
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => startEdit(entry)}
                                        title="Click to edit"
                                        style={{
                                            flex: 1,
                                            fontSize: 12,
                                            fontFamily: "'Lora', Georgia, serif",
                                            color: '#e8e0d4',
                                            cursor: 'text',
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {entry.content}
                                    </span>
                                )}

                                <button
                                    onClick={() => onAccept(entry)}
                                    title="Accept"
                                    style={{
                                        flexShrink: 0,
                                        width: 24,
                                        height: 24,
                                        borderRadius: 6,
                                        border: 'none',
                                        background: `${personaColor}22`,
                                        color: personaColor,
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    aria-label="Accept memory"
                                >
                                    ✓
                                </button>
                                <button
                                    onClick={() => onDismiss(entry.id)}
                                    title="Dismiss"
                                    style={{
                                        flexShrink: 0,
                                        width: 24,
                                        height: 24,
                                        borderRadius: 6,
                                        border: 'none',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'rgba(255,255,255,0.3)',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    aria-label="Dismiss memory"
                                >
                                    ✗
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Batch actions */}
                {entries.length > 1 && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 6,
                            padding: '8px 10px',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            flexShrink: 0,
                        }}
                    >
                        <button
                            onClick={onDismissAll}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.35)',
                                fontSize: 10,
                                fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.06em',
                                cursor: 'pointer',
                            }}
                        >
                            ✗ All
                        </button>
                        <button
                            onClick={onAcceptAll}
                            style={{
                                padding: '4px 10px',
                                borderRadius: 8,
                                border: `1px solid ${personaColor}44`,
                                background: `${personaColor}18`,
                                color: personaColor,
                                fontSize: 10,
                                fontFamily: "'Courier New', monospace",
                                letterSpacing: '0.06em',
                                cursor: 'pointer',
                            }}
                        >
                            ✓ All
                        </button>
                    </div>
                )}
            </div>

            {/* Tab handle — always visible at right edge of the outer div */}
            <button
                onClick={onToggle}
                style={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 28,
                    padding: '20px 0',
                    background: isOpen ? `${personaColor}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isOpen ? personaColor + '55' : 'rgba(255,255,255,0.12)'}`,
                    borderLeft: 'none',
                    borderRadius: '0 10px 10px 0',
                    color: isOpen ? personaColor : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    transition: 'all 0.2s ease',
                    animation: isPulsing ? 'memoryPulse 0.8s ease-out' : 'none',
                    '--pulse-color': `${personaColor}99`,
                    '--pulse-color-fade': `${personaColor}00`,
                } as React.CSSProperties}
                aria-label={isOpen ? 'Close memory sidebar' : 'Open memory sidebar'}
            >
                💾
                {entries.length > 0 && (
                    <span
                        style={{
                            fontSize: 9,
                            fontFamily: "'Courier New', monospace",
                            fontWeight: 700,
                            color: personaColor,
                            lineHeight: 1,
                        }}
                    >
                        {entries.length}
                    </span>
                )}
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/chris/workspace/chat-client-01/frontend && pnpm build
```

Expected: no errors (component is not yet imported anywhere, TS will not flag unused files).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MemorySidebar.tsx
git commit -m "Add MemorySidebar component with drawer-with-handle pattern"
```

---

## Task 4: Wire `MemorySidebar` into `ChatPage.tsx`

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx`

Four changes: (a) `position: relative` + `overflow: hidden` on outer div, (b) sidebar state + timer ref, (c) mouse handlers, (d) import + render.

- [ ] **Step 1: Add sidebar state and timer ref**

In `ChatPage.tsx`, after the existing memory detection state block (currently around line 55):

```tsx
// Memory detection state
const [suggestedEntries, setSuggestedEntries] = useState<MemoryPendingEntry[]>([]);
const [isDetecting, setIsDetecting] = useState(false);
const [showHearts, setShowHearts] = useState(false);
const [isBadgePulsing, setIsBadgePulsing] = useState(false);
const prevSuggestedCount = useRef(0);

// Memory sidebar state
const [sidebarOpen, setSidebarOpen] = useState(false);
const sidebarOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: Add mouse handlers**

After the `handleEditEntry` callback (currently around line 263), add:

```tsx
const handleSidebarMouseEnter = useCallback(() => {
    if (sidebarOpenTimer.current) clearTimeout(sidebarOpenTimer.current);
    sidebarOpenTimer.current = setTimeout(() => setSidebarOpen(true), 200);
}, []);

const handleSidebarMouseLeave = useCallback(() => {
    if (sidebarOpenTimer.current) clearTimeout(sidebarOpenTimer.current);
    setSidebarOpen(false);
}, []);
```

- [ ] **Step 3: Add `import MemorySidebar`**

At the top of `ChatPage.tsx`, after the existing component imports:

```tsx
import MemorySuggestion from './MemorySuggestion';
import FloatingHearts from './FloatingHearts';
import MemorySidebar from './MemorySidebar';
```

- [ ] **Step 4: Add `position: relative` and `overflow: hidden` to the outer div**

The outer return div currently reads:

```tsx
<div
    style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#07050c',
    }}
>
```

Change to:

```tsx
<div
    style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#07050c',
        position: 'relative',
        overflow: 'hidden',
    }}
>
```

- [ ] **Step 5: Render `MemorySidebar`**

Directly after the outer opening `<div>` (after the new `position: relative` div, before the `{/* Header */}` comment), add:

```tsx
{/* Memory sidebar — overlays chat from left */}
<MemorySidebar
    entries={suggestedEntries}
    personaColor={persona.color}
    isOpen={sidebarOpen}
    isPulsing={isBadgePulsing}
    onMouseEnter={handleSidebarMouseEnter}
    onMouseLeave={handleSidebarMouseLeave}
    onToggle={() => setSidebarOpen(v => !v)}
    onAccept={handleAcceptEntry}
    onAcceptAll={handleAcceptAll}
    onDismiss={handleDismissEntry}
    onDismissAll={handleDismissAll}
    onEdit={handleEditEntry}
/>
```

- [ ] **Step 6: Verify build**

```bash
cd /home/chris/workspace/chat-client-01/frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatPage.tsx
git commit -m "Wire MemorySidebar into ChatPage with hover/tap open behaviour"
```

---

## Task 5: Detection spinner dot + rising bubble

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx`

Four changes: (a) new `detectionBubble` state + timer ref, (b) update `triggerDetection` to set bubble, (c) add pulse dot in input wrapper, (d) render rising bubble above input.

- [ ] **Step 1: Add `MEMORY_TYPE_EMOJI` import and `MemoryType` to the types import**

Current import line (line 11):

```tsx
import type { Message, MemoryPendingEntry } from '@/types';
```

Replace with:

```tsx
import type { Message, MemoryPendingEntry, MemoryType } from '@/types';
import { MEMORY_TYPE_EMOJI } from '@/types';
```

- [ ] **Step 2: Add `detectionBubble` state and timer ref**

After the sidebar state block (added in Task 4), add:

```tsx
// Detection bubble state
const [detectionBubble, setDetectionBubble] = useState<Partial<Record<MemoryType, number>> | null>(null);
const detectionBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Update `triggerDetection` to set bubble on new entries**

Inside `triggerDetection`, find the non-silent branch that calls `setSuggestedEntries`:

```tsx
if (silent) {
    await maybeAutoConsolidate();
} else {
    // Show in-chat popup for immediate review
    setSuggestedEntries(prev => [...prev, ...entries]);
}
```

Replace with:

```tsx
if (silent) {
    await maybeAutoConsolidate();
} else {
    // Show in-chat popup for immediate review
    setSuggestedEntries(prev => [...prev, ...entries]);

    // Show rising bubble with type breakdown
    const counts = entries.reduce<Partial<Record<MemoryType, number>>>((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1;
        return acc;
    }, {});
    if (detectionBubbleTimer.current) clearTimeout(detectionBubbleTimer.current);
    setDetectionBubble(counts);
    detectionBubbleTimer.current = setTimeout(() => setDetectionBubble(null), 3000);
}
```

Also add `setDetectionBubble` is a stable setter so no change to `useCallback` deps needed. However `detectionBubbleTimer` is a ref (stable). No dep change needed.

- [ ] **Step 4: Add pulse dot inside the input textarea wrapper**

Find the input row `<div>` that wraps the textarea (currently starts around line 631):

```tsx
<div
    style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${isDetecting ? persona.color + '88' : persona.color + '33'}`,
        borderRadius: 20,
        padding: '8px 8px 8px 16px',
    }}
>
    <textarea
```

Add the pulse dot between the opening `<div>` and `<textarea>`:

```tsx
<div
    style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${isDetecting ? persona.color + '88' : persona.color + '33'}`,
        borderRadius: 20,
        padding: '8px 8px 8px 16px',
    }}
>
    {isDetecting && (
        <span
            style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: persona.color,
                flexShrink: 0,
                animation: 'pulse 1s ease-in-out infinite',
            }}
        />
    )}
    <textarea
```

- [ ] **Step 5: Add `position: relative` to the `inputWrapperRef` div and render the bubble**

Find the inputWrapperRef div (currently around line 571):

```tsx
<div style={{ maxWidth: 800, margin: '0 auto' }} ref={inputWrapperRef}>
```

Replace with:

```tsx
<div style={{ maxWidth: 800, margin: '0 auto', position: 'relative' }} ref={inputWrapperRef}>
```

Then, directly inside this div, before the `{/* Memory suggestion popup */}` comment, add:

```tsx
{/* Rising detection bubble */}
{detectionBubble && (
    <div
        style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 10,
            paddingBottom: 6,
        }}
    >
        <button
            onClick={() => { setSidebarOpen(true); setDetectionBubble(null); }}
            style={{
                animation: 'bubbleRise 3s ease-out forwards',
                padding: '5px 12px',
                borderRadius: 20,
                border: `1px solid ${persona.color}55`,
                background: `rgba(7,5,12,0.92)`,
                color: persona.color,
                fontSize: 12,
                fontFamily: "'Courier New', monospace",
                letterSpacing: '0.06em',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                pointerEvents: 'auto',
                whiteSpace: 'nowrap',
            }}
        >
            {(Object.entries(detectionBubble) as [MemoryType, number][])
                .filter(([, n]) => n > 0)
                .map(([type, n]) => `${MEMORY_TYPE_EMOJI[type]} ×${n}`)
                .join('  ·  ')}
        </button>
    </div>
)}
```

- [ ] **Step 6: Verify build**

```bash
cd /home/chris/workspace/chat-client-01/frontend && pnpm build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatPage.tsx
git commit -m "Add memory detection spinner dot and rising bubble notification"
```

---

## Self-Review

**Spec coverage:**
- ✅ Focus restore: Task 2
- ✅ Memory sidebar (hover/tap, slide, badge, pulse, accept/dismiss/edit, batch actions): Tasks 3 + 4
- ✅ Detection spinner dot during `isDetecting`: Task 5 Step 4
- ✅ Rising bubble after detection (only when entries found): Task 5 Steps 2–5
- ✅ Bubble click opens sidebar: Task 5 Step 5
- ✅ Popup bug fix: sidebar shows persisted entries on init (no code change needed, 7-day expiry is fine)

**Placeholder scan:** No TBDs, all code is complete.

**Type consistency:**
- `MemoryType` imported in Task 5 Step 1, used in Task 5 Steps 2 + 3 + 5 ✓
- `MEMORY_TYPE_EMOJI` imported in Task 5 Step 1, used in Task 5 Step 5 ✓
- `MemorySidebarProps.isPulsing` defined in Task 3, passed as `isBadgePulsing` in Task 4 Step 5 ✓
- `handleSidebarMouseEnter/Leave` defined in Task 4 Step 2, passed in Task 4 Step 5 ✓
- `detectionBubbleTimer` ref defined in Task 5 Step 2, used in Task 5 Step 3 ✓
- `setSidebarOpen` used in Task 5 Step 5 — defined in Task 4 Step 1 ✓
