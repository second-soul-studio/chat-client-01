# UI Feedback — Group 1: Chat UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the chat experience with CoT streaming, copy/regenerate buttons, code block rendering, width constraint, custom scrollbar, and more visible input buttons.

**Architecture:** All changes are in the frontend (`frontend/`) and touch the API service (add thinking callbacks), the Zustand store (new streaming-thinking state), and the chat components (ChatBubbles, ChatPage). A new `CodeBlock` component is introduced for syntax-highlighted code blocks.

**Tech Stack:** React 19, TypeScript, Vite, Zustand, `react-syntax-highlighter` (new), `react-markdown` (existing), `react-router` v7

**Note on testing:** This project has no automated test suite. Each task ends with a TypeScript check (`cd frontend && pnpm build`) and a manual browser verification step instead of unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/CodeBlock.tsx` | Terminal-style code block with syntax highlighting and copy button |
| Modify | `frontend/src/services/api.ts` | Add `onThinkingChunk` callback to both stream readers |
| Modify | `frontend/src/stores/appStore.ts` | Add `streamingThinking`, `thinkingBlockOpen`, and related actions |
| Modify | `frontend/src/components/ChatBubbles.tsx` | ThinkingBlock streaming, copy buttons, regenerate button |
| Modify | `frontend/src/components/ChatPage.tsx` | Wire up all new features and layout changes |

---

### Task 1: Install react-syntax-highlighter

**Files:**
- Modify: `frontend/package.json` (via pnpm)

- [ ] **Step 1: Install the package**

```bash
cd frontend && pnpm add react-syntax-highlighter @types/react-syntax-highlighter
```

- [ ] **Step 2: Verify TypeScript build still passes**

```bash
cd frontend && pnpm build
```

Expected: build succeeds (zero new errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "Add react-syntax-highlighter for code block rendering"
```

---

### Task 2: Create CodeBlock component

**Files:**
- Create: `frontend/src/components/CodeBlock.tsx`

- [ ] **Step 1: Create the file with the following content**

The component takes `language`, `code`, and `accentColor` props. It renders a terminal-style header (persona colour, language label, copy button) above a `SyntaxHighlighter` block using the `oneDark` theme.

Key implementation points:
- Import `Prism as SyntaxHighlighter` from `react-syntax-highlighter`
- Import `oneDark` from `react-syntax-highlighter/dist/esm/styles/prism`
- `useState(false)` for `copied` state; set to `true` on click, reset after 1500ms via `setTimeout`
- Header `div`: `background: ${accentColor}0e`, `borderBottom: 1px solid ${accentColor}22`
- Language `span`: `fontSize: 9`, uppercase, monospace, persona colour, `opacity: 0.8`
- Copy `button`: transparent background, `border: 1px solid ${accentColor}33`, changes to colour when copied
- `SyntaxHighlighter`: `customStyle={{ margin: 0, borderRadius: 0, fontSize: 12.5, background: '#0d0a14', padding: '14px 16px' }}`
- Outer wrapper: `borderRadius: 8`, `overflow: 'hidden'`, `border: 1px solid ${accentColor}22`

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CodeBlock.tsx
git commit -m "Add CodeBlock component with syntax highlighting and copy button"
```

---

### Task 3: Add onThinkingChunk callbacks to api.ts

**Files:**
- Modify: `frontend/src/services/api.ts`

The goal is to thread a second streaming callback `onThinkingChunk: (thinking: string) => void` from the public `sendMessage` interface all the way down to the two stream readers. Each reader already accumulates `fullThinking` internally — they just need to call the callback when that accumulation grows.

- [ ] **Step 1: Add `onThinkingChunk` to `SendMessageOptions`** (line 59)

```typescript
onChunk?: (content: string) => void;
onThinkingChunk?: (thinking: string) => void;
```

- [ ] **Step 2: Destructure and forward in `sendMessage`**

In `sendMessage`, destructure `onThinkingChunk` alongside `onChunk`. Pass it to both `sendAnthropicMessage` and `sendOpenAIMessage` calls.

- [ ] **Step 3: Add `onThinkingChunk` to `OpenAIAdapterOptions`**

Add the optional field after `onChunk`. In `sendOpenAIMessage`, pass it as the third argument to `readStream`.

- [ ] **Step 4: Add `onThinkingChunk` to `AnthropicAdapterOptions`**

Same pattern. In `sendAnthropicMessage`, pass it as the third argument to `readAnthropicStream`.

- [ ] **Step 5: Update `readStream` signature and call site**

```typescript
async function readStream(
    body: ReadableStream,
    onChunk: (content: string) => void,
    onThinkingChunk?: (thinking: string) => void,
): Promise<{ content: string; thinking?: string }>
```

Inside the loop, after `fullThinking += reasoning`, add:
```typescript
onThinkingChunk?.(fullThinking);
```

- [ ] **Step 6: Update `readAnthropicStream` signature and call site**

Same signature pattern. After `thinkingContent += delta.thinking`, add:
```typescript
onThinkingChunk?.(thinkingContent);
```

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "Add onThinkingChunk streaming callback to both API adapters"
```

