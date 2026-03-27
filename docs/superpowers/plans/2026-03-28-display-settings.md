# Display Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chat font size (normal/large/very-large) and UI scale (100%/110%/120%/130%) settings, stored in AppSettings, applied via CSS custom properties, and exposed in a new "Display" tab in SettingsPage.

**Architecture:** Two new fields on `AppSettings` are persisted to IndexedDB and merged with defaults on load. `AppShell` sets two CSS custom properties on `document.documentElement` whenever settings change. ChatBubbles message body text references `var(--ss-chat-font-size)`; the root container uses `zoom: var(--ss-ui-zoom)`.

**Tech Stack:** React 19, TypeScript, Zustand, idb (IndexedDB), Vite, Tailwind CSS v4, inline styles.

---

## Files

| File | Change |
|------|--------|
| `frontend/src/types/index.ts` | Add `chatFontSize` and `uiScale` to `AppSettings` |
| `frontend/src/services/db.ts` | Add defaults for both fields in `DEFAULT_SETTINGS` and spread them in `getSettings` |
| `frontend/src/components/AppShell.tsx` | Add `useEffect` to set CSS vars; add `zoom` to root div |
| `frontend/src/components/SettingsPage.tsx` | Add "Display" tab with two button-group selectors |
| `frontend/src/components/ChatBubbles.tsx` | Replace `fontSize: 14.5` (message body) with `fontSize: 'var(--ss-chat-font-size)'` |

---

### Task 1: Extend AppSettings type

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add the two new fields to AppSettings**

In `frontend/src/types/index.ts`, replace the `AppSettings` interface:

```ts
export interface AppSettings {
    globalSystemPrompt: string;
    defaultModelId: string | null;
    theme: 'dark';
    memorySettings: MemorySettings;
    knowledge: KnowledgeSettings;
    chatFontSize: 'normal' | 'large' | 'very-large';
    uiScale: 100 | 110 | 120 | 130;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/chris/workspace/chat-client-01/frontend
pnpm tsc --noEmit
```

