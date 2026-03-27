# Display Settings Extensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add growing textarea, font family selector (Lora vs system sans-serif), and four-step line height selector to Second Soul.

**Architecture:** Two new fields (`chatFontFamily`, `chatLineHeight`) in `AppSettings` are persisted in IndexedDB. `AppShell` translates them to CSS custom properties (`--ss-chat-font-family`, `--ss-chat-line-height`). `ChatBubbles` and the `ChatPage` textarea consume those variables. The Display tab in `SettingsPage` gets two new pill-button sections using the existing pattern.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite, idb (IndexedDB), Zustand

---

## File Map

| File | Change |
|---|---|
| `frontend/src/types/index.ts` | Add `chatFontFamily` and `chatLineHeight` to `AppSettings` |
| `frontend/src/services/db.ts` | Add defaults for both new fields |
| `frontend/src/components/AppShell.tsx` | Set `--ss-chat-font-family` and `--ss-chat-line-height` CSS vars |
| `frontend/src/components/ChatBubbles.tsx` | Replace hardcoded `fontFamily`/`lineHeight` with CSS vars (2 bubbles) |
| `frontend/src/components/ChatPage.tsx` | Textarea: dynamic 50 vh cap, `overflow: auto`, font via CSS var |
| `frontend/src/components/SettingsPage.tsx` | Display tab: 2 new sections, extend `updateDisplay` type |

---

## Task 1: Extend AppSettings type and defaults

**Files:**
- Modify: `frontend/src/types/index.ts:72-73`
- Modify: `frontend/src/services/db.ts:205-219`

### Context

`AppSettings` lives in `frontend/src/types/index.ts`. The current fields at lines 72-73 are:

```ts
chatFontSize: 'normal' | 'large' | 'very-large';
uiScale: 100 | 110 | 120 | 130;
```

`DEFAULT_SETTINGS` in `frontend/src/services/db.ts` at lines 205-219 already uses a spread-merge pattern so new fields are applied automatically to existing users on upgrade.

- [ ] **Step 1: Add the two new fields to `AppSettings` in `frontend/src/types/index.ts`**

Replace lines 72-73:

```ts
chatFontSize: 'normal' | 'large' | 'very-large';
uiScale: 100 | 110 | 120 | 130;
```

With:

```ts
chatFontSize: 'normal' | 'large' | 'very-large';
uiScale: 100 | 110 | 120 | 130;
chatFontFamily: 'serif' | 'sans-serif';
chatLineHeight: 'small' | 'normal' | 'large' | 'very-large';
```

- [ ] **Step 2: Add defaults in `frontend/src/services/db.ts`**

Replace lines 217-218:

```ts
    chatFontSize: 'normal',
    uiScale: 100,
```

With:

```ts
    chatFontSize: 'normal',
    uiScale: 100,
    chatFontFamily: 'serif',
    chatLineHeight: 'normal',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/db.ts
git commit -m "Add chatFontFamily and chatLineHeight to AppSettings"
```

---

## Task 2: Set CSS custom properties in AppShell

**Files:**
- Modify: `frontend/src/components/AppShell.tsx`

### Context

`AppShell.tsx` already sets `--ss-chat-font-size` and `--ss-ui-zoom` in a `useEffect` on `settings`. The full current file:

```ts
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
    // ...
```

- [ ] **Step 1: Add font family and line height maps, extend the useEffect**

Replace the entire contents of `frontend/src/components/AppShell.tsx` with:

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