---

### Task 4: Extend Zustand store with thinking-stream state

**Files:**
- Modify: `frontend/src/stores/appStore.ts`

- [ ] **Step 1: Add to the `AppState` interface**

After the existing active-chat section (around line 54):

```typescript
// ─── Thinking Stream ──────────────────────────────────────────────────────────
streamingThinking: string;
thinkingBlockOpen: boolean;
updateStreamingThinking: (thinking: string) => void;
setThinkingBlockOpen: (open: boolean) => void;
removeLastAssistantMessage: () => void;
```

- [ ] **Step 2: Add initial values** in the `create` call

```typescript
streamingThinking: '',
thinkingBlockOpen: false,
```

- [ ] **Step 3: Add `updateStreamingThinking`** after `setIsStreaming`

```typescript
updateStreamingThinking(thinking) {
    set({ streamingThinking: thinking });
},
```

- [ ] **Step 4: Add `setThinkingBlockOpen`**

```typescript
setThinkingBlockOpen(open) {
    set({ thinkingBlockOpen: open });
},
```

- [ ] **Step 5: Add `removeLastAssistantMessage`**

```typescript
removeLastAssistantMessage() {
    set(s => {
        if (!s.activeChat) return s;
        const messages = [...s.activeChat.messages];
        if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            messages.pop();
        }
        return { activeChat: { ...s.activeChat, messages } };
    });
},
```

- [ ] **Step 6: Clear `streamingThinking` in `finaliseMessage`**

Immediately after the first `set(s => { ... })` call in `finaliseMessage`, add:

```typescript
set({ streamingThinking: '' });
```

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/appStore.ts
git commit -m "Add streaming thinking state and removeLastAssistantMessage to store"
```

---

### Task 5: Update ThinkingBlock for live streaming

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx` (lines 31–125)

- [ ] **Step 1: Update `ThinkingBlock` props**

New signature:
```typescript
export function ThinkingBlock({
    thinking, color, isStreaming, initialOpen, onToggle,
}: {
    thinking: string;
    color: string;
    isStreaming?: boolean;
    initialOpen?: boolean;
    onToggle?: (open: boolean) => void;
})
```

Change `useState(false)` to `useState(initialOpen ?? false)`.

Add `thinking` to the deps array of the `useEffect` that sets height:
```typescript
}, [open, thinking]);
```
This ensures height updates as streaming text grows.

- [ ] **Step 2: Update the toggle click handler**

```typescript
onClick={() => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
}}
```

- [ ] **Step 3: Replace the "Gedanken" label area with a streaming-aware version**

Replace the two `<span>` elements that show "Gedanken" and "▼" with:

```tsx
{isStreaming && !open ? (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
            <div key={i} style={{
                width: 4, height: 4, borderRadius: '50%', background: color,
                animation: 'typingBounce 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`, opacity: 0.7,
            }} />
        ))}
    </div>
) : (
    <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: "'Courier New', monospace", color: open ? color : 'rgba(255,255,255,0.3)', transition: 'color 0.2s' }}>
        Gedanken
    </span>
)}
<span style={{ fontSize: 8, color: open ? color : 'rgba(255,255,255,0.2)', transition: 'transform 0.25s ease, color 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', marginLeft: 2 }}>
    ▼
</span>
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Update ThinkingBlock with pulsing collapsed state and live streaming text"
```

---

### Task 6: Update AssistantBubble — CodeBlock in markdown, streaming thinking props

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx` (AssistantBubble section)

- [ ] **Step 1: Add import for CodeBlock**

```typescript
import { CodeBlock } from './CodeBlock';
```

- [ ] **Step 2: Update `AssistantBubble` props**

```typescript
export function AssistantBubble({
    message, persona, isStreaming, streamingThinking, thinkingBlockOpen, onThinkingToggle,
}: {
    message: Message;
    persona: Persona;
    isStreaming?: boolean;
    streamingThinking?: string;
    thinkingBlockOpen?: boolean;
    onThinkingToggle?: (open: boolean) => void;
})
```

