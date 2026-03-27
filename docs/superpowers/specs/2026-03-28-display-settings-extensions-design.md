# Display Settings Extensions — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

Three independent UI improvements:

1. Growing textarea in the chat input (expands with content, up to 50 % of viewport height)
2. Font family selector in Display settings (Lora serif vs Inter sans-serif)
3. Line height selector in Display settings (four steps)

All settings are persisted in IndexedDB via `AppSettings` and applied as CSS custom properties by `AppShell`.

---

## 1. Growing Textarea

**Goal:** The chat input box grows as the user types, up to half the viewport height — similar to Claude.ai. Beyond that limit it becomes scrollable.

**Current behaviour:** `handleInputChange` caps height at `160px` (≈ 4 lines). `overflow` is permanently `hidden`.

**Changes:**
- Replace the hard-coded `160` cap with `window.innerHeight * 0.5`.
- Switch `overflow` from `hidden` to `auto` so the textarea becomes scrollable when the cap is reached.
- On send / clear, reset height to `auto` as before (already implemented).

**Scope:** `ChatPage.tsx` only — two lines in `handleInputChange`, one style attribute on the `<textarea>`.

---

## 2. Font Family Setting

**New field in `AppSettings`:**

```ts
chatFontFamily: 'serif' | 'sans-serif'
```

**Default:** `'serif'` (preserves current behaviour — Lora).

**Font mapping:**

| Value | CSS value |
|---|---|
| `serif` | `'Lora', Georgia, serif` |
| `sans-serif` | `'Inter', system-ui, sans-serif` |

**CSS custom property:** `--ss-chat-font-family`
Set in `AppShell` alongside the existing `--ss-chat-font-size` and `--ss-ui-zoom`.

**Font loading:** Inter is added to the Google Fonts `<link>` in `index.html` (Lora is already loaded there).

**Consumers:**
- `ChatBubbles.tsx` — message body `fontFamily` (lines 321 and 495) → `var(--ss-chat-font-family)`
- `ChatPage.tsx` — textarea `fontFamily` → `var(--ss-chat-font-family)`

**Settings UI:** New section in the Display tab, same pill-button pattern used for font size and UI scale. Labels: "Serif" / "Sans-Serif".

---

## 3. Line Height Setting

**New field in `AppSettings`:**

```ts
chatLineHeight: 'small' | 'normal' | 'large' | 'very-large'
```

**Default:** `'normal'` (preserves current value of 1.65).

**Value mapping:**

| Key | Value |
|---|---|
| `small` | `1.5` |
| `normal` | `1.65` |
| `large` | `1.9` |
| `very-large` | `2.1` |

**CSS custom property:** `--ss-chat-line-height`
Set in `AppShell` as a unitless number string (e.g. `"1.65"`).

**Consumers:**
- `ChatBubbles.tsx` — message body `lineHeight` (lines 322 and 496) → `var(--ss-chat-line-height, 1.65)`

**Settings UI:** New section in the Display tab, same pill-button pattern. Labels: "Small" / "Normal" / "Large" / "Very Large".

---

## Affected Files

| File | Change |
|---|---|
| `frontend/src/types/index.ts` | Add `chatFontFamily` and `chatLineHeight` to `AppSettings` |
| `frontend/src/services/db.ts` | Add defaults: `chatFontFamily: 'serif'`, `chatLineHeight: 'normal'` |
| `frontend/src/components/AppShell.tsx` | Set `--ss-chat-font-family` and `--ss-chat-line-height` CSS vars |
| `frontend/src/components/ChatBubbles.tsx` | Use CSS vars for `fontFamily` and `lineHeight` on message bodies |
| `frontend/src/components/ChatPage.tsx` | Textarea: dynamic max-height (50 vh), `overflow: auto`, `fontFamily` via CSS var |
| `frontend/src/components/SettingsPage.tsx` | Display tab: add Font Family and Line Height sections; extend `updateDisplay` signature |
| `frontend/index.html` | Add Inter to Google Fonts `<link>` |

---

## Out of Scope

- Applying `chatFontFamily` to UI chrome (nav, labels, modals) — chat bubbles and input only.
- Applying `chatLineHeight` to the textarea — line height in the input is fine as-is.
- Adding more font options beyond Lora / Inter.
