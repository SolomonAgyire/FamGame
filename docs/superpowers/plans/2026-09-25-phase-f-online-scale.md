# Phase F — Online Rooms at Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take online rooms from 12 players to 30, make a big room actually fun to be in, and replace 1.8-second polling with a live connection.

**Architecture:** Deliberately two stages. **Stage 1 (Tasks 1–4)** fixes what makes a big room unplayable — the cap, the illegible standings, the one-winner-takes-all scoring, and the missing host controls — on the existing D1 transport, so it ships and is testable on its own. **Stage 2 (Tasks 5–7)** swaps the transport to one Durable Object per room with WebSockets. Stage 1 must be green before Stage 2 begins; if Stage 2 runs into trouble it can be dropped without losing Stage 1's value.

**Tech Stack:** TypeScript, Cloudflare Workers, Durable Objects, D1, Drizzle, React 19. No new npm dependencies — Durable Objects are a platform feature, not a package.

**Spec:** `docs/superpowers/specs/2026-09-24-wordin-progression-and-retention.md` §10

**Depends on:** Phases A, C, D.

## Global Constraints

- **$0 to operate.** Durable Objects must stay within the free allowance; **SQLite-backed** DO classes are required (the free plan does not include key-value-backed Durable Objects). Overages stay disabled.
- **No new runtime dependencies.** Exactly `next`, `react`, `react-dom`, `drizzle-orm`.
- **No account required to play.** Six-character codes, two-hour TTL, no sign-in.
- **Online rooms stay ungated** — a host picks any level regardless of their own progress.
- **Mobile-first at 390px.** A standings list of 30 must be legible on a phone.
- Test command is `npm test` from `game/`. `npx tsc --noEmit` and `npm run lint` stay at 0 errors.
- Deploy config lives in `game/wrangler.jsonc`. `main` auto-deploys via `.github/workflows/deploy.yml`.

---

## Stage 1 — make a big room playable

### Task 1: Descending-curve scoring

**Files:**
- Create: `game/lib/room-scoring.ts`
- Test: `game/tests/room-scoring.test.ts`

**Interfaces:**
- Consumes: `scoreSolve` from `lib/scoring.ts`.
- Produces:
  - `const SOLVE_WINDOW_MS = 12000`
  - `function awardForFinishOrder(base: number, position: number, total: number): number`
  - `function isWindowOpen(firstSolveAt: number | null, now: number): boolean`

Today the first correct answer takes the puzzle and everyone else gets nothing. At 30 players that is one winner and 29 losers every round — the mode stops being fun long before the infrastructure strains.

- [ ] **Step 1: Write the failing test**

Create `game/tests/room-scoring.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { awardForFinishOrder, isWindowOpen, SOLVE_WINDOW_MS } from '../lib/room-scoring';

test('first place takes the full award', () => {
  assert.equal(awardForFinishOrder(20, 1, 10), 20);
});

test('later finishers earn less but never nothing', () => {
  const first = awardForFinishOrder(20, 1, 10);
  const fifth = awardForFinishOrder(20, 5, 10);
  const last = awardForFinishOrder(20, 10, 10);
  assert.ok(first > fifth && fifth > last);
  assert.ok(last >= 1, 'solving it correctly is always worth something');
});

test('the curve is the same shape whatever the room size', () => {
  assert.equal(awardForFinishOrder(20, 1, 2), awardForFinishOrder(20, 1, 30));
});

test('a solo solver in a big room still gets full marks', () => {
  assert.equal(awardForFinishOrder(15, 1, 30), 15);
});

test('the window opens on the first solve and closes after twelve seconds', () => {
  assert.equal(isWindowOpen(null, 1000), true, 'nobody has solved yet, the puzzle is open');
  assert.equal(isWindowOpen(1000, 1000 + SOLVE_WINDOW_MS - 1), true);
  assert.equal(isWindowOpen(1000, 1000 + SOLVE_WINDOW_MS + 1), false);
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

`awardForFinishOrder` decays by position only — never by room size, so a 30-player room does not pay less than a 3-player one for the same placing. Use a decay that halves by roughly the fifth position and floors at 1.

- [ ] **Step 3: Commit**

```bash
cd game && git add lib/room-scoring.ts tests/room-scoring.test.ts
git commit -m "feat: pay everyone who solves, on a finish-order curve

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Raise the cap and keep the room honest