- [ ] **Step 3: Update ThinkingBlock rendering condition**

Replace the current condition that shows `ThinkingBlock` with:

```tsx
{persona.showThinking && (!!message.thinking || (isStreaming && !!streamingThinking)) && (
    <ThinkingBlock
        thinking={isStreaming ? (streamingThinking ?? '') : (message.thinking ?? '')}
        color={persona.color}
        isStreaming={isStreaming}
        initialOpen={thinkingBlockOpen}
        onToggle={onThinkingToggle}
    />
)}
```

- [ ] **Step 4: Add custom `components` prop to `ReactMarkdown`** for code block handling

Replace the `<ReactMarkdown>{message.content}</ReactMarkdown>` with a version that has a custom `code` renderer. The renderer checks if `className` contains `language-*` (fenced block) or not (inline code):

- Fenced blocks: render `<CodeBlock language={lang} code={code} accentColor={persona.color} />`
- Inline code: render a styled `<code>` element with subtle background and persona colour text

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Wire CodeBlock into markdown renderer and thread streaming thinking through AssistantBubble"
```

---

### Task 7: Add copy buttons to both bubble types

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx`

- [ ] **Step 1: Add copy functionality to `AssistantBubble`**

Inside `AssistantBubble`, add:
```typescript
const [copied, setCopied] = useState(false);
const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
};
```

Add `position: 'relative'` to the bubble `div`. Add a copy button overlay inside it (bottom-right, `position: 'absolute'`):
- Shows `⎘` normally, `✓` when copied
- Border changes to persona colour when copied
- Hidden during streaming (`!isStreaming && (...)`)

- [ ] **Step 2: Add copy functionality to `UserBubble`**

