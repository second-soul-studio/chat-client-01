# Second Soul PWA — Build Playbook

> **Stack:** React + TypeScript + Vite · PWA · OpenAI-compatible API · IndexedDB  
> **Philosophy:** device-first, privacy-first, no mandatory backend  
> **Target:** 4 persona slots, multi-backend AI, rolling context window, chat persistence

---

## Project Bootstrap

```bash
npm create vite@latest second-soul -- --template react-ts
cd second-soul
npm install
npm install -D vite-plugin-pwa
npm install react-markdown zustand idb uuid
```

### Folder Structure (from day one)

```
src/
  components/       # UI components
  stores/           # Zustand state
  services/         # API, DB, storage
  types/            # TypeScript interfaces
  hooks/            # Custom hooks
public/
  icons/            # PWA icons (512x512, 192x192 minimum)
```

---

## Phase 1 — Core App

**Goal:** Working chat app with the existing UI, one API backend, persona slots, settings persistence.  
**Estimated effort:** 1–2 days

### 1.1 Types

```typescript
// src/types/index.ts

export interface Persona {
  id: string;                    // uuid
  name: string;
  tagline: string;
  avatarUrl: string | null;      // base64 or blob URL from user upload
  color: string;                 // accent hex
  systemPrompt: string;          // persona-specific, appended to global
  online: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  personaId: string;
  title: string;                 // auto-generated from first message
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface ApiConfig {
  provider: string;              // display name, e.g. "nano-gpt"
  baseUrl: string;               // e.g. https://nano-gpt.com/v1
  apiKey: string;
  model: string;
  maxContextTokens: number;      // user-configurable, no API standard for this
  temperature: number;
  topP: number;
  maxTokens: number;             // max tokens per response
}

export interface AppSettings {
  globalSystemPrompt: string;
  api: ApiConfig;
  theme: 'dark';                 // future: light
}
```

### 1.2 IndexedDB Setup

```typescript
// src/services/db.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface SecondSoulDB extends DBSchema {
  chats: {
    key: string;
    value: Chat;
    indexes: { 'by-persona': string; 'by-updated': number };
  };
  personas: {
    key: string;
    value: Persona;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
}

let db: IDBPDatabase<SecondSoulDB>;

export async function getDB() {
  if (!db) {
    db = await openDB<SecondSoulDB>('second-soul', 1, {
      upgrade(db) {
        const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
        chatStore.createIndex('by-persona', 'personaId');
        chatStore.createIndex('by-updated', 'updatedAt');
        db.createObjectStore('personas', { keyPath: 'id' });
        db.createObjectStore('settings');
      },
    });
  }
  return db;
}

// Convenience helpers
export async function saveChat(chat: Chat) {
  const db = await getDB();
  await db.put('chats', { ...chat, updatedAt: Date.now() });
}

export async function getChatsForPersona(personaId: string): Promise<Chat[]> {
  const db = await getDB();
  return db.getAllFromIndex('chats', 'by-persona', personaId);
}

export async function getSettings(): Promise<AppSettings | undefined> {
  const db = await getDB();
  return db.get('settings', 'main');
}

export async function saveSettings(settings: AppSettings) {
  const db = await getDB();
  await db.put('settings', settings, 'main');
}

export async function getPersonas(): Promise<Persona[]> {
  const db = await getDB();
  return db.getAll('personas');
}

export async function savePersona(persona: Persona) {
  const db = await getDB();
  await db.put('personas', persona);
}

export async function deletePersona(id: string) {
  const db = await getDB();
  await db.delete('personas', id);
}
```

> **Note:** Install idb: `npm install idb`

### 1.3 Zustand Stores

