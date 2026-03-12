# Second Soul PWA — Implementation Plan

*Erstellt: 12. März 2026*

## Entscheidungen

- Phase 1 + 2 parallel (Multi-Backend von Anfang an)
- Keine Default-Personas — leere Slots, User baut selbst auf
- React Router v7
- Tailwind CSS (Hybrid: Tailwind + CSS Custom Properties für persona-spezifische Werte)
- Fonts selbst hosten (Instrument Serif, Lora)
- pnpm
- Phase 3 (Memory Graph) — NICHT in diesem Durchgang

## Specs-Dateien

- `specs/PLAYBOOK.md` — Types, Services, DB-Schema, API-Adapter direkt verwenden
- `specs/chat-window.jsx` — Implementierungsvorlage Chat Window
- `specs/personas-page.jsx` — Implementierungsvorlage Personas Page

---

## Phase A — Foundation *(blockiert alle anderen)*

1. Projekt-Bootstrap: `pnpm create vite second-soul -- --template react-ts` + Tailwind v4, React Router v7, `vite-plugin-pwa`, `react-markdown`, `zustand`, `idb`, `uuid`, `fuse.js`
2. Fonts selbst hosten: Instrument Serif + Lora als woff2 in `src/assets/fonts/`, `@font-face` in global.css
3. TypeScript Types: `src/types/index.ts` (Persona, Message, Chat, AppSettings) + `src/types/providers.ts` (Provider, ModelConfig)
4. Default-Daten: `src/data/providers.default.json` + `src/data/models.default.json`
5. CSS-Strategie: `--persona-color`, `--persona-glow`, `--persona-gradient` als Custom Properties auf Container-Element; Keyframe-Animationen (breathe, pulse, spinSlow, cardEntrance, etc.) in global.css

## Phase B — Services *(parallel nach A)*

1. `src/services/db.ts`: IndexedDB mit Phase-2-Schema von Anfang an (chats, personas, settings, providers, modelConfigs)
2. `src/stores/appStore.ts`: settings, personas, activePersonaId, activeChat, providers, activeProviderId; addMessage + updateLastMessage (streaming)
3. `src/services/api.ts`: sendMessage() mit Adapter-Pattern (openai/anthropic/ollama), Streaming, Rolling Window, CoT-Extraktion (`<think>`-Tags + Anthropic extended thinking blocks)

## Phase C — Routing & Shell *(parallel nach A)*

1. Routes: `/` (PersonasPage), `/chat/:personaId/:chatId?`, `/settings`, `/history`
2. App Shell + BottomNav: Mobile-first, safe-area-insets, 4 Nav-Items (Home · Chat · History · Settings)

## Phase D — Personas Page *(nach A+C)*

1. `PersonaCard`: Tailwind-Layout + CSS Custom Properties für Farbe/Glow/Gradient; `BreathingOrb` + `FloatingParticles` als separate Komponenten; Talk-Button → navigiert zu `/chat/:personaId`
2. `ContextMenu`: Slide-up-Animation (CSS transition), 4 Menu-Items aus Playbook
3. Leere Slots als "Add Persona"-Cards
4. Grid: 2×2 auf Mobile, 4 in einer Zeile auf Desktop

## Phase E — Chat Window *(nach A+B+C, parallel mit D)*

1. `ChatWindow`: lädt/erstellt Chat aus IndexedDB, scrollt auf neuste Nachricht
2. `AssistantBubble` + `UserBubble` — react-markdown statt SimpleMarkdown
3. `ThinkingBlock`: Collapsible via explizite px-Höhe (kein `height: auto`), Label "Gedanken" / "interner monolog", per-Persona-Toggle ob CoT sichtbar
4. `TypingIndicator`, `ChatInput` (Auto-resize Textarea, Keyboard-Avoidance auf Mobile)
5. `MemoryPrompt` + `FloatingHearts` als Stubs (Phase 3)

## Phase F — Settings + Provider Management *(nach A+B)*

1. `ProviderList`: Enabled/Disabled Toggle, Add/Edit/Delete, "Test Connection" (`AbortSignal.timeout(5000)`)
2. `ProviderForm`: Name, Base URL, API Key (password-input), Adapter-Select (openai/anthropic/ollama), Notes
3. `ModelPicker`: fuse.js fuzzy search, Provider-first dann Model, Favorites togglen

## Phase G — History Panel *(nach B+C)*

1. Chats gruppiert nach Persona, Auto-Title (erste 40 Chars), Delete mit Confirmation, Resume

## Phase H — PWA-Abschluss

1. `vite.config.ts`: VitePWA + Manifest (name: "Second Soul", theme_color: `#07050c`) + Workbox
2. Icons 192×192 + 512×512 in `public/icons/`
3. Mobile Polish: Touch-Targets ≥ 44×44px, Portrait-Test auf 390px Viewport

---

## Verifikation

1. Lighthouse PWA-Audit ≥ 90 auf Mobile Simulation
2. Offline-Test: alle Assets gecached, App ohne Netz funktionsfähig
3. Streaming: Token erscheint inkrementell in Bubble
4. CoT: ThinkingBlock für DeepSeek-R1 (`<think>`) + Anthropic extended thinking
5. IndexedDB: Chat nach Reload noch vorhanden
6. Mobile: 390px Viewport (iPhone-Breite)

---

## Scope-Grenzen (bewusst ausgeschlossen)

- Phase 3 komplett (Memory Graph, Embeddings, Vector Index, Cloud Sync)
- Export/Import-Verschlüsselung — nach den Kernfeatures nachrüsten
- Persona-Avatar-Upload — nach Kernfeatures