Same pattern. Add `copied` state and `handleCopy` handler. Add `position: 'relative'` to the bubble `div`. Add the same copy button overlay using `accentColor` instead of `persona.color`.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Add copy buttons to user and assistant message bubbles"
```

---

### Task 8: Add regenerate button to last UserBubble

**Files:**
- Modify: `frontend/src/components/ChatBubbles.tsx`

- [ ] **Step 1: Add new props to `UserBubble`**

```typescript
export function UserBubble({
    message, accentColor, isLast, onRegenerate, regenerateDisabled,
}: {
    message: Message;
    accentColor: string;
    isLast?: boolean;
    onRegenerate?: () => void;
    regenerateDisabled?: boolean;
})
```

- [ ] **Step 2: Add regenerate button**

Change the outer wrapper `div` to `display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 8`.

Render the regenerate button before the bubble container when `isLast && onRegenerate`:
```tsx
{isLast && onRegenerate && (
    <button
        onClick={onRegenerate}
        disabled={regenerateDisabled}
        title="Regenerate response"
        style={{
            alignSelf: 'center',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '6px 8px',
            color: regenerateDisabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)',
            fontSize: 16,
            cursor: regenerateDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            flexShrink: 0,
        }}
        aria-label="Regenerate"
    >
        ↺
    </button>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatBubbles.tsx
git commit -m "Add regenerate button to last user message bubble"
```

---

### Task 9: Wire up ChatPage — streaming thinking, regenerate, new props

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx`

- [ ] **Step 1: Destructure new store fields**

Add to `useAppStore()` destructuring:
```typescript
streamingThinking, updateStreamingThinking,
thinkingBlockOpen, setThinkingBlockOpen,
removeLastAssistantMessage,
```

- [ ] **Step 2: Extract `doSend` helper from `handleSend`**

`doSend` must be wrapped in `useCallback` with its full dependency array (all store actions and state it closes over), otherwise `handleRegenerate` will capture a stale closure. Both `handleSend` and `handleRegenerate` depend on `doSend`, so they too need it in their deps.

Pull the API-call logic out of `handleSend` into a `doSend(content: string, priorMessages: Message[])` callback that:
1. Resolves model + provider (with error if missing)
2. Adds a blank assistant message placeholder
3. Sets `isStreaming(true)`
4. Calls `sendMessage` with `onChunk: updateLastAssistantMessage` and `onThinkingChunk: updateStreamingThinking`
5. Calls `finaliseMessage` on success
6. Handles errors with `setError`
7. Sets `isStreaming(false)` in finally

`handleSend` then just builds the user message, clears input, calls `addMessage`, and awaits `doSend`.

- [ ] **Step 3: Add `handleRegenerate`**

```typescript
const handleRegenerate = useCallback(async () => {
    if (isStreaming || !activeChat) return;
    const msgs = activeChat.messages;
    const lastUserIdx = msgs.findLastIndex(m => m.role === 'user');
    if (lastUserIdx === -1) return;
    setError(null);
    removeLastAssistantMessage();
    await doSend(msgs[lastUserIdx].content, msgs.slice(0, lastUserIdx + 1));
}, [isStreaming, activeChat, removeLastAssistantMessage, doSend]);
```

- [ ] **Step 4: Pass new props to `AssistantBubble`**

```tsx
<AssistantBubble
    key={msg.id}
    message={msg}
    persona={persona}
    isStreaming={isStreaming && isLastAssistant}
    streamingThinking={isStreaming && isLastAssistant ? streamingThinking : undefined}
    thinkingBlockOpen={thinkingBlockOpen}
    onThinkingToggle={setThinkingBlockOpen}
/>
```

- [ ] **Step 5: Pass new props to `UserBubble`**

Before the messages map, compute:
```typescript
const lastUserMessageId = [...messages].reverse().find(m => m.role === 'user')?.id;
```

```tsx
<UserBubble
    key={msg.id}
    message={msg}
    accentColor={persona.color}
    isLast={msg.id === lastUserMessageId}
    onRegenerate={handleRegenerate}
    regenerateDisabled={isStreaming}
/>
```

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 7: Manual verification in browser**

Start `pnpm dev`. With a CoT-capable model:
- [ ] Thinking block pulses while collapsed during streaming
- [ ] Thinking block streams text live when open
- [ ] Next block opens in same state as last toggle
- [ ] ↺ button appears on last user message, clicking regenerates
- [ ] Copy buttons appear on both bubble types

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ChatPage.tsx
git commit -m "Wire streaming thinking, regenerate, and new bubble props in ChatPage"
```

---

### Task 10: Chat layout — width constraint, scrollbar, button redesign

**Files:**
- Modify: `frontend/src/components/ChatPage.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add global scrollbar CSS to index.css**

```css
.chat-scroll::-webkit-scrollbar {
    width: 4px;
}
.chat-scroll::-webkit-scrollbar-track {
    background: transparent;
}
.chat-scroll::-webkit-scrollbar-thumb {
    border-radius: 2px;
    background: var(--scrollbar-thumb, rgba(255,255,255,0.15));
}
.chat-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(255,255,255,0.3));
}
```

- [ ] **Step 2: Apply scrollbar styles to the messages scroll container**

Replace the messages outer `div` style. Add `className="chat-scroll"`, `scrollbarWidth: 'thin'`, `scrollbarColor`, and the CSS custom properties:

```tsx
<div
    className="chat-scroll"
    style={{
        flex: 1,
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: `${persona.color}66 transparent`,
        '--scrollbar-thumb': `${persona.color}66`,
        '--scrollbar-thumb-hover': `${persona.color}bb`,
    } as React.CSSProperties}
>
```

- [ ] **Step 3: Add width constraint to messages content**

Inside the scroll container, wrap all message content in an inner `div`:

```tsx
<div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
    {/* ...messages, error, messagesEndRef... */}
</div>
```

Remove the `padding` and `gap` from the outer scroll container.

- [ ] **Step 4: Add width constraint to input area**

In the input footer, wrap the existing inner content with:
```tsx
<div style={{ maxWidth: 800, margin: '0 auto' }}>
    {/* existing input row */}
</div>
```

- [ ] **Step 5: Redesign input buttons with mini-labels**

Wrap each button (CoT toggle + send) in a `flex-direction: column` container with a `<span>` label below. Change button `borderRadius` from `'50%'` to `12`. Change button `height` to 30px. Change outer input row's `alignItems` from `'flex-end'` to `'center'`.

CoT toggle wrapper:
```tsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
    <button ...existing but borderRadius: 12, height: 30... />
    <span style={{ fontSize: 7, fontFamily: "'Courier New', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', color: thinkingEnabled ? persona.color : 'rgba(255,255,255,0.2)', transition: 'color 0.2s' }}>think</span>
</div>
```

Send button wrapper:
```tsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
    <button ...existing but borderRadius: 12, height: 30... />
    <span style={{ fontSize: 7, fontFamily: "'Courier New', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>send</span>
</div>
```

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && pnpm build
```

- [ ] **Step 7: Manual verification in browser**

- [ ] Messages centre at max 800px with side margins on wide screens
- [ ] Scrollbar shows in persona colour (visible on long chats)
- [ ] "think" and "send" labels appear below the buttons
- [ ] Buttons are rounded-rectangle shape

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ChatPage.tsx frontend/src/index.css
git commit -m "Add chat width constraint, persona-coloured scrollbar, and labelled input buttons"
```