**Files:**
- Modify: `game/lib/room-service.ts`
- Test: `game/tests/room-service.test.ts` (create)

**Interfaces:**
- Produces: `const MAX_PLAYERS = 30`, `const MAX_SPECTATORS = 100`; `RoomPlayer` gains `role: 'player' | 'spectator'` and `lastSeen: number`.

- [ ] **Step 1: Write the failing test**

Cover: the 31st joiner is refused as a player but accepted as a spectator; a spectator cannot submit an answer; `players.length >= 12` no longer refuses at 12; the puzzle resolves once every player has solved or the window closes; a player who reconnects with the same token keeps their score.

- [ ] **Step 2: Implement**

Replace the hardcoded `players.length >= 12` at `room-service.ts:110`. Add the spectator role — spectators receive snapshots and are excluded from scoring, the standings, and the "everyone has answered" check. Record `lastSeen` on every action so a disconnect is detectable.

- [ ] **Step 3: Update the two UI strings**

`Share this code with up to 11 more players` and `{players.length}/12` in `OnlineLobby` both hardcode the old cap. Drive them from `MAX_PLAYERS`.

- [ ] **Step 4: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add lib/room-service.ts components/GatherWordApp.tsx tests/room-service.test.ts
git commit -m "feat: raise rooms to 30 players plus spectators

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Live ranked standings

**Files:**
- Create: `game/components/Standings.tsx`
- Modify: `game/components/GatherWordApp.tsx`, `game/app/globals.css`

The current score strip is an unsorted flex row in join order. It already overflows at 12; at 30 it is unusable.

- [ ] **Step 1: Build the component**

Sorted by score descending. **Top three always pinned, the viewer's own row always visible** even when they are 22nd — that is the whole point of the component. Collapsed to a compact bar during play with a tap to expand; full list on the results screen. Show who has answered this puzzle without revealing whether they were right.

- [ ] **Step 2: Style it for 30 rows at 390px**

Virtualise nothing — 30 rows is small — but keep each row short and scannable: position, name, score, answered-dot. The viewer's row gets a distinct treatment.

- [ ] **Step 3: Replace the strip**

Swap `.score-strip` for `<Standings />` in the online play screen. Keep the existing strip for solo and hotseat, which have at most four sides.

- [ ] **Step 4: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add components/Standings.tsx components/GatherWordApp.tsx app/globals.css
git commit -m "feat: rank the live standings and pin the viewer's own row

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Host controls, reconnect and late join

**Files:**
- Modify: `game/lib/room-service.ts`, `game/app/api/rooms/[code]/action/route.ts`, `game/components/GatherWordApp.tsx`

**Interfaces:**
- Produces actions: `kick`, `pause`, `resume`, `skip`, `end`.

- [ ] **Step 1: Add the host actions**

`kick` (removes a player, keeps their score in the final standings marked as left), `pause`/`resume` (freezes the timer and blocks submissions), `skip` (abandons the current puzzle, nobody scores), `end` (jumps to results). Every one is host-only and validated server-side, never merely hidden in the UI.

- [ ] **Step 2: Reconnect**

A player returning with a valid token rejoins their existing seat with their score intact rather than creating a duplicate. `sessionStorage` already persists credentials — make the server side idempotent.

- [ ] **Step 3: Late join**

Joining a room already in progress is allowed: the joiner enters as a player with a score of 0, sits out the current puzzle, and plays from the next one.

- [ ] **Step 4: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add lib/room-service.ts app/api components/GatherWordApp.tsx
git commit -m "feat: add host controls, reconnect and late join

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Stage 1 gate:** `npm test`, `npx tsc --noEmit`, `npm run lint` all clean, and a manual two-browser check that a room still forms, plays and finishes. Do not start Stage 2 until this holds.