```typescript
// src/stores/appStore.ts
import { create } from 'zustand';
import { AppSettings, Persona, Chat, Message } from '../types';
import { saveSettings, saveChat, savePersona } from '../services/db';

interface AppState {
  settings: AppSettings | null;
  personas: Persona[];
  activePersonaId: string | null;
  activeChat: Chat | null;
  isLoading: boolean;

  setSettings: (s: AppSettings) => void;
  setPersonas: (p: Persona[]) => void;
  setActivePersona: (id: string) => void;
  setActiveChat: (chat: Chat | null) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;   // for streaming
  persistChat: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  personas: [],
  activePersonaId: null,
  activeChat: null,
  isLoading: false,

  setSettings: async (settings) => {
    set({ settings });
    await saveSettings(settings);
  },

  setPersonas: (personas) => set({ personas }),

  setActivePersona: (id) => set({ activePersonaId: id }),

  setActiveChat: (chat) => set({ activeChat: chat }),

  addMessage: (message) => {
    const { activeChat } = get();
    if (!activeChat) return;
    const updated = {
      ...activeChat,
      messages: [...activeChat.messages, message],
    };
    set({ activeChat: updated });
  },

  updateLastMessage: (content) => {
    const { activeChat } = get();
    if (!activeChat) return;
    const messages = [...activeChat.messages];
    messages[messages.length - 1] = {
      ...messages[messages.length - 1],
      content,
    };
    set({ activeChat: { ...activeChat, messages } });
  },

  persistChat: async () => {
    const { activeChat } = get();
    if (activeChat) await saveChat(activeChat);
  },
}));
```

### 1.4 API Service

```typescript
// src/services/api.ts
import { Message, ApiConfig, AppSettings, Persona } from '../types';

// Estimate token count (rough: 1 token ≈ 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Build rolling window: keep messages within token budget
function buildContextWindow(
  messages: Message[],
  maxTokens: number,
  systemPrompt: string
): Message[] {
  const systemTokens = estimateTokens(systemPrompt);
  let budget = maxTokens - systemTokens - 500; // reserve 500 for response
  const result: Message[] = [];

  // Walk backwards, newest first
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content);
    if (budget - tokens < 0) break;
    budget -= tokens;
    result.unshift(messages[i]);
  }

  return result;
}

export async function sendMessage(
  messages: Message[],
  settings: AppSettings,
  persona: Persona,
  onChunk?: (delta: string) => void
): Promise<string> {
  const { api, globalSystemPrompt } = settings;

  // Combine global + persona system prompts
  const systemPrompt = [globalSystemPrompt, persona.systemPrompt]
    .filter(Boolean)
    .join('\n\n');

  // Apply rolling window
  const contextMessages = buildContextWindow(
    messages.filter(m => m.role !== 'system'),
    api.maxContextTokens,
    systemPrompt
  );

  const body = {
    model: api.model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map(m => ({ role: m.role, content: m.content })),
    ],
    temperature: api.temperature,
    top_p: api.topP,
    max_tokens: api.maxTokens,
    stream: !!onChunk,
  };

  const response = await fetch(`${api.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  // Streaming response
  if (onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            fullContent += delta;
            onChunk(fullContent);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
    return fullContent;
  }

  // Non-streaming
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
```

### 1.5 PWA Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Second Soul',
        short_name: 'Second Soul',
        description: 'Your companions. Your data. Your device.',
        theme_color: '#07050c',
        background_color: '#07050c',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
});
```

### 1.6 Settings Dialog — Required Fields

The settings dialog (Phase 1) must expose:

| Field | Type | Default |
|-------|------|---------|
| API Base URL | text | `https://api.openai.com/v1` |
| API Key | password | — |
| Model | text | `gpt-4o` |
| Max Context Tokens | number | `8000` |
| Temperature | slider 0–2 | `0.8` |
| Top P | slider 0–1 | `0.95` |
| Max Response Tokens | number | `1024` |
| Global System Prompt | textarea | — |

### 1.7 Persona Customization

Each persona slot supports:
- **Name** — free text
- **Avatar** — file upload → converted to base64, stored in IndexedDB
- **Accent color** — color picker
- **Tagline** — free text
- **System Prompt** — textarea (appended to global)

Avatar upload pattern:
```typescript
function handleAvatarUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string); // base64
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

### Phase 1 Deliverables Checklist

- [ ] Project bootstrapped with Vite + React + TS
- [ ] PWA manifest + service worker
- [ ] IndexedDB schema initialized
- [ ] 4 persona slots with avatar upload + color picker
- [ ] Single API backend (OpenAI-compatible)
- [ ] Rolling window context management
- [ ] Chat interface with markdown rendering
- [ ] Settings dialog
- [ ] Chats persisted to IndexedDB per persona
- [ ] The existing UI mockup (persona cards) integrated as home screen

---

## Phase 2 — Multi-Backend + Polish

**Goal:** Multiple API providers, chat history browser, context window config, mobile polish.  
**Estimated effort:** 2–3 days

### 2.1 Multi-Backend Config

Replace single `ApiConfig` with a list of provider presets + active selection:

```typescript
export interface ProviderPreset {
  id: string;
  name: string;               // "nano-gpt", "Mistral", "Anthropic", "Ollama (local)"
  baseUrl: string;
  defaultModel: string;
  notes?: string;             // e.g. "NSFW-capable", "local only"
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'nano-gpt', name: 'nano-gpt', baseUrl: 'https://nano-gpt.com/v1', defaultModel: 'claude-sonnet-4-6' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-6' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3' },
  { id: 'custom', name: 'Custom', baseUrl: '', defaultModel: '' },
];
```

> **Anthropic note:** Anthropic's API uses `anthropic-version` header and slightly different request format.  
> Wrap it in an adapter in `api.ts` that detects provider and adjusts headers accordingly.

```typescript
// Anthropic adapter adjustment in sendMessage():
if (provider === 'anthropic') {
  headers['anthropic-version'] = '2023-06-01';
  headers['x-api-key'] = apiKey;
  delete headers['Authorization'];
  // Also: system prompt goes in top-level "system" field, not messages array
}
```


### 2.1a Provider Registry — Types & JSON Schema

Replace the simple preset array with a full **provider registry** — a managed store of API connections, each with its own key, base URL, and known models.

**Types:**

```typescript
// src/types/providers.ts

