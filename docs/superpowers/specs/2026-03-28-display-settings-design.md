# Display Settings — Design Spec

Date: 2026-03-28

## Overview

Add two display preference settings to Second Soul: chat message font size and UI scale. Both are stored in `AppSettings`, applied via CSS custom properties, and exposed in a new "Display" tab in `SettingsPage`.

## Data Model

Two new fields on `AppSettings` (`src/types/index.ts`):

```ts
chatFontSize: 'normal' | 'large' | 'very-large';  // default: 'normal'
uiScale: 100 | 110 | 120 | 130;                    // default: 100
```

Defaults are set in `db.ts` alongside existing setting defaults. No migration needed — missing fields fall back to defaults on load.

## CSS Custom Properties

`AppShell.tsx` gains a `useEffect` that watches `settings` and writes two CSS variables to `document.documentElement`:

| Variable              | normal | large | very-large |
|-----------------------|--------|-------|------------|
| `--ss-chat-font-size` | 14px   | 16px  | 19px       |

| Variable       | 100  | 110  | 120  | 130  |
|----------------|------|------|------|------|
| `--ss-ui-zoom` | 1.0  | 1.1  | 1.2  | 1.3  |

The root container div in `AppShell` gets `zoom: var(--ss-ui-zoom)`.

`ChatBubbles.tsx` replaces hardcoded `fontSize: 14` and `fontSize: 14.5` values (message body text) with `fontSize: 'var(--ss-chat-font-size)'`. Structural/UI font sizes (e.g. persona name at 16px) are left untouched.

## Settings UI

A new **"Display"** tab is added to `SettingsPage.tsx`, positioned between "Global" and "Tools".

The tab contains two sections, each rendered as a row of discrete buttons matching the existing tab-switcher style:

**Chat Font Size**
```
[ Normal ]  [ Large ]  [ Very Large ]
```

**UI Scale**
```
[ 100% ]  [ 110% ]  [ 120% ]  [ 130% ]
```

Active button: `background: rgba(255,255,255,0.1)`, `color: #ffffff`
Inactive button: `background: transparent`, `color: rgba(255,255,255,0.4)`

## Files to Change

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `chatFontSize` and `uiScale` to `AppSettings` |
| `src/services/db.ts` | Add defaults for both fields |
| `src/components/AppShell.tsx` | `useEffect` to set CSS vars; `zoom` on root div |
| `src/components/SettingsPage.tsx` | Add "Display" tab with button groups |
| `src/components/ChatBubbles.tsx` | Replace hardcoded message body font sizes with CSS var |