---

## Stage 2 — live transport

### Task 5: The room Durable Object

**Files:**
- Create: `game/durable/RoomDO.ts`
- Modify: `game/wrangler.jsonc`, `game/db/env.d.ts`

**Interfaces:**
- Produces: `export class RoomDO` with a `fetch` handler that upgrades to WebSocket, plus the same action surface `room-service.ts` exposes today.

- [ ] **Step 1: Declare the binding and migration**

In `game/wrangler.jsonc`, alongside the existing `d1_databases`:

```jsonc
  "durable_objects": {
    "bindings": [{ "name": "ROOMS", "class_name": "RoomDO" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["RoomDO"] }
  ]
```

**`new_sqlite_classes`, not `new_classes`** — the free plan only includes SQLite-backed Durable Objects, and using the key-value variant is the single easiest way to break the $0 constraint.

- [ ] **Step 2: Move authoritative state into the DO**

One instance per room code (`idFromName(code)`). It owns players, settings, match recipe, current index, resolution and version. Use the **WebSocket Hibernation API** (`acceptWebSocket`, `webSocketMessage`, `webSocketClose`) so an idle room costs nothing while people are between puzzles.

- [ ] **Step 3: Keep D1 for what it is good at**

D1 keeps the code→room index and the two-hour TTL sweep. Live match state lives in the DO.

- [ ] **Step 4: Verify locally**

`npx wrangler dev` and drive two browser tabs through a full match. Commit.

---

### Task 6: Client on WebSockets

**Files:**
- Modify: `game/components/GatherWordApp.tsx`

- [ ] **Step 1: Replace polling**

Delete the 1.8-second `setInterval` in `OnlineRoom`. Open a WebSocket, apply pushed snapshots, and send actions over the socket.

- [ ] **Step 2: Reconnect with backoff**

On close, retry with exponential backoff and a visible "Reconnecting…" state. The existing room banner already has the slot for it.

- [ ] **Step 3: Keep a polling fallback**

If the socket fails to open twice, fall back to the existing REST endpoints. They stay in place; a phone on a hostile network must still be able to play.

- [ ] **Step 4: Verify and commit**

---

### Task 7: Load check at 30

**Files:** none — verification gate.

- [ ] **Step 1: Drive 30 simulated clients**

Against `wrangler dev`, connect 30 sockets to one room, start a match, have them all answer, and confirm: every solver is paid on the curve, the standings agree across clients, no version conflicts, and the puzzle advances once.

- [ ] **Step 2: Confirm the hibernation assumption**

An idle room with 30 connected sockets should not be burning duration. Check with `wrangler tail`.

- [ ] **Step 3: Report** the measured numbers, not an assurance.

---

## Self-Review

**Spec coverage.** §10 in full: the 30-player cap (Task 2), spectators (Task 2), ranked live standings with the viewer pinned (Task 3), descending-curve scoring so a big room has 30 participants rather than 1 winner (Task 1), host controls, reconnect and late join (Task 4), and the Durable Object + WebSocket transport (Tasks 5–6). §10.3's "already working" items are left alone deliberately.

**Placeholders.** Task 1 carries complete test code. Tasks 2–7 describe behaviour, exact identifiers (`players.length >= 12` at `room-service.ts:110`, the two hardcoded UI strings, the `setInterval` in `OnlineRoom`) and exact config, but do not carry full implementations — this is transport and server work where the existing file's shape should drive the code. Each task names its own verification.

**The staging is the point.** Stage 1 delivers every user-visible improvement and is independently shippable. Stage 2 is the infrastructure swap. Splitting them means a Durable Objects problem costs the transport upgrade, not the feature.

**Risks to watch.**
- `new_sqlite_classes` vs `new_classes` decides whether this stays free. Getting it wrong is the main way this plan breaks the $0 constraint.
- A DO migration tag is permanent once deployed — `v1` cannot be renamed later.
- Stage 2 changes the deployed Worker's shape; `main` auto-deploys, so Stage 2 should not merge until it has been checked with `wrangler dev`.