export interface Provider {
  id: string;                    // uuid, stable identifier
  name: string;                  // display name, e.g. "nano-gpt (flatrate)"
  baseUrl: string;               // e.g. "https://nano-gpt.com/v1"
  apiKey: string;                // stored in IndexedDB only, never exported plaintext
  adapter: "openai" | "anthropic" | "ollama";  // request format
  notes?: string;                // e.g. "NSFW OK", "flatrate", "local"
  enabled: boolean;
  createdAt: number;
}

export interface ModelConfig {
  id: string;                    // e.g. "anthropic/claude-sonnet-4-6"
  providerId: string;
  displayName: string;           // e.g. "Claude Sonnet 4.6"
  slug: string;                  // exact string sent to API
  contextSize: number;           // tokens — not available via API, manually curated
  defaultTemperature: number;
  defaultTopP: number;
  topKSupport: boolean;          // not all providers support top_k
  defaultTopK?: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsCot: boolean;          // extended thinking / <think> tags
  favorite: boolean;
  notes?: string;                // e.g. "NSFW via API", "reasoning model"
}
```

**providers.default.json** — ships with the app, loaded on first run if no providers exist:

```json
[
  {
    "id": "nano-gpt",
    "name": "nano-gpt",
    "baseUrl": "https://nano-gpt.com/v1",
    "apiKey": "",
    "adapter": "openai",
    "notes": "Flatrate API — all models at fixed monthly price. NSFW OK via API.",
    "enabled": true
  },
  {
    "id": "anthropic",
    "name": "Anthropic",
    "baseUrl": "https://api.anthropic.com/v1",
    "apiKey": "",
    "adapter": "anthropic",
    "notes": "Direct Anthropic API. Requires anthropic-version header.",
    "enabled": true
  },
  {
    "id": "mistral",
    "name": "Mistral AI",
    "baseUrl": "https://api.mistral.ai/v1",
    "adapter": "openai",
    "apiKey": "",
    "notes": "European provider. Le Chat API. Supports top_k extension.",
    "enabled": true
  },
  {
    "id": "openai",
    "name": "OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "adapter": "openai",
    "apiKey": "",
    "enabled": true
  },
  {
    "id": "openrouter",
    "name": "OpenRouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "adapter": "openai",
    "apiKey": "",
    "notes": "Aggregator — access to 200+ models via single API key.",
    "enabled": true
  },
  {
    "id": "glm",
    "name": "GLM / Kimi",
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
    "adapter": "openai",
    "apiKey": "",
    "notes": "Chinese provider. GLM-4 and Kimi models.",
    "enabled": true
  },
  {
    "id": "ollama",
    "name": "Ollama (local)",
    "baseUrl": "http://localhost:11434/v1",
    "adapter": "openai",
    "apiKey": "ollama",
    "notes": "Local models. No key required. Full privacy.",
    "enabled": false
  }
]
```

**models.default.json** — curated model metadata, ships with the app:

```json
[
  {
    "id": "nano-gpt/claude-sonnet-4-6",
    "providerId": "nano-gpt",
    "displayName": "Claude Sonnet 4.6",
    "slug": "anthropic/claude-sonnet-4-6",
    "contextSize": 200000,
    "defaultTemperature": 0.8,
    "defaultTopP": 0.95,
    "topKSupport": false,
    "maxOutputTokens": 8096,
    "supportsStreaming": true,
    "supportsCot": true,
    "favorite": false,
    "notes": "Flatrate via nano-gpt. NSFW OK."
  },
  {
    "id": "anthropic/claude-sonnet-4-6",
    "providerId": "anthropic",
    "displayName": "Claude Sonnet 4.6",
    "slug": "claude-sonnet-4-6",
    "contextSize": 200000,
    "defaultTemperature": 0.8,
    "defaultTopP": 0.95,
    "topKSupport": false,
    "maxOutputTokens": 8096,
    "supportsStreaming": true,
    "supportsCot": true,
    "favorite": false
  },
  {
    "id": "mistral/mistral-large-latest",
    "providerId": "mistral",
    "displayName": "Mistral Large",
    "slug": "mistral-large-latest",
    "contextSize": 128000,
    "defaultTemperature": 0.7,
    "defaultTopP": 0.95,
    "topKSupport": true,
    "defaultTopK": 50,
    "maxOutputTokens": 4096,
    "supportsStreaming": true,
    "supportsCot": false,
    "favorite": false
  },
  {
    "id": "nano-gpt/deepseek-r1",
    "providerId": "nano-gpt",
    "displayName": "DeepSeek R1",
    "slug": "deepseek/deepseek-r1",
    "contextSize": 128000,
    "defaultTemperature": 0.6,
    "defaultTopP": 0.95,
    "topKSupport": false,
    "maxOutputTokens": 8096,
    "supportsStreaming": true,
    "supportsCot": true,
    "favorite": false,
    "notes": "Reasoning model — CoT via <think> tags."
  }
]
```

### 2.1b Provider Registry — IndexedDB Schema

Add to the DB schema:

```typescript
providers: {
  key: string;
  value: Provider;
};
modelConfigs: {
  key: string;                   // composite: "providerId/slug"
  value: ModelConfig;
  indexes: { 'by-provider': string; 'by-favorite': number };
};
```

### 2.1c Model Picker UI — Fuzzy Search

The model picker is a two-step UI: first select provider, then search/select model within that provider.

**Why fuzzy search matters:** nano-gpt exposes 200+ models with slugs like `anthropic/claude-sonnet-4-6`, `meta-llama/llama-3.1-70b-instruct` etc. Nobody wants to scroll that list.

Use `fuse.js` for fuzzy search — tiny, no dependencies:

```bash
npm install fuse.js
```

```typescript
import Fuse from 'fuse.js';