const CHAT_FONT_FAMILIES = {
    serif: "'Lora', Georgia, serif",
    'sans-serif': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

const CHAT_LINE_HEIGHTS = {
    small: '1.5',
    normal: '1.65',
    large: '1.9',
    'very-large': '2.1',
} as const;

export default function AppShell({ children }: Props) {
    const settings = useAppStore(s => s.settings);

    useEffect(() => {
        if (!settings) return;
        const fontSize = CHAT_FONT_SIZES[settings.chatFontSize ?? 'normal'];
        const zoom = String((settings.uiScale ?? 100) / 100);
        const fontFamily = CHAT_FONT_FAMILIES[settings.chatFontFamily ?? 'serif'];
        const lineHeight = CHAT_LINE_HEIGHTS[settings.chatLineHeight ?? 'normal'];
        document.documentElement.style.setProperty('--ss-chat-font-size', fontSize);
        // zoom is supported in all modern browsers (Firefox 126+, May 2024)
        document.documentElement.style.setProperty('--ss-ui-zoom', zoom);
        document.documentElement.style.setProperty('--ss-chat-font-family', fontFamily);
        document.documentElement.style.setProperty('--ss-chat-line-height', lineHeight);
    }, [settings]);

    return (
        <div
            className="flex flex-col h-full bg-[#07050c] text-[#e8e0d4] overflow-hidden"
            style={{ zoom: 'var(--ss-ui-zoom, 1)' }}
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
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AppShell.tsx
git commit -m "Apply --ss-chat-font-family and --ss-chat-line-height CSS vars from AppShell"
```

---

## Task 3: Use CSS variables in ChatBubbles

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx:321-322` (assistant bubble)
- Modify: `frontend/src/components/ChatBubbles.tsx:495-496` (user bubble)

### Context

There are two message bubbles. Both have identical `fontFamily` and `lineHeight` style props that need to use the CSS variables. The lines to change are:

**Assistant bubble (around line 320-322):**
```ts
fontSize: 'var(--ss-chat-font-size, 14px)',
fontFamily: "'Lora', Georgia, serif",
lineHeight: 1.65,
```

**User bubble (around line 494-496):**
```ts
fontSize: 'var(--ss-chat-font-size, 14px)',
fontFamily: "'Lora', Georgia, serif",
lineHeight: 1.65,
```

- [ ] **Step 1: Update assistant bubble fontFamily and lineHeight**

In `frontend/src/components/ChatBubbles.tsx`, find the assistant bubble style block (the one with `borderRadius: '4px 20px 20px 20px'`). Replace:

```ts
fontFamily: "'Lora', Georgia, serif",
lineHeight: 1.65,
```

With:

```ts
fontFamily: "var(--ss-chat-font-family, 'Lora', Georgia, serif)",
lineHeight: 'var(--ss-chat-line-height, 1.65)',
```

- [ ] **Step 2: Update user bubble fontFamily and lineHeight**

In `frontend/src/components/ChatBubbles.tsx`, find the user bubble style block (the one with `borderRadius: '20px 4px 20px 20px'`). Replace:

```ts
fontFamily: "'Lora', Georgia, serif",
lineHeight: 1.65,
```

With:

```ts
fontFamily: "var(--ss-chat-font-family, 'Lora', Georgia, serif)",
lineHeight: 'var(--ss-chat-line-height, 1.65)',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Use --ss-chat-font-family and --ss-chat-line-height CSS vars in ChatBubbles"
```

---

## Task 4: Grow the chat textarea

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx:131` (handleInputChange)
- Modify: `frontend/src/components/ChatPage.tsx:778` (textarea style)

### Context

`handleInputChange` at line 131 currently caps height at 160 px:
```ts
e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
```

The textarea element at line 778 has `overflow: 'hidden'`.

The textarea also uses a hardcoded `fontFamily: "'Lora', Georgia, serif"` (line 775) which should use the CSS variable so it matches the chat bubbles.

- [ ] **Step 1: Update handleInputChange to use 50 vh cap**

In `frontend/src/components/ChatPage.tsx`, replace line 131:

```ts
e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
```

With:

```ts
e.target.style.height = `${Math.min(e.target.scrollHeight, window.innerHeight * 0.5)}px`;
```

- [ ] **Step 2: Update textarea style**

In `frontend/src/components/ChatPage.tsx`, find the `<textarea>` style object (around line 768). Replace:

```ts
fontFamily: "'Lora', Georgia, serif",
lineHeight: 1.6,
resize: 'none',
overflow: 'hidden',
```

With:

```ts
fontFamily: "var(--ss-chat-font-family, 'Lora', Georgia, serif)",
lineHeight: 1.6,
resize: 'none',
overflow: 'auto',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatPage.tsx
git commit -m "Grow chat textarea to 50vh max, use CSS var for font family"
```

---

## Task 5: Display settings UI — Font Family and Line Height sections

**Files:**
- Modify: `frontend/src/components/SettingsPage.tsx:31` (updateDisplay signature)
- Modify: `frontend/src/components/SettingsPage.tsx:126-186` (Display tab JSX)

### Context

The `updateDisplay` function signature at line 31 currently restricts to only `chatFontSize` and `uiScale`:

```ts
const updateDisplay = (patch: Partial<Pick<AppSettings, 'chatFontSize' | 'uiScale'>>) => {
```

The Display tab renders between lines 126-185. It uses `labelStyle` and `hintStyle` constants defined at the bottom of the file. The pill-button pattern to follow is the existing `chatFontSize` section.

- [ ] **Step 1: Extend updateDisplay to include new fields**

Replace line 31:

```ts
const updateDisplay = (patch: Partial<Pick<AppSettings, 'chatFontSize' | 'uiScale'>>) => {
```

With:

```ts
const updateDisplay = (patch: Partial<Pick<AppSettings, 'chatFontSize' | 'uiScale' | 'chatFontFamily' | 'chatLineHeight'>>) => {
```

- [ ] **Step 2: Add Font Family and Line Height sections to the Display tab**

Replace the closing `</div>` of the display tab (after the UI Scale section, line ~184-186):

```tsx
                        <p style={hintStyle}>Scales the entire UI. Applies immediately.</p>
                    </div>
                </div>
            )}
```

With:

```tsx
                        <p style={hintStyle}>Scales the entire UI. Applies immediately.</p>
                    </div>

                    {/* Font Family */}
                    <div>
                        <label style={labelStyle}>Chat Font</label>
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                            {(['serif', 'sans-serif'] as const).map(family => (
                                <button
                                    key={family}
                                    onClick={() => updateDisplay({ chatFontFamily: family })}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: (settings.chatFontFamily ?? 'serif') === family ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: (settings.chatFontFamily ?? 'serif') === family ? '#ffffff' : 'rgba(255,255,255,0.4)',
                                        fontSize: 12,
                                        letterSpacing: '0.08em',
                                        fontFamily: "'Courier New', monospace",
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {family === 'serif' ? 'Serif' : 'Sans-Serif'}
                                </button>
                            ))}
                        </div>
                        <p style={hintStyle}>Applies to chat messages and the input box.</p>
                    </div>

                    {/* Line Height */}
                    <div>
                        <label style={labelStyle}>Line Spacing</label>
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
                            {(['small', 'normal', 'large', 'very-large'] as const).map(lh => (
                                <button
                                    key={lh}
                                    onClick={() => updateDisplay({ chatLineHeight: lh })}
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: (settings.chatLineHeight ?? 'normal') === lh ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: (settings.chatLineHeight ?? 'normal') === lh ? '#ffffff' : 'rgba(255,255,255,0.4)',
                                        fontSize: 12,
                                        letterSpacing: '0.08em',
                                        fontFamily: "'Courier New', monospace",
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {lh === 'normal' ? 'Normal' : lh === 'very-large' ? 'XL' : lh.charAt(0).toUpperCase() + lh.slice(1)}
                                </button>
                            ))}
                        </div>
                        <p style={hintStyle}>Applies to chat messages only. Normal = 1.65, Large = 1.9, XL = 2.1.</p>
                    </div>
                </div>
            )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start dev server and verify visually**

```bash
cd frontend && pnpm dev
```

Open the app, go to Settings → Display. Verify:
- "Chat Font" section shows two pills: Serif / Sans-Serif. Clicking switches the font in chat bubbles and the input box immediately.
- "Line Spacing" section shows four pills: Small / Normal / Large / XL. Clicking changes line height in chat bubbles immediately.
- Existing sections (Chat Font Size, UI Scale) still work.
- In a chat: type several lines and verify the textarea grows beyond 4 lines, up to approximately half the viewport height, then becomes scrollable.
- All settings persist after page reload.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SettingsPage.tsx
git commit -m "Add font family and line spacing selectors to Display settings"
```
