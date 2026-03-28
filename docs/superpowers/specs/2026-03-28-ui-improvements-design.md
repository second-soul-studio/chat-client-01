# UI Improvements Design

**Date:** 2026-03-28
**Status:** Approved

## Overview

Four targeted UI improvements to the Second Soul chat client:

1. Clickable avatar in the chat header
2. Unified per-persona page with three tabs
3. Better bottom navigation visibility
4. Rename "Archive" to "Delete" in persona context menu

---

## 1. Clickable Avatar in Chat Header

**File:** `frontend/src/components/ChatPage.tsx` (~line 507)

The avatar `<div>` in the chat header is converted to a `<button>`. On click it navigates to `/persona/:personaId` (the new unified persona page).

Visual behaviour:
- `cursor: pointer`
- On hover: subtle scale-up (e.g. `scale(1.08)`) and slightly brighter border glow
- Transition: `all 0.2s ease`

No other behaviour changes to the header.

---

## 2. Unified Persona Page (`/persona/:personaId`)

**New file:** `frontend/src/components/PersonaPage.tsx`

Replaces the existing `MemoryPage` (`/memory/:personaId`). The old route is removed from `App.tsx` and replaced with the new one.

### Route

`/persona/:personaId` — renders `PersonaPage`

### Tabs

| Tab | Label | Content |
|-----|-------|---------|
| `persona` | Persona | Inline persona edit form (content from `PersonaFormModal`, no modal wrapper) |
| `history` | History | Existing history tab content from `MemoryPage` |
| `memories` | Memories | Existing memories tab content from `MemoryPage` |

Default tab: `persona` (or driven by `?tab=` query param).

### Persona Tab

The persona edit form is rendered inline inside the tab — not as a modal. The form content is extracted from `PersonaFormModal` and rendered directly. The cancel/close button is replaced by a back-navigation (e.g. back to previous route or `/`).

### Navigation Updates

All existing references to `/memory/:personaId` are updated:

| Location | Old | New |
|----------|-----|-----|
| `BottomNav.tsx` — History button while in chat | `/memory/:id?tab=history` | `/persona/:id?tab=history` |
| `PersonaCard.tsx` — "Nostalgia" menu item | `/memory/:id` | `/persona/:id` |
| `ChatPage.tsx` — Memory badge button | `/persona/:personaId/memory` | `/persona/:id` |

---

## 3. Bottom Navigation Visibility

**File:** `frontend/src/components/BottomNav.tsx`

| Property | Before | After |
|----------|--------|-------|
| Label font size | `text-[9px]` | `text-[11px]` |
| Inactive item opacity | `0.35` | `0.6` |
| Inactive label colour | `rgba(255,255,255,0.4)` | `rgba(255,255,255,0.7)` |

Active item styling (gold colour, opacity 1) remains unchanged.

---

## 4. "Archive" → "Delete" in Persona Context Menu

**File:** `frontend/src/components/PersonaCard.tsx`

| Property | Before | After |
|----------|--------|-------|
| Icon | `⊹` | `✕` |
| Label | `Archive` | `Delete` |
| Sub-label | `saved moments` | `remove persona` |

The two-step confirm flow and the underlying `removePersona` call remain unchanged.