function ModelPicker({ providerId, onSelect }) {
  const [query, setQuery] = useState('');
  const models = useModelsForProvider(providerId);  // from IndexedDB

  const fuse = useMemo(() => new Fuse(models, {
    keys: ['displayName', 'slug', 'notes'],
    threshold: 0.35,             // 0 = exact, 1 = anything
    minMatchCharLength: 2,
  }), [models]);

  const results = query.length >= 2
    ? fuse.search(query).map(r => r.item)
    : models.sort((a, b) => Number(b.favorite) - Number(a.favorite)); // favorites first

  return (
    <div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search models… (name or slug)"
      />
      {results.map(model => (
        <ModelRow
          key={model.id}
          model={model}
          onSelect={() => onSelect(model)}
          onToggleFavorite={() => toggleFavorite(model.id)}
        />
      ))}
    </div>
  );
}
```

**Favorite toggle** — stored in `ModelConfig.favorite` in IndexedDB. Favorited models always float to the top when no search query is active.

### 2.1d Provider Config GUI

A dedicated settings screen (not a dialog — full screen or slide-in panel) for managing providers:

- List of all providers with enabled/disabled toggle
- Add new provider: name, base URL, API key, adapter type
- Edit existing provider
- Delete provider (with confirmation — warns if personas use it)
- "Test connection" button — fires a minimal `/models` or ping request to verify key + URL

```typescript
async function testProvider(provider: Provider): Promise<boolean> {
  try {
    const res = await fetch(`${provider.baseUrl}/models`, {
      headers: buildHeaders(provider),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

> **Note:** Not all providers implement `/models`. For Anthropic, test with a minimal 1-token completion instead.

### 2.1e Per-Model Parameter Overrides

The `ModelConfig` already carries default sampling params. At the persona level, these can be overridden:

```typescript
interface Persona {
  // ...existing fields
  modelId: string;               // references ModelConfig.id
  paramOverrides?: {
    temperature?: number;
    topP?: number;
    topK?: number;               // only sent if ModelConfig.topKSupport === true
    maxOutputTokens?: number;
  };
}
```

**At send time**, merge in this order:
```
ModelConfig defaults
  → Persona paramOverrides
    → (future: per-chat overrides)
```

This means a power user can have Lyra running at temperature 1.2 on DeepSeek-R1 with top_k=40, while Soren runs at 0.6 on Claude Sonnet — all from the same provider registry.


### 2.2 Chat History Browser

Slide-in panel from left (or bottom sheet on mobile):

- List of chats grouped by persona
- Auto-title: first 40 chars of first user message
- Delete chat with confirmation
- Tap to resume

```typescript
// Auto-title generation
function generateChatTitle(firstUserMessage: string): string {
  return firstUserMessage.slice(0, 40) + (firstUserMessage.length > 40 ? '…' : '');
}
```

### 2.3 Per-Persona API Override (optional but useful)

Allow each persona to override the global API config — useful for routing one persona to Claude and another to a local Ollama model.

```typescript
interface Persona {
  // ...existing fields
  apiOverride?: Partial<ApiConfig>;  // merged over global at send time
}
```

### 2.4 Mobile Optimization

- Safe area insets: `padding-bottom: env(safe-area-inset-bottom)`
- Keyboard avoidance: `resize: none` textarea that expands, scroll chat up on keyboard open
- Touch targets minimum 44×44px
- Bottom navigation bar for: Home (personas) · Chat · History · Settings
- Portrait-first layout, cards stack vertically on narrow screens

### 2.5 Export / Import

Allow user to export all data as encrypted JSON blob and import it back.
Use [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) — available in all modern browsers, no dependencies:

```typescript
async function exportData(password: string): Promise<Blob> {
  const db = await getDB();
  const data = {
    chats: await db.getAll('chats'),
    personas: await db.getAll('personas'),
    settings: await db.get('settings', 'main'),
    exportedAt: Date.now(),
    version: 1,
  };

  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  // Prepend IV to encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return new Blob([combined], { type: 'application/octet-stream' });
}

async function deriveKey(password: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('second-soul-v1'), iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

This same blob can be saved to OneDrive, Dropbox, or any cloud — Microsoft/Google see only ciphertext.

### Phase 2 Deliverables Checklist

- [ ] Multi-backend selector with provider presets
- [ ] Anthropic API adapter
- [ ] Chat history browser with delete + resume
- [ ] Per-persona API override
- [ ] Mobile layout + keyboard handling
- [ ] Export / Import with AES-256-GCM encryption
- [ ] Auto-generated chat titles

---

## Phase 3 — Memory Graph

**Goal:** Device-local semantic memory with vector index + relationship graph, encrypted cloud sync.  
**Estimated effort:** 1–2 weeks (this is the real engineering)

### 3.1 Architecture Overview

```
Chat ends
    │
    ▼
Extraction (Haiku/fast model)
    │  extracts: entities, topics, emotions, facts, preferences
    ▼
Memory Graph (IndexedDB)
    │
    ├── Nodes: {id, type, label, embedding, metadata, createdAt}
    │   types: person | topic | emotion | fact | preference | event
    │
    └── Edges: {id, fromId, toId, relation, weight, createdAt}
        relations: mentioned_with | caused | preceded | contradicts | reinforces
    │
    ▼
Vector Index (in-memory, rebuilt from IDB on startup)
    │  cosine similarity over float32 embeddings
    │
    ▼
Retrieval at conversation start
    │  query = recent messages + persona context
    │  returns: top-k nodes + their 1-hop graph neighborhood
    │
    ▼
Preroll injected as system context before user turn
```

### 3.2 Embedding Strategy

Options (choose based on privacy requirements):

| Option | Privacy | Quality | Cost |
|--------|---------|---------|------|
| API embeddings (OpenAI/Mistral) | Low — text sent to server | High | Low |
| `@xenova/transformers` (WASM, local) | Full | Medium | Free |
| Ollama local embedding model | Full | High | Free, needs Ollama |

For Second Soul's privacy-first philosophy: **`@xenova/transformers`** is the right default.

```bash
npm install @xenova/transformers
```

```typescript
// src/services/embeddings.ts
import { pipeline } from '@xenova/transformers';

let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    // Downloads model once, caches in browser
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

export async function embed(text: string): Promise<Float32Array> {
  const model = await getEmbedder();
  const result = await model(text, { pooling: 'mean', normalize: true });
  return result.data as Float32Array;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### 3.3 Memory Graph Schema (IndexedDB extension)

```typescript
// Add to DBSchema in db.ts:
memoryNodes: {
  key: string;
  value: MemoryNode;
  indexes: { 'by-persona': string; 'by-type': string };
};
memoryEdges: {
  key: string;
  value: MemoryEdge;
  indexes: { 'by-from': string; 'by-to': string };
};

interface MemoryNode {
  id: string;
  personaId: string;
  type: 'person' | 'topic' | 'emotion' | 'fact' | 'preference' | 'event';
  label: string;
  embedding: number[];          // stored as array (IDB doesn't do Float32Array)
  metadata: Record<string, any>;
  sourceMessageId?: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryEdge {
  id: string;
  fromId: string;
  toId: string;
  relation: string;
  weight: number;               // 0–1, decays over time optionally
  createdAt: number;
}
```

### 3.4 Extraction Prompt (for Haiku or fast model)

```typescript
const EXTRACTION_SYSTEM = `You are a memory extraction system. 
Analyze the conversation and extract structured information.
Respond ONLY with valid JSON, no markdown, no explanation.

Extract:
- entities: people, places, things mentioned (with type and any attributes)
- topics: main subjects discussed  
- emotions: emotional states expressed by the user
- facts: things the user stated about themselves or their life
- preferences: things the user likes/dislikes/wants

Format:
{
  "entities": [{"label": "...", "type": "person|place|thing", "attributes": {}}],
  "topics": ["..."],
  "emotions": [{"label": "...", "intensity": 0.0-1.0}],
  "facts": ["..."],
  "preferences": [{"label": "...", "sentiment": "positive|negative|neutral"}]
}`;
```

### 3.5 Retrieval + Preroll

```typescript
// src/services/memory.ts
export async function buildMemoryPreroll(
  personaId: string,
  recentMessages: Message[],
  topK = 8
): Promise<string> {
  const queryText = recentMessages.slice(-3).map(m => m.content).join(' ');
  const queryEmbedding = await embed(queryText);

  const nodes = await getAllMemoryNodes(personaId);
  
  // Score by similarity
  const scored = nodes.map(node => ({
    node,
    score: cosineSimilarity(queryEmbedding, new Float32Array(node.embedding)),
  })).sort((a, b) => b.score - a.score).slice(0, topK);

  // Fetch 1-hop neighbors for top nodes
  const nodeIds = new Set(scored.map(s => s.node.id));
  const edges = await getEdgesForNodes([...nodeIds], personaId);
  const neighborIds = edges.flatMap(e => [e.fromId, e.toId]).filter(id => !nodeIds.has(id));
  const neighbors = await getNodesByIds(neighborIds);

  // Build preroll string
  const allNodes = [...scored.map(s => s.node), ...neighbors];
  
  if (allNodes.length === 0) return '';

  return `[Memory context — use naturally, do not reference explicitly]\n` +
    allNodes.map(n => `- ${n.type}: ${n.label}${n.metadata.detail ? ` (${n.metadata.detail})` : ''}`).join('\n');
}
```

### 3.6 Encrypted Cloud Sync

Extend Phase 2 export/import to support automatic sync:

- **Trigger:** after each chat, serialize delta → encrypt → upload
- **Storage targets:** any WebDAV, S3-compatible, or even a simple file in OneDrive/Dropbox via their APIs
- **Conflict resolution:** last-write-wins per node ID (sufficient for single-user)
- **Format:** same AES-256-GCM blob as Phase 2 export, but incremental (only changed nodes/edges)

### 3.7 Memory Management UI

- Visual graph explorer (d3-force or similar): show nodes + edges
- Manual: pin important memories, delete wrong ones, merge duplicates
- Memory "weight decay" toggle: old memories fade unless reinforced
- Stats: total memories, last extraction, storage used

### Phase 3 Deliverables Checklist

- [ ] `@xenova/transformers` embedding pipeline (local, WASM)
- [ ] Memory graph schema in IndexedDB
- [ ] Extraction service (post-chat, async, non-blocking)
- [ ] Vector similarity search
- [ ] Graph neighborhood retrieval
- [ ] Preroll injection into system context
- [ ] Encrypted incremental cloud sync
- [ ] Memory management UI with graph visualization

---

## Cross-Phase Notes

### API Key Security

API keys are stored in IndexedDB (not localStorage, not hardcoded).  
IndexedDB is origin-scoped and not accessible cross-origin.  
For self-hosted deployments, HTTPS is mandatory — enforce in service worker.

### Token Estimation

The rolling window uses `chars / 4` as a token estimate.  
This is intentionally conservative (avoids context overflow).  
A tiktoken WASM port exists (`js-tiktoken`) for exact counts if needed later.

### No Backend Required

Phase 1 and Phase 2 have zero server dependencies.  
Phase 3 sync is optional — the app is fully functional offline-first without it.  
sophia0 is only needed if you want to self-host a sync endpoint.

### Testing Providers

Quick sanity-check curl for any OpenAI-compatible backend:
```bash
curl https://nano-gpt.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"ping"}],"max_tokens":10}'
```

---

*Second Soul — your companions, your data, your device.*

---

## UI Components Reference

### Chain-of-Thought (CoT) Block

For models that expose reasoning (Claude extended thinking, QwQ, DeepSeek-R1), thinking content renders as a collapsible block *above* the response bubble.

**Visual design:**
- Collapsed by default — small pill button with node-graph icon and "Gedanken" label
- Click to expand — smooth height animation (CSS transition on explicit px height, not `auto`)
- Content: italic, dimmed (~38% opacity), visually distinct register from the response
- Left border accent in persona color · label "interner monolog" in monospace

**Data model:**
```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;   // optional — only present if model exposes CoT
  timestamp: number;
}
```

**Anthropic extended thinking:**
```typescript
const thinkingBlock = data.content.find(b => b.type === "thinking");
const textBlock = data.content.find(b => b.type === "text");
const message: Message = {
  id: uuid(), role: "assistant", timestamp: Date.now(),
  thinking: thinkingBlock?.thinking ?? undefined,
  content: textBlock?.text ?? "",
};
```

**OpenAI-compatible reasoning models (DeepSeek-R1, QwQ):**
```typescript
// These embed thinking in <think>...</think> tags
function extractThinking(raw: string): { thinking?: string; content: string } {
  const match = raw.match(/^<think>([\s\S]*?)<\/think>\s*/);
  if (!match) return { content: raw };
  return { thinking: match[1].trim(), content: raw.slice(match[0].length) };
}
```

**Per-persona setting:** CoT visibility is a per-persona toggle. Some companions feel more intimate without it; power users want it always on.

---

### Memory Moment UI — "Floating Hearts"

Instead of a cold "save this?" dialog, the UI reacts *emotionally* to memory-worthy moments.

**Flow:**
1. After each assistant response, fire background extraction call (Haiku, non-blocking)
2. If model returns a candidate, trigger animation after ~600ms delay
3. Floating symbols rise above input field (1.2s animation)
4. Subtle confirmation bar appears below input
5. "ja" → saved to memory graph · "nein" → silently dismissed

**Symbol vocabulary:**

| Symbol | Type | Meaning |
|--------|------|---------|
| ♡ | emotion | Something the user felt or expressed |
| ◎ | pattern | A recurring behavior or thinking style |
| ✦ | fact | A concrete fact about the user's life |
| ⟡ | value | Something the user clearly cares about |
| ◈ | preference | A like, dislike, or stated preference |

**Extraction prompt (Haiku):**
```typescript
async function extractMemory(
  userMessage: string,
  assistantResponse: string
): Promise<MemorySuggestion | null> {
  const res = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "haiku-model",
      max_tokens: 150,
      messages: [{ role: "user", content:
        `Analyze this exchange. Is there anything worth remembering — a fact, pattern, emotion, value or preference?

User: "${userMessage}"
Assistant: "${assistantResponse}"

Reply ONLY with JSON or null.
{"type": "fact|pattern|emotion|value|preference", "icon": "✦|◎|♡|⟡|◈", "text": "short description"}

If nothing memory-worthy: null` }]
    })
  });
  const data = await res.json();
  const raw = data.choices[0].message.content.trim();
  if (raw === "null") return null;
  try { return JSON.parse(raw); } catch { return null; }
}
```

**Trigger after response (non-blocking):**
```typescript
extractMemory(userMsg.content, assistantMsg.content).then(memory => {
  if (!memory) return;
  setTimeout(() => {
    setFloatingMemory({ icon: memory.icon, color: persona.color });
    setTimeout(() => setPendingMemory(memory), 1200);
  }, 600);
});
```

**Key principle:** Extraction is fully silent. If it fails or returns null, nothing happens. Zero friction. The hearts just appear naturally after the conversation settles.

**Session chips:** Accepted memories appear as small tag-chips above the input field for the session, giving the user a felt sense that the companion is building a picture of them.

