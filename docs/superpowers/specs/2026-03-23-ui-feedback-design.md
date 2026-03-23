# UI Feedback — Design Spec
**Date:** 2026-03-23
**Status:** Approved
**Scope:** 11 user-facing improvements to the Second Soul frontend

---

## Overview

This spec covers 11 UI feedback items collected from multiple users of the Second Soul chat client. The changes are split into two independent implementation groups that can be built and merged separately.

---

## Group 1 — Chat UX (7 items)

### 1. CoT / Thinking Streaming

**Goal:** The chain-of-thought block should feel live, not appear as a completed dump after the response.

**Behaviour:**
- The `ThinkingBlock` component receives an `isStreaming` prop and a `thinking` string (the accumulated thinking text so far).
- When `isStreaming && !open`: show a pulsing animation inside the block header (replace the static "Gedanken" label with a pulsing indicator).
- When `isStreaming && open`: display the accumulated `thinking` text live as it grows.
- Both `readStream` (OpenAI/Ollama) and `readAnthropicStream` (Anthropic) in `api.ts` gain a second callback `onThinkingChunk: (thinking: string) => void`. This callback receives the **full accumulated thinking string** (not just the delta), mirroring how `onChunk` works for content. Both readers must be updated.
- The Zustand store adds a `streamingThinking` field (string) that is updated by `onThinkingChunk` via a new store action `updateStreamingThinking(thinking: string)`. This field is separate from `activeChat` messages so it does not interfere with the content stream. On `finaliseMessage`, `streamingThinking` is cleared and the value is written to the last assistant message's `thinking` field.

**Default open/closed state:**
- A `thinkingBlockOpen` boolean is stored in the Zustand store (not persisted to IndexedDB — session-level only).
- When a new thinking block starts streaming, its initial open/closed state equals the current value of `thinkingBlockOpen`.
- When the user toggles a thinking block, `thinkingBlockOpen` is updated.
- This mirrors the user's last interaction rather than always defaulting to closed (unlike Open WebUI).

### 2. Regenerate Button on User Messages

**Goal:** Allow re-sending the last user message to get a new response.

**Behaviour:**
- A regenerate button (`↺`) appears on hover, positioned to the right of the user bubble (outside the bubble, aligned with its top-right corner).
- Clicking regenerate: removes the last assistant message and re-sends the last user message through the normal `handleSend` flow.
- Only shown on the **last** user message in the conversation (regenerating an earlier message would invalidate all following messages, which is out of scope).
- Disabled while `isStreaming`.
- The Zustand store gets a new action `removeLastAssistantMessage()` that removes the final message from `activeChat.messages` if it has `role === 'assistant'`. `ChatPage` calls this before re-invoking `handleSend`.

### 3. Copy Buttons for Messages

**Goal:** One-click copy for both user and assistant messages.

**Behaviour:**
- A copy icon button appears on hover for both `UserBubble` and `AssistantBubble`.
- Copies `message.content` (raw Markdown, not rendered HTML) to the clipboard via `navigator.clipboard.writeText`.
- After clicking, the icon changes to a checkmark (✓) for 1.5 seconds, then reverts.
- Button position: bottom-right corner of the bubble (inside, overlay).

### 4. (Renumbered from #8) Button Visibility in Chat Input

**Goal:** The CoT toggle and send button are hard to discover.

**Design:**
- Both buttons get a slightly more prominent visual weight: squared border-radius (12px instead of 50%) to feel like buttons rather than circles.
- Mini-labels are added directly below each icon:
  - `✦` with label `think` (persona colour when active, muted when inactive)
  - `↑` with label `send`
- Labels are `7px`, monospace, uppercase, subtle.
- The button dimensions increase slightly to accommodate the label (height ~48px total for icon + label).
- The outer input container (`padding: '8px 8px 8px 16px'`) uses `align-items: center` instead of `align-items: flex-end` to keep the taller buttons vertically centred alongside the textarea.

### 5. (Renumbered from #9) Custom Persona-Coloured Scrollbar

**Goal:** The chat message list uses a styled scrollbar in the persona's accent colour.

**Implementation:**
- Applied via CSS custom properties on the messages container in `ChatPage`.
- Uses `::-webkit-scrollbar` pseudo-elements for Chromium-based browsers.
- Firefox fallback: `scrollbar-color: <thumb> <track>` (requires two values — e.g. `scrollbar-color: rgba(${r},${g},${b},0.4) transparent`).
- Scrollbar track: near-transparent dark; thumb: persona colour at 40% opacity, darkens on hover to 70%.
- Only applied to the chat messages scroll container, not globally.

### 6. (Renumbered from #10) Chat Width Constraint

**Goal:** Long lines on widescreen monitors are hard to read.

**Design:**
- The messages container gets `max-width: 800px; margin: 0 auto;` — matching Claude.ai's layout.
- The input area footer also gets the same `max-width: 800px; margin: 0 auto;` constraint so input and messages stay visually aligned.
- The chat header remains full-width (flush with the screen edges).

### 7. (Renumbered from #11) Code Block Rendering

**Goal:** Code blocks are visually distinct and easy to copy.