Expected: no errors (Zustand store and db.ts will complain until Task 2 is done — that's fine, fix those in Task 2).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "Add chatFontSize and uiScale to AppSettings type"
```

---

### Task 2: Add defaults in db.ts

**Files:**
- Modify: `frontend/src/services/db.ts`

- [ ] **Step 1: Add defaults to DEFAULT_SETTINGS**

In `frontend/src/services/db.ts`, find `const DEFAULT_SETTINGS: AppSettings = {` (around line 205) and add the two new fields:

```ts
const DEFAULT_SETTINGS: AppSettings = {
    globalSystemPrompt: '',
    defaultModelId: 'nano-gpt/claude-sonnet-4-6',
    theme: 'dark',
    memorySettings: {
        workerModelId: null,
        autoConsolidate: true,
        consolidationThreshold: 10,
        detectionInterval: 5,
        suggestedEntryExpiryDays: 7,
    },
    knowledge: DEFAULT_KNOWLEDGE_SETTINGS,
    chatFontSize: 'normal',
    uiScale: 100,
};
```

- [ ] **Step 2: Verify getSettings merges new fields**

The existing `getSettings` function already spreads `DEFAULT_SETTINGS` before the stored value:

```ts
return {
    ...DEFAULT_SETTINGS,
    ...stored,
    memorySettings: { ...DEFAULT_SETTINGS.memorySettings, ...storedMemory },
    knowledge: { ...DEFAULT_SETTINGS.knowledge, ...storedKnowledge },
};
```

This means existing users whose stored settings lack `chatFontSize` / `uiScale` will get the defaults automatically. No migration needed.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/chris/workspace/chat-client-01/frontend
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/db.ts
git commit -m "Add chatFontSize and uiScale defaults to db settings"
```

---

### Task 3: Apply CSS custom properties in AppShell

**Files:**
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: Rewrite AppShell to read settings and apply CSS vars**

Replace the entire content of `frontend/src/components/AppShell.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { useAppStore } from '@/stores/appStore';
import BottomNav from './BottomNav';

interface Props {
    children: ReactNode;
}

const CHAT_FONT_SIZES = {
    normal: '14px',
    large: '16px',
    'very-large': '19px',
} as const;

export default function AppShell({ children }: Props) {
    const settings = useAppStore(s => s.settings);

    useEffect(() => {
        if (!settings) return;
        const fontSize = CHAT_FONT_SIZES[settings.chatFontSize ?? 'normal'];
        const zoom = String((settings.uiScale ?? 100) / 100);
        document.documentElement.style.setProperty('--ss-chat-font-size', fontSize);
        document.documentElement.style.setProperty('--ss-ui-zoom', zoom);
    }, [settings]);

    return (
        <div
            className="flex flex-col h-full bg-[#07050c] text-[#e8e0d4] overflow-hidden"
            style={{ zoom: 'var(--ss-ui-zoom)' }}
        >
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
                {children}
            </main>
            <BottomNav />
        </div>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/chris/workspace/chat-client-01/frontend
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AppShell.tsx
git commit -m "Apply --ss-chat-font-size and --ss-ui-zoom CSS vars from AppShell"
```

---

### Task 4: Update ChatBubbles message body font sizes

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx`

Context: There are two message body bubbles — the assistant bubble (around line 320) and the user bubble (around line 494). Both use `fontSize: 14.5`. The avatar initials circle uses `fontSize: 14` — that is a UI element, leave it untouched.

- [ ] **Step 1: Replace fontSize in the assistant bubble**

Find this block (around line 314–326):

```tsx
<div
    className="assistant-bubble"
    style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '4px 20px 20px 20px',
        padding: '14px 18px',
        color: '#e8e0d4',
        fontSize: 14.5,
        fontFamily: "'Lora', Georgia, serif",
        lineHeight: 1.65,
```

Change `fontSize: 14.5` to `fontSize: 'var(--ss-chat-font-size)'`.

- [ ] **Step 2: Replace fontSize in the user bubble**

Find this block (around line 487–498):

```tsx
<div
    className="user-bubble"
    style={{
        background: `linear-gradient(135deg, ${accentColor}22 0%, ${accentColor}12 100%)`,
        border: `1px solid ${accentColor}33`,
        borderRadius: '20px 4px 20px 20px',
        padding: '12px 16px',
        color: '#e8e0d4',
        fontSize: 14.5,
        fontFamily: "'Lora', Georgia, serif",
        lineHeight: 1.65,
```

Change `fontSize: 14.5` to `fontSize: 'var(--ss-chat-font-size)'`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/chris/workspace/chat-client-01/frontend
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Use --ss-chat-font-size CSS var for message body text in ChatBubbles"
```

---

### Task 5: Add Display tab to SettingsPage

**Files:**
- Modify: `frontend/src/components/SettingsPage.tsx`

- [ ] **Step 1: Add 'display' to the TABS array**

Find the `TABS` array (around line 45):

```ts
const TABS = [
    { id: 'api' as const, label: 'Providers' },
    { id: 'global' as const, label: 'Global' },
    { id: 'tools' as const, label: 'Tools' },
    { id: 'memory' as const, label: 'Memory' },
    { id: 'knowledge' as const, label: 'Knowledge' },
];
```

Replace with:

```ts
const TABS = [
    { id: 'api' as const, label: 'Providers' },
    { id: 'global' as const, label: 'Global' },
    { id: 'display' as const, label: 'Display' },
    { id: 'tools' as const, label: 'Tools' },
    { id: 'memory' as const, label: 'Memory' },
    { id: 'knowledge' as const, label: 'Knowledge' },
];
```

- [ ] **Step 2: Update the activeTab state type**

Find:

```ts
const [activeTab, setActiveTab] = useState<'api' | 'global' | 'tools' | 'memory' | 'knowledge'>('api');
```

Replace with:

```ts
const [activeTab, setActiveTab] = useState<'api' | 'global' | 'display' | 'tools' | 'memory' | 'knowledge'>('api');
```

- [ ] **Step 3: Add handler functions**

After the `resetKnowledgeDefaults` function (around line 29), add:

```ts
const updateDisplay = (patch: Partial<Pick<AppSettings, 'chatFontSize' | 'uiScale'>>) => {
    setSettings({ ...settings, ...patch });
};
```

Make sure `AppSettings` is imported — it already is via `import type { AppSettings, KnowledgeSettings, MemorySettings } from '@/types';`.

- [ ] **Step 4: Add the Display tab panel**

After the `{activeTab === 'global' && ...}` block, add:

```tsx
{activeTab === 'display' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Chat Font Size */}
        <div>
            <label style={labelStyle}>Chat Font Size</label>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                {(['normal', 'large', 'very-large'] as const).map(size => (
                    <button
                        key={size}
                        onClick={() => updateDisplay({ chatFontSize: size })}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: 'none',
                            cursor: 'pointer',
                            background: settings.chatFontSize === size ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: settings.chatFontSize === size ? '#ffffff' : 'rgba(255,255,255,0.4)',
                            fontSize: 12,
                            letterSpacing: '0.08em',
                            fontFamily: "'Courier New', monospace",
                            transition: 'all 0.15s',
                        }}
                    >
                        {size === 'normal' ? 'Normal' : size === 'large' ? 'Large' : 'Very Large'}
                    </button>
                ))}
            </div>
            <p style={hintStyle}>Applies to chat message text only.</p>
        </div>

        {/* UI Scale */}
        <div>
            <label style={labelStyle}>UI Scale</label>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                {([100, 110, 120, 130] as const).map(scale => (
                    <button
                        key={scale}
                        onClick={() => updateDisplay({ uiScale: scale })}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: 'none',
                            cursor: 'pointer',
                            background: settings.uiScale === scale ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: settings.uiScale === scale ? '#ffffff' : 'rgba(255,255,255,0.4)',
                            fontSize: 12,
                            letterSpacing: '0.08em',
                            fontFamily: "'Courier New', monospace",
                            transition: 'all 0.15s',
                        }}
                    >
                        {scale}%
                    </button>
                ))}
            </div>
            <p style={hintStyle}>Scales the entire UI. Applies immediately.</p>
        </div>
    </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/chris/workspace/chat-client-01/frontend
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Verify in browser**

```bash
cd /home/chris/workspace/chat-client-01/frontend
pnpm dev
```

Open the app, go to Settings → Display. Confirm:
- Three font size buttons render correctly, active state highlights the selected option.
- Four scale buttons render correctly.
- Switching Chat Font Size changes message text size visibly in an open chat.
- Switching UI Scale zooms the entire UI immediately.
- Refreshing the page retains both selections (IndexedDB persistence).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SettingsPage.tsx
git commit -m "Add Display settings tab with chat font size and UI scale selectors"
```
