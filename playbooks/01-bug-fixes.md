# Playbook 01 — Bug Fixes

**Priority:** High — implement first. Everything else builds on a correctly working system.
**Scope:** Two targeted fixes, no new dependencies, no schema changes.

---

## Context

Read before starting:
- `MEMORY-SYSTEM-CURRENT.md` — full system overview
- `MEMORY-SYSTEM-PROPOSALS.md` — proposals #13 and #8

Key files:
- `frontend/src/components/ChatPage.tsx` — mount effect, `suggestedEntries` state
- `frontend/src/components/MemoryPage.tsx` — loads pending entries on mount
- `frontend/src/services/db.ts` — IndexedDB helpers
- `frontend/src/types/index.ts` — `MemoryPendingEntry`, `MemorySettings`

---

## Fix 1 — Suggested Entries Not Loaded on Mount (Proposal #13)

### Problem

`suggestedEntries` in `ChatPage` is initialised as `[]`. When the component mounts,
it never reads `suggested` entries from IndexedDB. If the user navigates away and
returns, or reloads the page, any previously detected-but-unreviewed suggestions
are silently lost from the UI (they exist in DB but the popup never reappears).

### What to do

In `ChatPage.tsx`, in the existing `useEffect` that calls `loadOrCreateChat`, add a
DB read after the chat is loaded:

```ts
const existing = await getSuggestedPendingEntries(personaId);
if (existing.length > 0) {
    setSuggestedEntries(existing);
}
```

`getSuggestedPendingEntries(personaId)` may not exist yet — check `db.ts`.
If it only has `getPendingEntries` (all statuses) or `getAcceptedPendingEntries`,
add a `getSuggestedPendingEntries` that filters by `status === 'suggested'`.

### Acceptance criteria

- Open a chat that has existing `suggested` entries in IndexedDB → popup appears immediately on mount.
- Navigate away and back → popup still appears.
- If there are no suggested entries → no popup, no error.

---

## Fix 2 — Suggested Entry Expiry (Proposal #8)

### Problem

`suggested` entries that the user never reviews accumulate indefinitely. After weeks
they become stale noise (the conversation context they came from is long gone).

### What to do

1. Add `expiryDays` to `MemorySettings` in `types/index.ts`:

```ts
export interface MemorySettings {
    workerModelId: string | null;
    autoConsolidate: boolean;
    consolidationThreshold: number;
    detectionInterval: number;
    suggestedEntryExpiryDays: number;   // new — default 7, range 3–30
}
```

2. Update the default settings in `db.ts` to include `suggestedEntryExpiryDays: 7`.

3. Add a helper in `db.ts`:

```ts
export async function deleteExpiredSuggestedEntries(
    personaId: string,
    expiryDays: number,
): Promise<void>
```

It deletes all entries where `status === 'suggested'` and
`extractedAt < Date.now() - expiryDays * 86_400_000`.

4. Call this helper at the top of the `MemoryPage` mount effect (before loading
   the display data), so cleanup happens lazily when the user opens Memory.

5. Also call it in the `ChatPage` mount effect, before loading suggested entries
   into state (Fix 1 above) — so expired entries are pruned before they are shown.

6. Add an expiry setting control to `SettingsPage.tsx` in the Memory section:
   a number input (or small select: 3 / 7 / 14 / 30 days).

### Acceptance criteria

- Entries older than `expiryDays` are gone after opening Memory Page or a Chat.
- Entries newer than `expiryDays` are unaffected.
- Default is 7 days and is reflected in the settings UI.
- `accepted` entries are never touched by expiry logic.

---

## Done when

- [ ] `getSuggestedPendingEntries` exists in `db.ts`
- [ ] `ChatPage` loads suggested entries on mount and shows popup if any exist
- [ ] `suggestedEntryExpiryDays` field exists on `MemorySettings` with default 7
- [ ] `deleteExpiredSuggestedEntries` exists in `db.ts`
- [ ] Expiry cleanup runs on `ChatPage` mount (before loading suggestions) and on `MemoryPage` mount
- [ ] Setting is exposed in `SettingsPage`
- [ ] Manual test: navigate away and back → existing suggestions still visible
- [ ] Manual test: manually set an entry's `extractedAt` to 8 days ago in DevTools IndexedDB → it is gone after opening Memory Page