**Design — Terminal style with persona accent header:**
- Header bar with persona colour at low opacity (`${color}12` background, `${color}33` border-bottom).
- Language name displayed in the header, left-aligned, persona colour, monospace uppercase.
- Copy button right-aligned in the header; on click, shows "copied ✓" for 1.5 seconds.
- Code area: dark background, standard monospace font, horizontal scroll for long lines.
- Syntax highlighting via `react-syntax-highlighter` with the `oneDark` theme. This is simpler than `rehype-highlight` for this use-case because we need full control over the rendered DOM structure (the terminal header is outside the highlighter's output).

**Implementation note:** Add `react-syntax-highlighter` and `@types/react-syntax-highlighter` as dependencies. Pass a custom `components` prop to `ReactMarkdown` with a `code` renderer. To distinguish inline code from fenced blocks, check for the presence of a `language-*` class on the `className` prop (fenced blocks always have one; inline code does not). Inline code is rendered as a plain `<code>` element with subtle styling. Fenced blocks are wrapped in the terminal-style container with the accent header.

---

## Group 2 — Home & Navigation (4 items)

### 8. (Renumbered from #4) Merge Customise + Persona into One Form

**Goal:** "Customise" and "Persona" in the context menu currently open the same modal. They should be meaningful and distinct — but switching between two forms is friction.

**Design:**
- Remove the "Customise" menu item from `PersonaCard`'s `ContextMenu`. Keep "Persona" (index 2 in `MENU_ITEMS`) as the single entry point for editing.
- The `PersonaFormModal` becomes one scrollable form with clearly separated sections:
  1. **Identity** — Name, Tagline
  2. **Character** — System Prompt, Thinking defaults (`thinkingEnabled`, `showThinking`)
  3. **Appearance** — Accent colour picker, Gradient, Avatar URL
  4. **Model** — Provider/Model selection, Parameter overrides (temperature, top_p, max tokens)
- No tabs. User scrolls through all sections.
- Section headings are visually separated (small uppercase label + thin divider line).

### 9. (Renumbered from #5) Nostalgia → Filtered History

**Goal:** "Nostalgia" in the persona context menu should show past conversations with that persona specifically.

**Implementation:**
- Add route: `/history?persona=<personaId>` (query parameter, no new route needed).
- `HistoryPage` reads `useSearchParams()` and if a `persona` param is present, filters to show only that persona's chats.
- When the filter is active, a small pill/badge shows "Showing: [Persona Name]" with an × to clear the filter.
- In `PersonaCard`'s `ContextMenu`, the "Nostalgia" item navigates to `/history?persona=<id>`.

### 10. (Renumbered from #6) Card Interaction Redesign

**Goal:** The current card interaction is unintuitive — clicking the card opens a menu, and a separate button navigates to chat.

**New interaction:**
- Clicking **anywhere** on the persona card (except the hamburger button) navigates directly to `/chat/<personaId>`.
- The TALK button is replaced by a **hamburger button** of identical dimensions (same `padding: 8px 28px`, same border-radius and border style).
- The hamburger uses three horizontal lines (`18px × 1.5px`, persona colour, 5px gap).
- The hamburger `div` carries `data-menu="true"` (replacing the old `data-talk="true"` on the TALK button).
- The guard in `handleCardClick` changes to `(e.target as Element).closest('[data-menu]')` — if the click originated inside the hamburger, navigate is skipped.
- Clicking the hamburger itself calls `e.stopPropagation()` and sets `menuOpen(true)`.

### 11. (Renumbered from #7) Persona Drag & Drop Reordering

**Goal:** Users want to reorder their personas by dragging.

**Design:**
- Use `@dnd-kit/core` + `@dnd-kit/sortable`.
- The personas grid in `PersonasPage` becomes a `SortableContext` with `rectSortingStrategy`.
- Each `PersonaCard` is wrapped in a `useSortable` hook; a drag handle (subtle grip icon, `⠿`, visible on hover) is placed in the top-left corner of the card.
- On drag end, the new order is persisted to IndexedDB via the Zustand store (new `reorderPersonas(ids: string[])` action).
- **Persona limit removed:** `MAX_PERSONAS` constant is deleted. The `emptySlots` calculation in `PersonasPage` is replaced with `Math.max(0, 4 - personas.length)` (hardcoded `4` for the initial visual padding — this is purely cosmetic, not a limit).
- **Initial state:** When there are fewer than 4 personas, empty `AddPersonaCard` slots are shown to fill up to 4 (looks good on first use). Once 4+ real personas exist, no empty slots are shown.
- **Transform conflict:** `@dnd-kit/sortable` applies CSS transforms during drag. The existing `PersonaCard` hover transform (`translateY(-8px) scale(1.02)`) must be suppressed while a card is being dragged (`isDragging` flag from `useSortable`). When `isDragging`, the transform is set to the dnd-kit transform only.
- The `AddPersonaCard` ("+" card) is always rendered after all persona cards, never inside the sortable context (it is not draggable).

---

## Technical Dependencies

| Package | Purpose | Group |
|---------|---------|-------|
| `@dnd-kit/core` | Drag & drop core | 2 |
| `@dnd-kit/sortable` | Sortable preset | 2 |
| `@dnd-kit/utilities` | CSS transform helpers | 2 |
| `react-syntax-highlighter` | Syntax highlighting in code blocks | 1 |
| `@types/react-syntax-highlighter` | TypeScript types | 1 |

---

## Out of Scope

- Regenerate on non-last messages (would require conversation branching).
- Persistence of `thinkingBlockOpen` across app restarts (session-level only).
- Scrollbar styling in browsers that don't support `::-webkit-scrollbar` (Firefox uses `scrollbar-color` fallback, others get the default).
- Infinite scroll / pagination in HistoryPage.
