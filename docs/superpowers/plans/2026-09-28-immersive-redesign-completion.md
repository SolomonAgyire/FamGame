# Immersive Redesign Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the home screen to match `game/docs/design/wordin-ui-direction.png` directly, add a real coins/gems economy, unify five divergent star formulas into one, consolidate four duplicate results screens into one component, and finish the remaining gameplay/lobby visual gaps.

**Architecture:** Pure-function economy/star logic lives in `lib/` (economy.ts new, levels.ts and progress.ts extended) and is fully unit-tested with the project's existing `node:test` + `assert` convention. UI work is component/CSS-only on top of that: `HomeScreen`, `Header`, `LevelBar`, `LevelPath`, a new shared `Results` component, and the four tool-docks/lobby all consume the same small set of new exports. No backend, Durable Object, or WebSocket protocol changes.

**Tech Stack:** Next.js (App Router, client components), TypeScript, plain CSS (`globals.css` / `game-world.css` / `immersive.css`), `tsx --test` for the test suite (`npm test` runs `tests/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-28-immersive-redesign-completion-design.md` (extends `game/docs/immersive-redesign-plan.md`)

## Global Constraints

- Do not change scoring, word selection, timers, progress storage shape beyond the additive fields below, room actions, WebSocket behavior, or Durable Object rules.
- Time Attack and online rooms do not call `recordMatch` today (confirmed: only `LocalGame`'s `next()` in `components/GatherWordApp.tsx` and `DailyWord.tsx`'s `finish()` call it) — do not retrofit them into it; their results screens simply omit `coinsEarned`/`gemEarned`.
- No new binary art assets. New visual elements are CSS/SVG/emoji-glyph objects styled in the existing carved-stone/parchment/glass material language.
- Keep keyboard/button semantics, visible focus, accessible names, `prefers-reduced-motion` handling, and disabled states on everything touched.
- Run `npm test`, `npm run lint`, and `npm run build` (all from `game/`) before considering the branch complete.

## Review Focus

- A stored progress record from before this change (no `coins`/`gems` keys) must load with both at `0`, not `undefined` or `NaN` — exercised by a migration test in Task 3.
- A level that clears on the exact match that pushes `solvedIds.length` to its target must earn exactly one gem, and playing that same cleared level again must never award a second one — exercised in Task 3.
- Online results must not silently regress to a worse experience than the flat `earned={3}` they show today if `snapshot.players` is short (e.g., a solo cooperative room) — the rank-based star helper in Task 6 must handle a one-player list without dividing by zero.
- The home screen's mode row must stay disabled for `solo`/`together` exactly when `blocked` is set (an empty word pool), matching the current gating logic — a regression here would let a player start a match with zero playable words.
- Removing the dead `.mode-tile`/`.mode-grid`/`.mode-orb`/`.ground-path-trail` CSS in Tasks 4–5 must not delete a selector some other still-rendered screen depends on — each task's CSS-removal step greps the component tree first and records what it found.

---

## Task 1: Shared economy formulas (`lib/economy.ts`)

**Files:**
- Create: `game/lib/economy.ts`
- Test: `game/tests/economy.test.ts`

**Interfaces:**
- Produces: `matchStars({ correct, wrong }: { correct: number; wrong: number }): number` (0–3), `coinsForMatch(stars: number, wordsSolved: number): number`. Task 3 imports both; Task 6 imports `matchStars`.

- [ ] **Step 1: Write the failing tests**

Create `game/tests/economy.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchStars, coinsForMatch } from '../lib/economy';

test('no correct answers earns zero stars', () => {
  assert.equal(matchStars({ correct: 0, wrong: 5 }), 0);
  assert.equal(matchStars({ correct: 0, wrong: 0 }), 0);
});

test('a flawless run earns three stars regardless of size', () => {
  assert.equal(matchStars({ correct: 1, wrong: 0 }), 3);
  assert.equal(matchStars({ correct: 20, wrong: 0 }), 3);
});

test('seventy percent accuracy or better, with at least one miss, earns two stars', () => {
  assert.equal(matchStars({ correct: 7, wrong: 3 }), 2);
  assert.equal(matchStars({ correct: 14, wrong: 6 }), 2);
});

test('below seventy percent accuracy earns one star, never zero, while something was solved', () => {
  assert.equal(matchStars({ correct: 1, wrong: 3 }), 1);
  assert.equal(matchStars({ correct: 5, wrong: 20 }), 1);
});

test('coins scale with both the star tier and the words solved', () => {
  assert.equal(coinsForMatch(3, 10), 3 * 10 + 10 * 2);
  assert.equal(coinsForMatch(0, 0), 0);
  assert.equal(coinsForMatch(1, 1), 1 * 10 + 1 * 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd game && npx tsx --test tests/economy.test.ts`
Expected: FAIL — `Cannot find module '../lib/economy'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/economy.ts`:

```ts
/** Shared post-match star formula. Every mode translates its own result
 * shape into {correct, wrong} before calling this, so a "3-star clear"
 * means the same thing everywhere instead of five different tiers. */
export type MatchStarsInput = { correct: number; wrong: number };

export function matchStars({ correct, wrong }: MatchStarsInput): number {
  if (correct === 0) return 0;
  if (wrong === 0) return 3;
  if (correct / (correct + wrong) >= 0.7) return 2;
  return 1;
}

const COINS_PER_STAR = 10;
const COINS_PER_WORD = 2;

/** Coins earned for one completed match: a flat rate per word solved,
 * plus a bonus scaled to how well it went. */
export function coinsForMatch(stars: number, wordsSolved: number): number {
  return stars * COINS_PER_STAR + wordsSolved * COINS_PER_WORD;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd game && npx tsx --test tests/economy.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add game/lib/economy.ts game/tests/economy.test.ts
git commit -m "feat: add a shared match-stars and coins formula"
```

---

## Task 2: Unified level stars (`lib/levels.ts`, `LevelBar.tsx`, `LevelPath.tsx`)

**Files:**
- Modify: `game/lib/levels.ts`
- Modify: `game/components/LevelBar.tsx`
- Modify: `game/components/LevelPath.tsx`
- Modify: `game/tests/levels.test.ts`
- Modify: `game/app/globals.css` (one small addition, `.level-node-stars`)

**Interfaces:**
- Consumes: `levelStatus(record, level)` (existing, `lib/levels.ts`).
- Produces: `ALL_LEVELS: Level[]`, `starsForLevel(record: ProgressRecord, level: Level): number`, `totalStars(record: ProgressRecord): number` — all exported from `lib/levels.ts`. Task 4 imports `totalStars`; `LevelBar`/`LevelPath` import `ALL_LEVELS` and `starsForLevel`.

- [ ] **Step 1: Write the failing tests**

In `game/tests/levels.test.ts`, change the import line to add the new names:

```ts
import { isLevelCleared, highestUnlocked, isUnlocked, levelStatus, WORDS_TO_CLEAR, runLengthFor, clearTargetFor, RUN_LENGTHS, CLEAR_TARGETS, starsForLevel, totalStars, ALL_LEVELS } from '../lib/levels';
```

Append at the end of the file:

```ts
test('a level with no progress rates zero stars', () => {
  assert.equal(starsForLevel(emptyProgress(), 3), 0);
});

test('stars rise toward three as a level nears its clear target, but never reach three before clearing', () => {
  const halfway = withLevel(1, 10, 10, 10); // 10 of 20 needed, all correct
  assert.equal(starsForLevel(halfway, 1), 1);
  const almost = withLevel(1, 19, 19, 19); // 19 of 20
  assert.equal(starsForLevel(almost, 1), 2);
});

test('a cleared level always rates three stars', () => {
  const cleared = withLevel(1, WORDS_TO_CLEAR, 20, 22);
  assert.equal(starsForLevel(cleared, 1), 3);
});

test('total stars sums every level\'s own rating', () => {
  const record = withLevel(1, WORDS_TO_CLEAR, 20, 22); // cleared: 3 stars
  record.levelProgress['2'] = { solvedIds: Array.from({ length: 12 }, (_, i) => `w${i}`), correct: 12, attempts: 12 };
  assert.equal(totalStars(record), 3 + starsForLevel(record, 2));
});

test('ALL_LEVELS lists exactly the nine levels in order', () => {
  assert.deepEqual(ALL_LEVELS, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd game && npx tsx --test tests/levels.test.ts`
Expected: FAIL — `starsForLevel`/`totalStars`/`ALL_LEVELS` are not exported

- [ ] **Step 3: Implement in `lib/levels.ts`**

Append to the end of `game/lib/levels.ts`:

```ts
export const ALL_LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The map/mastery star rating for one level: full marks once cleared,
 * otherwise proportional progress toward the clear target, capped short
 * of three so three stars always means "cleared." */
export function starsForLevel(record: ProgressRecord, level: Level): number {
  const status = levelStatus(record, level);
  if (status.cleared) return 3;
  return Math.min(2, Math.floor((status.solved / Math.max(1, status.needed)) * 3));
}

/** The home screen's lifetime star total: every level's own rating, summed. */
export function totalStars(record: ProgressRecord): number {
  return ALL_LEVELS.reduce((sum, level) => sum + starsForLevel(record, level), 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd game && npx tsx --test tests/levels.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Use the shared list and formula in `LevelBar.tsx`**

In `game/components/LevelBar.tsx`, change the import and drop the local constant:

```ts
import { ALL_LEVELS, levelStatus, starsForLevel } from '@/lib/levels';
```

(remove the line `const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];`)

Replace every `LEVELS.map(` with `ALL_LEVELS.map(` (two call sites: the `ground` variant's node loop, and the `bar` variant's `level-rail` loop).

In the `ground` variant's node loop, replace:

```ts
        const each = levelStatus(record, level);
        const stars = each.cleared ? 3 : Math.min(2, Math.floor((each.solved / Math.max(1, each.needed)) * 3));
```

with:

```ts
        const each = levelStatus(record, level);
        const stars = starsForLevel(record, level);
```

- [ ] **Step 6: Add stars to `LevelPath.tsx`**

In `game/components/LevelPath.tsx`, change the import:

```ts
import { ALL_LEVELS, levelStatus, starsForLevel } from '@/lib/levels';
```

(remove the local `const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];` and replace `LEVELS.map(` with `ALL_LEVELS.map(`)

Insert a stars row right after the existing `<span className="level-text">...</span>` block and before the `level-meter` span:

```tsx
          {status.unlocked && <span className="level-node-stars" aria-hidden="true">
            {[1, 2, 3].map((star) => <b key={star} className={star <= starsForLevel(record, level) ? 'earned' : ''}>★</b>)}
          </span>}
```

- [ ] **Step 7: Add the small CSS for it**

In `game/app/globals.css`, right after the existing `.level-meter i { display: block; height: 100%; background: var(--grass); }` rule (in the "Level journey" section), add:

```css
.level-node-stars { position: absolute; right: 12px; top: 8px; display: flex; gap: 2px; font-size: 10px; }
.level-node-stars b { color: var(--surface2); }
.level-node-stars b.earned { color: var(--sun-deep); }
```

- [ ] **Step 8: Run the full test suite and type-check**

Run: `cd game && npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors

- [ ] **Step 9: Commit**

```bash
git add game/lib/levels.ts game/components/LevelBar.tsx game/components/LevelPath.tsx game/tests/levels.test.ts game/app/globals.css
git commit -m "feat: unify the map's star formula and show it in the level sheet too"
```

---

## Task 3: Coins and gems ledger (`lib/progress.ts`)

**Files:**
- Modify: `game/lib/progress.ts`
- Modify: `game/tests/progress.test.ts`

**Interfaces:**
- Consumes: `matchStars`, `coinsForMatch` (Task 1); `isLevelCleared` (existing, `lib/levels.ts`).
- Produces: `ProgressRecord.coins: number`, `ProgressRecord.gems: number`; `recordMatch(...)` now returns `{ record, isBest, previousBest, coinsEarned: number, gemEarned: boolean }` (adds two fields — existing callers reading `.record`/`.isBest`/`.previousBest` are unaffected). `MatchResult.level` is now typed `Level` instead of `number` (both existing call sites already pass a `Level`-typed value, so this is non-breaking).

- [ ] **Step 1: Write the failing tests**

In `game/tests/progress.test.ts`, add to the import block:

```ts
import { matchStars, coinsForMatch } from '../lib/economy';
```

Append at the end of the file:

```ts
test('emptyProgress starts with no coins or gems', () => {
  const record = emptyProgress();
  assert.equal(record.coins, 0);
  assert.equal(record.gems, 0);
});

test('a record saved before coins and gems existed loads with both at zero', () => {
  const legacy = { version: 1, lifetimePoints: 50, levelProgress: {} };
  const store = new Map<string, string>([[PROGRESS_KEY, JSON.stringify(legacy)]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  const loaded = loadProgress();
  assert.equal(loaded.coins, 0);
  assert.equal(loaded.gems, 0);
  delete (globalThis as Record<string, unknown>).localStorage;
});

test('recording a match pays coins for the stars earned and the words solved', () => {
  const record = emptyProgress();
  const outcome = recordMatch(record, { mode: 'solo', level: 1, points: 40, solvedIds: ['book.john', 'book.ruth'], wrong: 0 });
  const expectedStars = matchStars({ correct: 2, wrong: 0 });
  assert.equal(outcome.coinsEarned, coinsForMatch(expectedStars, 2));
  assert.equal(outcome.record.coins, outcome.coinsEarned);
});

test('a gem is earned exactly once, the match a level first clears', () => {
  let record = emptyProgress();
  const nineteen = Array.from({ length: 19 }, (_, i) => `book.word${i}`);
  record = recordMatch(record, { mode: 'solo', level: 1, points: 10, solvedIds: nineteen, wrong: 0 }).record;
  const clearing = recordMatch(record, { mode: 'solo', level: 1, points: 10, solvedIds: ['book.last'], wrong: 0 });
  assert.equal(clearing.gemEarned, true);
  assert.equal(clearing.record.gems, 1);
  const again = recordMatch(clearing.record, { mode: 'solo', level: 1, points: 10, solvedIds: ['book.last'], wrong: 0 });
  assert.equal(again.gemEarned, false, 'an already-cleared level does not pay a second gem');
  assert.equal(again.record.gems, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd game && npx tsx --test tests/progress.test.ts`
Expected: FAIL — `record.coins`/`record.gems`/`outcome.coinsEarned`/`outcome.gemEarned` are `undefined`

- [ ] **Step 3: Add the fields and imports**

At the top of `game/lib/progress.ts`, add (there are no existing imports in this file today):

```ts
import type { Level } from '@/lib/types';
import { isLevelCleared } from '@/lib/levels';
import { coinsForMatch, matchStars } from '@/lib/economy';
```

In the `ProgressRecord` type, add two fields right after `lifetimePoints: number;`:

```ts
  /** Earned automatically on every completed solo/together/Daily match --
   * see `recordMatch`. Time Attack and online rooms keep their own
   * separate scoring and never touch this. */
  coins: number;
  /** A rare bonus: one gem the first time a level's clear condition
   * becomes true, never again after. */
  gems: number;
```

In `emptyProgress()`, add right after `lifetimePoints: 0,`:

```ts
    coins: 0,
    gems: 0,
```

In `migrate()`'s return object, add right after `lifetimePoints: numberOr(parsed.lifetimePoints, 0),`:

```ts
    coins: numberOr(parsed.coins, 0),
    gems: numberOr(parsed.gems, 0),
```

Change `MatchResult.level`'s type from `number` to `Level` (the doc comment `/** 1..9 */` stays):

```ts
export type MatchResult = {
  mode: string;
  /** 1..9 */
  level: Level;
  points: number;
  solvedIds: string[];
  wrong: number;
  now?: Date;
};
```

- [ ] **Step 4: Update `recordMatch`**

Replace the function's signature and body:

```ts
export function recordMatch(
  record: ProgressRecord,
  result: MatchResult,
): { record: ProgressRecord; isBest: boolean; previousBest: number; coinsEarned: number; gemEarned: boolean } {
  const next: ProgressRecord = {
    ...record,
    bestByMode: { ...record.bestByMode },
    solveCounts: { ...record.solveCounts },
    levelProgress: { ...record.levelProgress },
    daysPlayed: [...record.daysPlayed],
  };

  const distinct = [...new Set(result.solvedIds)];

  next.lifetimePoints += result.points;
  next.totalSolved += distinct.length;
  next.totalWrong += result.wrong;

  const bestKey = `${result.mode}:${result.level}`;
  const previousBest = next.bestByMode[bestKey] ?? 0;
  const isBest = result.points > previousBest;
  if (isBest) next.bestByMode[bestKey] = result.points;

  for (const id of distinct) {
    next.solveCounts[id] = (next.solveCounts[id] ?? 0) + 1;
  }

  const levelKey = String(result.level);
  const existing = next.levelProgress[levelKey] ?? { solvedIds: [], correct: 0, attempts: 0 };
  next.levelProgress[levelKey] = {
    ...existing,
    solvedIds: [...new Set([...existing.solvedIds, ...distinct])],
    correct: existing.correct + distinct.length,
    attempts: existing.attempts + distinct.length + result.wrong,
  };

  // Coins are a flat reward for a completed match; a gem is rarer, earned
  // only the moment a level's clear condition first becomes true -- never
  // recomputed afterward, so re-playing an already-cleared level cannot
  // pay a second one.
  const wasCleared = isLevelCleared(record, result.level);
  const stars = matchStars({ correct: distinct.length, wrong: result.wrong });
  const coinsEarned = coinsForMatch(stars, distinct.length);
  next.coins += coinsEarned;
  const gemEarned = !wasCleared && isLevelCleared(next, result.level);
  if (gemEarned) next.gems += 1;

  const today = dayKey(result.now ?? new Date());
  next.daysPlayed = [today, ...next.daysPlayed.filter((day) => day !== today)].slice(0, MAX_DAYS_TRACKED);
  next.solvesToday = {
    day: today,
    count: (record.solvesToday.day === today ? record.solvesToday.count : 0) + distinct.length,
  };

  return { record: next, isBest, previousBest, coinsEarned, gemEarned };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd game && npm test`
Expected: PASS — every test file, including the pre-existing `progress.test.ts` tests that only read `.record`/`.isBest`/`.previousBest`

- [ ] **Step 6: Type-check**

Run: `cd game && npx tsc --noEmit`
Expected: no errors (confirms `DailyWord.tsx`'s and `GatherWordApp.tsx`'s existing `recordMatch` calls still satisfy the tightened `MatchResult.level: Level` type, since both already pass a `Level`-typed value)

- [ ] **Step 7: Commit**

```bash
git add game/lib/progress.ts game/tests/progress.test.ts
git commit -m "feat: add a coins-and-gems ledger earned on solo, together and Daily matches"
```

---

## Task 4: Home screen — top HUD, title plaque, compact mode row

**Files:**
- Modify: `game/components/GatherWordApp.tsx`
- Modify: `game/app/immersive.css`

**Interfaces:**
- Consumes: `totalStars` (Task 2, `lib/levels.ts`).
- Produces: `Header` gains two new props, `showingHome?: boolean` and `hud?: { totalStars: number; coins: number; gems: number }` — passed from the root component. `HomeScreen`'s JSX changes; its `startAs`/`level`/`setLevel`/`blocked`/`newlyUnlocked` props are unchanged, so nothing outside this file needs to change.

- [ ] **Step 1: Add the HUD branch to `Header`**

In `game/components/GatherWordApp.tsx`, change the `Header` function's signature and add a new early-return branch:

```tsx
function Header({ onHome, sound, setSound, homeMode = false, showingHome = false, hud, dailyNumber, dailyDone, onDaily }: {
  onHome: () => void; sound: boolean; setSound: (value: boolean) => void; homeMode?: boolean; showingHome?: boolean;
  hud?: { totalStars: number; coins: number; gems: number };
  dailyNumber?: number | null; dailyDone?: boolean; onDaily?: () => void;
}) {
  if (showingHome && hud) return <header className="app-header home-hud">
    <button type="button" className="home-hud-avatar" onClick={onHome} aria-label="WordIn home">
      <GameCharacter character="nuri" mood="idle" size="small" />
    </button>
    <div className="home-hud-currency" aria-label={`${hud.totalStars} stars, ${hud.coins} coins, ${hud.gems} gems`}>
      <span><b aria-hidden="true">★</b>{hud.totalStars}</span>
      <span><b aria-hidden="true">🪙</b>{hud.coins}</span>
      <span><b aria-hidden="true">💎</b>{hud.gems}</span>
    </div>
    <div className="home-hud-actions">
      <button type="button" className="home-hud-icon" onClick={onDaily} aria-label={dailyDone ? 'Daily Word, already done today' : 'Daily Word'}>
        <span aria-hidden="true">✎</span>
        {!dailyDone && <b className="home-hud-dot" aria-hidden="true" />}
      </button>
      {/* No dedicated settings screen exists yet -- the gear keeps today's
          one real option, sound, rather than adding a panel nothing else needs. */}
      <button type="button" className="home-hud-icon" onClick={() => setSound(!sound)} aria-label={`${sound ? 'Turn off' : 'Turn on'} sound`}>
        <span aria-hidden="true">⚙</span>
      </button>
    </div>
  </header>;
  return <header className={`app-header ${homeMode ? 'home-header' : ''}`}>
    <button className={`brand ${homeMode ? 'home-brand' : ''}`} type="button" onClick={onHome} aria-label="WordIn home">
      {homeMode
        ? <span><strong>Word<span>In</span></strong></span>
        : <span className="brand-mark inner-home-mark" aria-hidden="true">⌂</span>}
    </button>
    <div className="header-actions"><button type="button" className="icon-button" onClick={() => setSound(!sound)} aria-label={`${sound ? 'Turn off' : 'Turn on'} sound`}>{sound ? '♪' : '♪̸'}</button></div>
    {homeMode && <button type="button" className="home-daily-button" onClick={onDaily}>
      <span>Daily Word</span>
      <strong>{dailyDone ? '✓' : dailyNumber === null || dailyNumber === undefined ? '…' : `#${dailyNumber}`}</strong>
    </button>}
  </header>;
}
```

- [ ] **Step 2: Pass the new props from the root component**

In `GatherWordApp()`'s return statement, find the existing `<Header ... />` call and add `showingHome` and `hud`:

```tsx
<Header onHome={home} sound={sound} setSound={setSound} homeMode={showingMap} showingHome={showingHome} hud={{ totalStars: totalStars(progress), coins: progress.coins, gems: progress.gems }} dailyNumber={hydrated ? dailyKey.number : null} dailyDone={dailyDone} onDaily={() => startEntry('daily')} />
```

(`showingHome` already exists as a local variable in this component: `const showingHome = !dailyActive && !timeAttackActive && !localMode && screen === 'home';` — reuse it, do not redeclare it.)

Add the import at the top of the file:

```ts
import { highestUnlocked, runLengthFor, totalStars } from '@/lib/levels';
```

(this replaces the existing `import { highestUnlocked, runLengthFor } from '@/lib/levels';` line — just add `totalStars` to it)

- [ ] **Step 3: Rebuild `HomeScreen`'s JSX shell**

Replace the whole `HomeScreen` function body with:

```tsx
function HomeScreen({ startAs, level, setLevel, blocked, newlyUnlocked }: { startAs: (mode: EntryMode) => void; level: Level; setLevel: (level: Level) => void; blocked: string | null; newlyUnlocked: Level | null }) {
  const modes = [
    { id: 'solo' as const, title: 'Solo', tint: 'sky', character: 'nuri' as const },
    { id: 'together' as const, title: 'Together', tint: 'grass', character: 'boaz' as const },
    { id: 'online' as const, title: 'Online', tint: 'violet', character: 'mira' as const },
    { id: 'timeattack' as const, title: 'Time Attack', tint: 'berry', character: 'tali' as const },
  ];
  const stopped = Boolean(blocked);
  return <main className="home-shell">
    <section className="home-grid">
      <h1 className="home-title-plaque">WordIn</h1>
      <LevelBar selected={level} onSelect={setLevel} variant="ground" newlyUnlocked={newlyUnlocked} />
      {stopped && <p className="field-help warn" role="status">{blocked}</p>}
      <div className="home-mode-row" aria-label="Choose how to play">
        {modes.map((item) => {
          const gated = Boolean(blocked) && (item.id === 'solo' || item.id === 'together');
          return <button key={item.id} type="button" disabled={gated} onClick={() => startAs(item.id)} className={`home-mode-chip home-mode-tint-${item.tint}`} aria-label={`Play ${item.title}`}>
            <GameCharacter character={item.character} mood="idle" size="small" className="home-mode-chip-character" />
            <small>{item.title}</small>
          </button>;
        })}
      </div>
    </section>
  </main>;
}
```

- [ ] **Step 4: Delete the now-unused `SamplePuzzle` function**

`SamplePuzzle` (the `HAMABRA` scramble preview) is only ever called from the old `HomeScreen` JSX just replaced. Delete the whole function:

```tsx
function SamplePuzzle() {
  return <div className="sample-wrap home-scramble">
    <div className="tile-row" aria-label="Scrambled letters H A M A B R A">{'HAMABRA'.split('').map((letter, index) => <span className="letter-tile" key={`${letter}-${index}`}>{letter}</span>)}</div>
  </div>;
}
```

- [ ] **Step 5: Add the new CSS, and remove what it replaces**

In `game/app/immersive.css`, delete the `.map-quest-banner` block (lines defining `.map-quest-banner`, `.map-quest-banner small`, `.map-quest-banner strong`, `.map-quest-banner span`) and the whole `.home-puzzle-sign` block (`.home-puzzle-sign`, `.home-grid .home-puzzle-sign .hero-title`, `.home-puzzle-sign .home-scramble`, `.home-puzzle-sign .home-scramble::after`, `.home-puzzle-sign .home-scramble .letter-tile`) and the `.mode-dock`/`.mode-orb` block (`.mode-dock`, `.mode-orb` and its tint/active/character/strong rules) — none of these class names are referenced by any component after Step 3.

In their place, add:

```css
/* Home HUD -------------------------------------------------------- */
.home-hud {
  position: relative; z-index: 9; width: calc(100% - 24px); max-width: 480px;
  margin: 10px auto 0; padding: 6px 10px; display: flex; align-items: center; gap: 8px;
  border: 2px solid #f2d79d; border-radius: 16px 16px 18px 6px;
  background: linear-gradient(180deg, #5a3a24e8, #34251bea);
  box-shadow: inset 0 3px 0 #ffffff2e, 0 5px 0 #271a12, 0 10px 20px #14281e78;
  backdrop-filter: blur(5px);
}
.home-hud-avatar { flex: none; width: 38px; height: 38px; border: 2px solid #f2d79d; border-radius: 50%; padding: 0; background: #4a2e1c; display: grid; place-items: center; overflow: hidden; }
.home-hud-avatar .game-character { width: 30px; height: 30px; }
.home-hud-currency { display: flex; gap: 10px; flex: 1; min-width: 0; }
.home-hud-currency span { display: flex; align-items: center; gap: 3px; color: #fff4c8; font: 800 12px/1 var(--font-display); white-space: nowrap; }
.home-hud-currency b { font-size: 13px; }
.home-hud-actions { display: flex; gap: 6px; flex: none; }
.home-hud-icon { position: relative; width: 34px; height: 34px; padding: 0; border: 2px solid #f2d79d; border-radius: 10px 10px 11px 4px; background: var(--cube-gold); color: #50340e; font-size: 15px; display: grid; place-items: center; box-shadow: inset 0 2px 0 #ffffff70, 0 3px 0 #a96b1d; }
.home-hud-icon:active { translate: 0 3px; box-shadow: inset 0 2px 0 #ffffff70; }
.home-hud-dot { position: absolute; top: -3px; right: -3px; width: 9px; height: 9px; border-radius: 50%; background: #ff6b6b; border: 2px solid #34251b; }

/* Title plaque ------------------------------------------------------ */
.home-title-plaque {
  position: relative; z-index: 8; width: max-content; max-width: 80%; margin: 14px auto 0;
  padding: 9px 26px; border: 3px solid #c49251; border-radius: 13px 13px 15px 6px;
  background: linear-gradient(160deg, #f5dfaaed, #d7b77ae8);
  box-shadow: inset 0 3px 0 #fff8d2a6, inset 0 -5px 0 #9d6c3252, 0 5px 0 #76502c, 0 13px 23px #20322842;
  color: #60401e; font: 800 22px/1 var(--font-display); letter-spacing: .08em; text-transform: uppercase;
  text-shadow: 0 1px 0 #fff1bd; transform: rotate(-1deg);
}

/* Compact secondary mode row ---------------------------------------- */
.home-mode-row {
  position: absolute; z-index: 12; left: 8px; right: 8px; bottom: max(7px, env(safe-area-inset-bottom));
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; padding: 6px;
  border: 2px solid #f3d598; border-radius: 16px 16px 18px 7px;
  background: linear-gradient(180deg, #5a3a24d0, #34251bd8);
  box-shadow: inset 0 2px 0 #ffffff26, 0 4px 0 #271a12, 0 9px 16px #14281e60;
  backdrop-filter: blur(4px);
}
.home-mode-chip {
  display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0;
  padding: 4px 2px; border: 2px solid #eafffb; border-radius: 11px 11px 12px 4px;
  background: var(--cube-cyan); color: #173d3c;
  box-shadow: inset 0 3px 0 #ffffff79, 0 3px 0 #167484;
}
.home-mode-chip:active:not(:disabled) { translate: 0 3px; box-shadow: inset 0 2px 0 #ffffff70; }
.home-mode-tint-grass { background: linear-gradient(#87e6a0, #3baa66); box-shadow: inset 0 3px 0 #ffffff79, 0 3px 0 #236f45; }
.home-mode-tint-violet { background: linear-gradient(#c6a2f2, #8754c8); color: #fff; box-shadow: inset 0 3px 0 #ffffff79, 0 3px 0 #543489; }
.home-mode-tint-berry { background: linear-gradient(#ff9d88, #e65668); color: #fff; box-shadow: inset 0 3px 0 #ffffff79, 0 3px 0 #9e3447; }
.home-mode-chip-character { width: 28px; height: 28px; }
.home-mode-chip small { font: 800 8px/1 var(--font-display); text-shadow: 0 1px 0 #ffffff6b; }
```

- [ ] **Step 6: Type-check and manually verify in the browser**

Run: `cd game && npx tsc --noEmit`
Expected: no errors

Run: `cd game && npm run dev`, open the app, confirm: the top HUD shows an avatar, ★/🪙/💎 counts, and two small icon buttons; a "WordIn" title plaque sits below it; the old scrambled-letters preview and the big circular mode-orb dock are both gone; a slim four-chip row (Solo/Together/Online/Time Attack) sits at the bottom and still starts each mode; the Solo/Together chips are disabled exactly when the existing "no playable words" message shows.

- [ ] **Step 7: Commit**

```bash
git add game/components/GatherWordApp.tsx game/app/immersive.css
git commit -m "feat: rebuild the home screen's top HUD and title plaque to match the reference art"
```

---

## Task 5: Home screen — medallions, signposts, foreground mascot, dead-CSS cleanup

**Files:**
- Modify: `game/components/GatherWordApp.tsx`
- Modify: `game/components/LevelBar.tsx`
- Modify: `game/app/immersive.css`
- Modify: `game/app/globals.css`

**Interfaces:** No exported signatures change in this task — visual only.

- [ ] **Step 1: Remove the "windy" dotted trail**

In `game/components/LevelBar.tsx`, in the `ground` variant's return, delete this line:

```tsx
      <span className="ground-path-trail" aria-hidden="true" />
```

In `game/app/immersive.css`, delete the `.ground-path-trail` rule block entirely (the `position: absolute; inset: 0; ... radial-gradient(...)` rule that draws the dotted meandering line — this is the "windy circles" element).

- [ ] **Step 2: Restyle the level medallions as carved medals**

In `game/app/immersive.css`, replace the existing `.ground-level-node`, `.ground-level-node.selected`, and `.ground-level-node.cleared:not(.selected)` rules with:

```css
.ground-level-node {
  width: 46px; height: 46px; border: 4px solid #f4dfb2;
  border-radius: 50%; padding: 0;
  background: radial-gradient(circle at 38% 28%, #b7b2a0, #6b6a5f 74%);
  box-shadow: inset 0 4px 0 #ffffff59, inset 0 -5px 0 #3d413c66, 0 0 0 3px #8b5f35, 0 5px 0 #4a4d49, 0 9px 14px #263f313b;
  font: 800 18px/1 var(--font-display); color: #fff9e6;
}
.ground-level-node.selected {
  border-color: #fff1a4;
  background: radial-gradient(circle at 40% 26%, #ffe388, #dd8f19 76%);
  box-shadow: inset 0 4px 0 #fff6b879, inset 0 -5px 0 #9854165e, 0 0 0 3px #a86517, 0 5px 0 #8f531a, 0 0 22px #ffe985;
  animation: current-node 1.8s ease-in-out infinite;
}
.ground-level-node.cleared:not(.selected) {
  border-color: #fff4c2;
  background: radial-gradient(circle at 38% 25%, #9ae8ab, #2d8b5c 78%);
  box-shadow: inset 0 4px 0 #ffffff70, inset 0 -5px 0 #1f5a3d5e, 0 0 0 3px #d9c07a, 0 5px 0 #226d50;
}
```

(the outer `0 0 0 3px <color>` ring is the "medal rim" that reads as a decoration rather than a flat gradient circle; cleared levels get a gold-parchment rim instead of the plain green border they had before)

- [ ] **Step 3: Add the signposts and the foreground mascot**

In `game/components/GatherWordApp.tsx`, in `HomeScreen`'s JSX, add the signposts and the large mascot inside `.home-grid`, right after the `<h1 className="home-title-plaque">` line and before `<LevelBar .../>`:

```tsx
      <div className="home-signposts" aria-hidden="true">
        {['Rivers', 'Villages', 'High Places', 'New World'].map((label) => <span key={label} className="home-signpost">{label}</span>)}
      </div>
```

And right after the `<LevelBar .../>` line (still inside `.home-grid`, before the `{stopped && ...}` line), add:

```tsx
      <GameCharacter character="nuri" mood="idle" size="large" className="home-mascot" />
```

- [ ] **Step 4: Add the CSS for both**

In `game/app/immersive.css`, in the "Home map" section, add:

```css
.home-signposts {
  position: absolute; z-index: 6; left: 6px; top: 90px; display: grid; gap: 6px;
}
.home-signpost {
  display: block; padding: 5px 10px; border: 2px solid #8a5a2e; border-radius: 6px 6px 7px 3px;
  background: linear-gradient(160deg, #c9945a, #8a5a2e); color: #fff3d6;
  font: 700 9px/1 var(--font-display); letter-spacing: .06em; text-transform: uppercase;
  box-shadow: inset 0 1px 0 #ffffff40, 0 3px 0 #5c3b1d;
  transform: rotate(-1.5deg);
}
.home-signpost:nth-child(2n) { transform: rotate(1deg); }

.home-mascot {
  position: absolute; z-index: 7; left: 8px; bottom: 78px; width: 120px !important; height: 120px !important;
  pointer-events: none;
}
```

- [ ] **Step 5: Remove dead legacy CSS**

Confirm first that nothing still references these class names:

Run: `cd game && grep -rn "mode-tile\|mode-grid\b\|mode-icon\|mode-badge\|mode-dot\b\|daily-tile\|mode-sub\b\|mode-level\b\|daily-bar\b" components app --include='*.tsx'`
Expected: no output (these were already confirmed dead during planning — this step is a guard against having missed a reference)

If the grep is empty, delete from `game/app/globals.css`:
- The whole `.mode-grid` / `.mode-tile` / `.mode-tile-main` / `.mode-icon` / `.mode-tint-*` / `.mode-info-button` / `.mode-detail` block (originally around the "Home — puzzle-first, single column, mobile-native" section, roughly lines 252–299 before this plan's earlier edits shifted line numbers — locate by the `.mode-grid { display: grid;` rule and delete through the matching `@media (max-width: 420px) { .mode-grid ... }` rule that follows it).
- The `.daily-tile`, `.mode-sub`, `.mode-badge`, `.mode-dot` rules (in the "Phase B" section, locate by the comment `/* The Daily Word tile spans the grid ... */`).
- The `.daily-bar` block and its rules (locate by the comment `/* Daily bar — the habit sits directly under the streak it feeds ... */`).
- The whole "Phone home screen" section at the end of the file (locate by the comment `/* Phone home screen — the world itself is the layout ... */` through the end of the file) — this entire section styles `.home-header`, `.home-brand`, `.home-daily-button`, a second five-position `.ground-level-node`/`.ground-level-0..4` definition, and `.mode-grid`/`.home-grid .mode-grid`, all superseded by Tasks 4–5's new classes and no longer reachable from any component after Steps 1–3 of Task 4 and this task.

Also remove the second, older `.ground-level-path` / `.ground-level-node` / `.ground-level-0` through `.ground-level-4` / `.ground-level-more` block that sits earlier in the same "Phone home screen" section (five positions, superseded by `immersive.css`'s nine-position version, which remains).

- [ ] **Step 6: Type-check, lint, and manually verify**

Run: `cd game && npx tsc --noEmit && npm run lint`
Expected: no errors

Run: `cd game && npm run dev`, open the app, confirm: no dotted trail between medallions; medallions read as carved medals with a rim color that changes for locked/current/cleared; four signpost labels (Rivers/Villages/High Places/New World) sit stacked on the left; a large Nuri stands in the foreground; nothing from the deleted CSS blocks visibly changed on any other screen (setup, results, lobby, gameplay) since those never used the deleted selectors.

- [ ] **Step 7: Commit**

```bash
git add game/components/GatherWordApp.tsx game/components/LevelBar.tsx game/app/immersive.css game/app/globals.css
git commit -m "feat: restyle the journey path as carved medals and remove the dotted trail and dead home-screen CSS"
```

---

## Task 6: Consolidated `Results` component

**Files:**
- Create: `game/components/Results.tsx`
- Modify: `game/components/GatherWordApp.tsx`
- Modify: `game/components/DailyWord.tsx`
- Modify: `game/app/immersive.css`

**Interfaces:**
- Consumes: `matchStars` (Task 1); `RewardStars` (existing, `components/GameChrome.tsx`); `GameCharacter` (existing).
- Produces: `Results` component, `ResultStat` type, both exported from `components/Results.tsx`.

- [ ] **Step 1: Write the component**

Create `game/components/Results.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { RewardStars } from '@/components/GameChrome';
import { GameCharacter, type GameCharacterId } from '@/components/GameCharacter';

export type ResultStat = { label: string; value: string | number };

/** The one results shell every mode's finish screen renders into: stars,
 * mascot, headline, an optional coins-earned and scripture-reward line, an
 * optional gem callout, mode-specific extra content (a leaderboard, a
 * streak header, ...), a stat grid, and one dominant primary action. */
export function Results({
  character = 'nuri', stars, subtitle, title, banner, headline, coinsEarned, gemEarned, scripture, extra, stats,
  primaryLabel, onPrimary, secondaryAction, onHome,
}: {
  character?: GameCharacterId;
  stars: number;
  subtitle: string;
  title: string;
  banner?: ReactNode;
  headline: { value: string | number; label: string };
  coinsEarned?: number;
  gemEarned?: boolean;
  scripture?: string;
  extra?: ReactNode;
  stats: ResultStat[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryAction?: ReactNode;
  onHome: () => void;
}) {
  return <main className="page-shell result-stage"><section className="panel results-panel result-popup">
    <div className={`result-mascot result-mascot-${stars >= 2 ? 'happy' : 'brave'}`}>
      <GameCharacter character={character} mood={stars >= 2 ? 'cheer' : 'oops'} size="large" />
    </div>
    <RewardStars earned={stars} />
    <p className="section-kicker">{subtitle}</p>
    <h1 className="page-title">{title}</h1>
    {banner}
    <div className="result-score"><strong>{headline.value}</strong><span>{headline.label}</span></div>
    {coinsEarned !== undefined && <div className="reward-scroll"><span aria-hidden="true">✦</span><div><small>Coins earned</small><strong>+{coinsEarned}</strong></div><span aria-hidden="true">✦</span></div>}
    {scripture && <div className="scripture-book" role="status"><span className="scripture-book-icon" aria-hidden="true">📖</span><div><small>Scripture reward</small><strong>{scripture}</strong></div></div>}
    {gemEarned && <p className="gem-earned-banner" role="status"><span aria-hidden="true">💎</span> New gem earned!</p>}
    {extra}
    <div className="stat-grid">{stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
    <div className="result-actions">
      <button className="primary-button" type="button" onClick={onPrimary}>{primaryLabel}</button>
      {secondaryAction}
      <button className="text-button" type="button" onClick={onHome}>Map</button>
    </div>
  </section></main>;
}
```

- [ ] **Step 2: Add its CSS**

In `game/app/immersive.css`, right after the existing `.reward-scroll` rule block, add:

```css
.scripture-book {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  margin: 10px auto; padding: 8px 15px; border: 2px solid #8a5a2e; border-radius: 8px 8px 12px 4px;
  background: linear-gradient(160deg, #f5dfaa, #d7b77a); box-shadow: inset 0 2px 0 #fff9d8, 0 3px 0 #6b4a25;
  color: #4b3312;
}
.scripture-book-icon { font-size: 20px; }
.scripture-book small { display: block; color: #7a5628; font-size: 7px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; }
.scripture-book strong { display: block; font: 700 12px/1.2 var(--font-display); }
.gem-earned-banner {
  display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 10px;
  color: #7548b3; font: 700 12px/1 var(--font-display);
}
```

- [ ] **Step 3: Migrate solo/together's `Results`**

In `game/components/GatherWordApp.tsx`, add the import:

```ts
import { Results } from '@/components/Results';
import { matchStars } from '@/lib/economy';
```

Extend `LocalGame`'s `summary` state type and the object built for it. Change:

```ts
  const [summary, setSummary] = useState<{ points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number } | null>(null);
```

to:

```ts
  const [summary, setSummary] = useState<{ points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number; coinsEarned: number; gemEarned: boolean } | null>(null);
```

In `next()`, where `setSummary({...})` is called, add the two new fields:

```ts
      setSummary({
        points: headline,
        isBest: outcome.isBest,
        previousBest: outcome.previousBest,
        lifetime: outcome.record.lifetimePoints,
        mastered: masteredCount(outcome.record),
        coinsEarned: outcome.coinsEarned,
        gemEarned: outcome.gemEarned,
      });
```

Delete the whole standalone `Results` function (the one starting `function Results({ mode, scores, correct, wrong, total, summary, unlocked, rematch, changeSet, home }...` through its closing `}`).

In `LocalGame`, change the line `if (finished) return <Results mode={mode} scores={scores} correct={correctCount} wrong={wrongCount} total={recipe.puzzles.length} summary={summary} unlocked={unlocked} rematch={rematch} changeSet={onChangeSet} home={onHome} />;` to:

```tsx
  if (finished) {
    const ranking = [...scores].sort((a, b) => b.score - a.score);
    const winner = ranking[0];
    const accuracy = correctCount + wrongCount === 0 ? 0 : Math.round((correctCount / Math.max(1, correctCount + wrongCount)) * 100);
    const stars = matchStars({ correct: correctCount, wrong: wrongCount });
    return <Results
      character={mode === 'solo' ? 'nuri' : 'boaz'}
      stars={stars}
      subtitle="Quest complete"
      title={mode === 'teams' ? `${winner.name} wins!` : mode === 'solo' ? 'Trail cleared!' : 'Great teamwork!'}
      banner={unlocked ? <div className="unlock-banner" role="status">
        <span className="unlock-key" aria-hidden="true">🔓</span>
        <strong>{unlocked.name} unlocked</strong>
        <small>A new level is open on your journey.</small>
      </div> : undefined}
      headline={{ value: winner.score, label: 'points' }}
      coinsEarned={summary?.coinsEarned}
      gemEarned={summary?.gemEarned}
      scripture={unlocked ? `${unlocked.name} is open` : `${correctCount} words remembered`}
      extra={<>
        {summary && <div className="score-compare">
          {summary.isBest
            ? <p className="best-flag">Your best yet at this level — previous best {summary.previousBest}</p>
            : <p className="best-flag quiet">Your best at this level is {summary.previousBest}</p>}
          <div className="lifetime-row">
            <span><strong>{summary.lifetime.toLocaleString()}</strong>Points all time</span>
            <span><strong>{summary.mastered}</strong>Words mastered</span>
          </div>
        </div>}
        {mode === 'teams' && <div className="leaderboard">{ranking.map((team, index) => <div key={team.id}><span>{index + 1}</span><i style={{ background: team.color }} /><strong>{team.name}</strong><b>{team.score}</b></div>)}</div>}
      </>}
      stats={[{ label: 'Solved', value: correctCount }, { label: 'Misses', value: wrongCount }, { label: 'Accuracy', value: `${accuracy}%` }]}
      primaryLabel="Play again"
      onPrimary={rematch}
      secondaryAction={<button className="secondary-button" type="button" onClick={onChangeSet} aria-label="Change word set">⚙</button>}
      onHome={onHome}
    />;
  }
```

- [ ] **Step 4: Migrate Time Attack's results**

In `TimeAttackGame`'s `finished` branch, replace the whole `if (finished) { ... }` block with:

```tsx
  if (finished) {
    const best = Math.max(score, personalBest);
    const cleared = finished === 'cleared';
    const ended = finished === 'ended';
    const stars = matchStars({ correct: solved, wrong: strikes });
    return <>
      {score >= personalBest && score > 0 && <Confetti key="final" />}
      <Results
        character="tali"
        stars={stars}
        subtitle="Time Attack"
        title={cleared ? 'Perfect clear!' : ended ? 'Run ended' : 'Time’s up!'}
        headline={{ value: score, label: 'points' }}
        stats={[{ label: 'Solved', value: solved }, { label: 'Reached', value: LEVEL_NAMES[band - 1] }, { label: 'Best score', value: best }]}
        primaryLabel="Play again"
        onPrimary={onReplay}
        onHome={onHome}
      />
    </>;
  }
```

(Time Attack tracks misses as `strikes`, capped at 3 by the existing "three strikes ends the run" rule, so `wrong: strikes` — a run ended by the clock/`onReplay` before three strikes keeps whatever `strikes` already holds. `subtitle`/`headline`/`stats` reuse the exact copy and values the old inline JSX rendered; `coinsEarned`/`scripture`/`banner` are omitted since Time Attack never calls `recordMatch`, matching the Global Constraints note above.)

- [ ] **Step 5: Migrate `DailyWord`'s done branch**

In `game/components/DailyWord.tsx`, add the imports:

```ts
import { Results } from '@/components/Results';
import { matchStars } from '@/lib/economy';
```

Replace the `if (done) { ... }` block's `return` with:

```tsx
  if (done) {
    const state = streakState(record, now);
    const stars = matchStars({ correct: done.solved ? 1 : 0, wrong: done.solved ? done.guesses - 1 : done.guesses });
    return <Results
      character="mira"
      stars={stars}
      subtitle={`Daily #${daily.number} · ${levelName}`}
      title={done.solved ? 'Solved it.' : 'Not today.'}
      banner={note?.milestone ? <div className="milestone-banner" role="status">
        <span className="milestone-spark" aria-hidden="true">✦</span>
        <strong>{note.milestone} days in a row</strong>
        <small>A freeze is yours — one missed day is covered.</small>
      </div> : undefined}
      headline={{ value: done.points, label: 'points' }}
      coinsEarned={undefined}
      scripture={entry.references[0]}
      extra={<>
        <p className="page-subtitle">The answer was <strong>{entry.display}</strong> — {entry.references[0]}</p>
        <div className="daily-scoreline">
          <div><strong>{done.guesses}</strong><span>{done.guesses === 1 ? 'Guess' : 'Guesses'}</span></div>
          <div><strong>{done.hintsUsed}</strong><span>Hints</span></div>
          <div><strong>{done.points}</strong><span>Points</span><ScoreFlight score={done.points} initialScore={note ? 0 : done.points} /></div>
        </div>
        {note && <p className="daily-note"><strong>{note.headline}</strong> {note.detail}</p>}
        <StreakHeader />
        <p className="daily-tomorrow">{state.playedToday ? 'Come back tomorrow for a new word.' : 'A new word is waiting.'}</p>
      </>}
      stats={[]}
      primaryLabel={sharing ? '…' : 'Share result ↗'}
      onPrimary={share}
      onHome={onHome}
    />;
  }
```

`Results`' `stats` prop accepts an empty array (Daily Word's per-guess/hints/points figures are already shown via `.daily-scoreline` inside `extra`, matching how the old code laid them out, rather than duplicating them into the generic 3-column `.stat-grid`).

Daily Word's `recordMatch` call (`finish()`) already produces a `coinsEarned`/`gemEarned` via Task 3, but the `DailyResult` type stored on the record (`daily: DailyResult | null`) does not carry them today, and this pass does not add persistence for a value only shown once right after finishing — leave `coinsEarned={undefined}` here (no coins line on the Daily Word result) rather than plumbing a new field through `DailyResult` for a single display, which is out of scope for this pass.

- [ ] **Step 6: Migrate `OnlineResults`**

In `game/components/GatherWordApp.tsx`, add a small rank-based star helper right above `OnlineResults`:

```ts
/** Online rooms track only a cumulative `score` per player/side, not
 * correct/wrong counts, so results use a rank-based approximation instead
 * of `matchStars` -- top score (or a tie for it) is a clean sweep, the
 * middle of the pack is solid, and a lone or zero score is a consolation
 * star rather than a flat constant every room used to show. */
function rankStars(score: number, allScores: number[]): number {
  if (score <= 0) return allScores.every((value) => value <= 0) ? 0 : 1;
  const best = Math.max(...allScores, 0);
  if (score >= best) return 3;
  const sorted = [...allScores].sort((a, b) => b - a);
  const medianIndex = Math.floor(sorted.length / 2);
  return score >= (sorted[medianIndex] ?? 0) ? 2 : 1;
}
```

Replace the `OnlineResults` function body with:

```tsx
function OnlineResults({ snapshot, isHost, action, leave }: { snapshot: RoomSnapshot; isHost: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const sides = snapshot.mode === 'teams' ? ([['sun', 'Sun Team'], ['olive', 'Olive Team']] as const).map(([id, name]) => ({ id, name, score: snapshot.players.filter((player) => player.teamId === id).reduce((sum, player) => sum + player.score, 0) })) : snapshot.players.map((player) => ({ id: player.id, name: player.name, score: player.score }));
  const ranking = [...sides].sort((a, b) => b.score - a.score);
  const viewerScore = sides.find((side) => side.id === snapshot.viewerId)?.score ?? ranking[0]?.score ?? 0;
  const stars = rankStars(viewerScore, sides.map((side) => side.score));
  return <Results
    character="tali"
    stars={stars}
    subtitle={`Room ${snapshot.code}`}
    title={snapshot.mode === 'cooperative' ? 'Great teamwork!' : `${ranking[0]?.name} wins!`}
    headline={{ value: ranking[0]?.score ?? 0, label: 'points' }}
    scripture={`${snapshot.puzzleCount} words shared`}
    extra={snapshot.mode === 'teams'
      ? <div className="leaderboard">{ranking.map((side, index) => <div key={side.id}><span>{index + 1}</span><span className="avatar">{side.name[0]}</span><strong>{side.name}</strong><b>{side.score}</b></div>)}</div>
      : <Standings players={snapshot.players} viewerId={snapshot.viewerId} answeredIds={[]} phase="results" />}
    stats={[]}
    primaryLabel={isHost ? 'Play again ↻' : 'Leave'}
    onPrimary={isHost ? () => action({ action: 'rematch' }) : leave}
    secondaryAction={isHost ? <button className="secondary-button" type="button" aria-label="Change match settings" onClick={() => action({ action: 'lobby' })}>⚙</button> : undefined}
    onHome={leave}
  />;
}
```

Only the host could rematch or change settings in the old code (guarded there by `{isHost && <>...</>}`); a non-host instead gets "Leave" as the primary action. This does mean a non-host sees both a "Leave" primary button and the "Map" text button `Results` always renders underneath it — both work (`Results` has no conditional slot for omitting the bottom text button, and adding one for this single call site is not worth it), so accept that minor redundancy rather than special-casing the component.

- [ ] **Step 7: Type-check and manually verify**

Run: `cd game && npx tsc --noEmit`
Expected: no errors

Run: `cd game && npm run dev`, then manually play each mode to its results screen and confirm each one renders correctly:
- Solo: stars, "+N coins", "Trail cleared!", accuracy/solved/misses stats, best-flag/lifetime row, Play again / ⚙ / Map.
- Together (co-op and teams): same, plus the teams leaderboard when relevant.
- Time Attack: stars, points, Solved/Reached/Best-score stats, no coins line, Play again / Map.
- Daily Word: stars, the scripture citation, guesses/hints/points scoreline, streak header, Share result / Map.
- Online (individuals, teams, cooperative): stars, ranking/leaderboard or Standings, "words shared" line, host sees Play again/⚙, non-host sees Leave.

- [ ] **Step 8: Commit**

```bash
git add game/components/Results.tsx game/components/GatherWordApp.tsx game/components/DailyWord.tsx game/app/immersive.css
git commit -m "feat: consolidate the four results screens into one shared component"
```

---

## Task 7: Gameplay tool icons and an online pause slot

**Files:**
- Modify: `game/components/GameChrome.tsx`
- Modify: `game/components/GatherWordApp.tsx`
- Modify: `game/components/DailyWord.tsx`
- Modify: `game/app/immersive.css`

**Interfaces:**
- Produces: `MissionHud` gains an optional `pauseButton?: ReactNode` prop, rendered before the existing `character` slot. Every other `MissionHud` call site is unaffected (prop is optional).

- [ ] **Step 1: Add the pause slot to `MissionHud`**

In `game/components/GameChrome.tsx`, change `MissionHud`'s signature and JSX:

```tsx
export function MissionHud({ character, pauseButton, mission, progress, score, timer, urgent = false }: {
  character?: ReactNode;
  pauseButton?: ReactNode;
  mission: string;
  progress: number;
  score?: ReactNode;
  timer?: ReactNode;
  urgent?: boolean;
}) {
  return <div className={`mission-hud${urgent ? ' urgent' : ''}${pauseButton ? ' has-pause' : ''}`}>
    {pauseButton && <div className="mission-hud-pause">{pauseButton}</div>}
    {character && <div className="mission-hud-guide">{character}</div>}
    <div className="mission-hud-progress">
      <strong>{mission}</strong>
      <span aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span>
    </div>
    {timer && <div className="mission-hud-chip mission-hud-timer">{timer}</div>}
    {score && <div className="mission-hud-chip mission-hud-score">{score}</div>}
  </div>;
}
```

- [ ] **Step 2: Add its CSS**

In `game/app/immersive.css`, right after the existing `.mission-hud` rule, add:

```css
.mission-hud.has-pause { grid-template-columns: 30px 48px minmax(60px, 1fr) auto auto; }
.mission-hud-pause { display: grid; place-items: center; }
.mission-hud-pause button {
  width: 28px; height: 28px; padding: 0; border: 2px solid #fff0b7; border-radius: 8px;
  background: linear-gradient(#8ddbc4, #3f9e81); color: #123c32; font-size: 13px;
  box-shadow: inset 0 2px 0 #ffffff74, 0 3px 0 #24684f;
}
```

- [ ] **Step 3: Wire pause into `OnlineRoom`'s `MissionHud`**

In `game/components/GatherWordApp.tsx`, `OnlineRoom`'s existing `<MissionHud .../>` call, add the `pauseButton` prop and remove the now-redundant pause button from the separate `.host-controls` row above it (keep skip/end there — only pause moves):

Change:

```tsx
    {isHost && <div className="host-controls">
      {snapshot.status === 'PUZZLE_OPEN' && <button type="button" className="host-tool" title={paused ? 'Resume' : 'Pause'} aria-label={paused ? 'Resume' : 'Pause'} disabled={busy} onClick={() => action({ action: paused ? 'resume' : 'pause' })}>{paused ? '▶' : 'Ⅱ'}</button>}
      {snapshot.status === 'PUZZLE_OPEN' && <button type="button" className="host-tool" title="Skip puzzle" aria-label="Skip puzzle" disabled={busy} onClick={() => action({ action: 'skip' })}>»</button>}
      <button type="button" className="host-tool danger" title="End match" aria-label="End match" disabled={busy} onClick={() => action({ action: 'end' })}>■</button>
    </div>}
    {paused && <p className="notice">The host paused this puzzle.</p>}
    <MissionHud character={<GameCharacter character="tali" mood={snapshot.status === 'PUZZLE_RESOLVED' ? viewerSolve ? 'cheer' : 'oops' : 'think'} size="small" />} mission={`${snapshot.currentIndex + 1} / ${snapshot.puzzleCount}`} progress={((snapshot.currentIndex + 1) / snapshot.puzzleCount) * 100} score={snapshot.mode === 'teams' ? <div className="hud-score-row">{teamScores.map((side) => <span key={side.id}>{side.name}<strong>{side.score}</strong></span>)}</div> : <><span aria-hidden="true">★</span><strong>{viewer?.score ?? 0}</strong></>} />
```

to:

```tsx
    {isHost && <div className="host-controls">
      {snapshot.status === 'PUZZLE_OPEN' && <button type="button" className="host-tool" title="Skip puzzle" aria-label="Skip puzzle" disabled={busy} onClick={() => action({ action: 'skip' })}>»</button>}
      <button type="button" className="host-tool danger" title="End match" aria-label="End match" disabled={busy} onClick={() => action({ action: 'end' })}>■</button>
    </div>}
    {paused && <p className="notice">The host paused this puzzle.</p>}
    <MissionHud
      pauseButton={isHost && snapshot.status === 'PUZZLE_OPEN' ? <button type="button" title={paused ? 'Resume' : 'Pause'} aria-label={paused ? 'Resume' : 'Pause'} disabled={busy} onClick={() => action({ action: paused ? 'resume' : 'pause' })}>{paused ? '▶' : 'Ⅱ'}</button> : undefined}
      character={<GameCharacter character="tali" mood={snapshot.status === 'PUZZLE_RESOLVED' ? viewerSolve ? 'cheer' : 'oops' : 'think'} size="small" />}
      mission={`${snapshot.currentIndex + 1} / ${snapshot.puzzleCount}`}
      progress={((snapshot.currentIndex + 1) / snapshot.puzzleCount) * 100}
      score={snapshot.mode === 'teams' ? <div className="hud-score-row">{teamScores.map((side) => <span key={side.id}>{side.name}<strong>{side.score}</strong></span>)}</div> : <><span aria-hidden="true">★</span><strong>{viewer?.score ?? 0}</strong></>}
    />
```

(Solo, Together, Time Attack, and Daily Word have no pause state today and are out of scope for real pause functionality — their `MissionHud` calls simply do not pass `pauseButton`, so nothing changes for them beyond the icon-set swap in the next step.)

- [ ] **Step 4: Swap the tool icon set everywhere, dropping Undo**

There are four `tool-dock`/`arcade-tools` blocks to update: `LocalGame` (in `game/components/GatherWordApp.tsx`), `DailyWord` (in `game/components/DailyWord.tsx`), `TimeAttackGame`'s active-play tools (`game/components/GatherWordApp.tsx`), and `OnlineRoom` (`game/components/GatherWordApp.tsx`).

In `LocalGame`, change:

```tsx
      : <div className="game-actions tool-dock"><GameTool icon="↻" label="Shuffle" onClick={shuffleTray} /><GameTool icon="↶" label="Undo" disabled={placed.length === 0} onClick={undo} tone="olive" /><GameTool icon="×" label="Clear" disabled={placed.length === 0} onClick={() => { rejectedRef.current = null; setPlaced([]); }} tone="coral" /><GameTool icon="✦" label={nextHint ? HINT_LABELS[nextHint.kind] : 'Hints used'} count={Math.max(0, ladder.length - hints)} disabled={!nextHint} onClick={takeHint} tone="gold" /><GameTool icon="◉" label="Reveal" onClick={reveal} tone="violet" /></div>}
```

to:

```tsx
      : <div className="game-actions tool-dock"><GameTool icon="💡" label={nextHint ? HINT_LABELS[nextHint.kind] : 'Hints used'} count={Math.max(0, ladder.length - hints)} disabled={!nextHint} onClick={takeHint} tone="gold" /><GameTool icon="↻" label="Shuffle" onClick={shuffleTray} /><GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => { rejectedRef.current = null; setPlaced([]); }} tone="coral" /><GameTool icon="🧭" label="Reveal" onClick={reveal} tone="violet" /></div>}
```

(`undo` and the `rejectedRef`-clearing `Undo` button are removed; a placed tile can still be removed individually by tapping it, unchanged in `TileBoard`. Delete the now-unused `undo` function in `LocalGame` — `const undo = () => { if (placed.length === 0) return; playTap(); rejectedRef.current = null; setPlaced(placed.slice(0, -1)); };` — since nothing calls it after this edit.)

In `DailyWord.tsx`, change:

```tsx
        <GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(daily.scramble.length)); }} />
        <GameTool icon="↶" label="Undo" disabled={placed.length === 0} onClick={() => { playTap(); setPlaced(placed.slice(0, -1)); }} tone="olive" />
        <GameTool icon="×" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" />
        <GameTool icon="✦" label={nextHint ? HINT_LABELS[nextHint.kind] : 'Hints used'} count={Math.max(0, MAX_HINTS - hints)} disabled={!nextHint} onClick={takeHint} tone="gold" />
        <button type="button" className="check-button" onClick={check}>Check answer</button>
        <GameTool icon="◉" label="Give up" onClick={() => finish(false, Math.max(1, guesses))} tone="violet" />
```

to:

```tsx
        <GameTool icon="💡" label={nextHint ? HINT_LABELS[nextHint.kind] : 'Hints used'} count={Math.max(0, MAX_HINTS - hints)} disabled={!nextHint} onClick={takeHint} tone="gold" />
        <GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(daily.scramble.length)); }} />
        <GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" />
        <button type="button" className="check-button" onClick={check}>Check answer</button>
        <GameTool icon="🧭" label="Give up" onClick={() => finish(false, Math.max(1, guesses))} tone="violet" />
```

In `TimeAttackGame`'s active-play tools, change:

```tsx
      {!resolved && <div className="game-actions tool-dock arcade-tools"><GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(puzzle.scramble.length)); }} /><GameTool icon="↶" label="Undo" disabled={placed.length === 0} onClick={() => { playTap(); setPlaced(placed.slice(0, -1)); }} tone="olive" /><GameTool icon="×" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" /></div>}
```

to:

```tsx
      {!resolved && <div className="game-actions tool-dock arcade-tools"><GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(puzzle.scramble.length)); }} /><GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" /></div>}
```

(Time Attack never had a hint or reveal tool, so it keeps just shuffle and clear — Undo is dropped the same way.)

In `OnlineRoom`'s tool dock, change:

```tsx
      : <div className="game-actions tool-dock"><GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(puzzle.scramble.length)); }} /><GameTool icon="↶" label="Undo" disabled={placed.length === 0} onClick={() => { playTap(); setPlaced(placed.slice(0, -1)); }} tone="olive" /><GameTool icon="×" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" /><GameTool icon="✦" label={puzzle.hints[snapshot.viewerHints]?.kind ? HINT_LABELS[puzzle.hints[snapshot.viewerHints].kind] : 'Hints used'} count={Math.max(0, puzzle.hints.length - snapshot.viewerHints)} disabled={snapshot.viewerHints >= puzzle.hints.length || busy} onClick={() => action({ action: 'hint' })} tone="gold" />{isHost && <GameTool icon="◉" label="Reveal" onClick={() => action({ action: 'reveal' })} tone="violet" />}</div>}
```

to:

```tsx
      : <div className="game-actions tool-dock"><GameTool icon="💡" label={puzzle.hints[snapshot.viewerHints]?.kind ? HINT_LABELS[puzzle.hints[snapshot.viewerHints].kind] : 'Hints used'} count={Math.max(0, puzzle.hints.length - snapshot.viewerHints)} disabled={snapshot.viewerHints >= puzzle.hints.length || busy} onClick={() => action({ action: 'hint' })} tone="gold" /><GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(puzzle.scramble.length)); }} /><GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" />{isHost && <GameTool icon="🧭" label="Reveal" onClick={() => action({ action: 'reveal' })} tone="violet" />}</div>}
```

- [ ] **Step 5: Type-check and manually verify**

Run: `cd game && npx tsc --noEmit`
Expected: no errors (confirms the deleted `undo` function in `LocalGame` had no other callers)

Run: `cd game && npm run dev`, play a solo match, a Daily Word, a Time Attack run, and host an online room, and confirm: each tool-dock shows hint/shuffle/clear(+reveal where applicable) with the new icons in that order, no Undo button anywhere, tapping a placed tile still removes just that letter, and the online host sees a pause icon inside the mission HUD (not in the row above it) that still pauses/resumes the puzzle.

- [ ] **Step 6: Commit**

```bash
git add game/components/GameChrome.tsx game/components/GatherWordApp.tsx game/components/DailyWord.tsx game/app/immersive.css
git commit -m "feat: match the gameplay tool icons to the reference art and move pause into the mission HUD"
```

---

## Task 8: Lobby — per-player accent colors and header icons

**Files:**
- Modify: `game/components/GatherWordApp.tsx`
- Modify: `game/app/immersive.css`

**Interfaces:** No exported signatures change — visual/behavioral polish inside `OnlineLobby` only.

- [ ] **Step 1: Add the hash-to-color helper**

In `game/components/GatherWordApp.tsx`, near the existing `TEAM_COLORS` constant, add:

```ts
const SEAT_ACCENTS = ['#ffbd59', '#71ce85', '#7fb8ff', '#ff8fa8', '#c9a2ff', '#ffd35d'];
/** A stable, distinct ring color per player, independent of team color --
 * client-side only, so no RoomDO/protocol field is needed for it. */
function seatAccent(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return SEAT_ACCENTS[hash % SEAT_ACCENTS.length];
}
```

- [ ] **Step 2: Apply it in `OnlineLobby`, without overriding team colors**

In `OnlineLobby`'s `campSeats.map(...)`, change:

```tsx
      {campSeats.map((player, index) => <div key={player?.id ?? `empty-${index}`} className={`camp-seat camp-seat-${index + 1}${player?.ready ? ' ready' : ''}${player?.teamId ? ` team-${player.teamId}` : ''}${player ? '' : ' empty'}`}>
        <span className="camp-avatar">{player ? player.name[0]?.toUpperCase() : '+'}{player?.isHost && <b aria-label="Host">♛</b>}</span>
        <small>{player ? player.name : 'Open'}</small>
        {player && <i>{player.ready ? 'Ready' : 'Waiting'}</i>}
      </div>)}
```

to:

```tsx
      {campSeats.map((player, index) => <div key={player?.id ?? `empty-${index}`} className={`camp-seat camp-seat-${index + 1}${player?.ready ? ' ready' : ''}${player?.teamId ? ` team-${player.teamId}` : ''}${player ? '' : ' empty'}`}>
        <span className="camp-avatar" style={player && !player.teamId ? { '--seat-accent': seatAccent(player.id) } as React.CSSProperties : undefined}>{player ? player.name[0]?.toUpperCase() : '+'}{player?.isHost && <b aria-label="Host">♛</b>}</span>
        <small>{player ? player.name : 'Open'}</small>
        {player && <i>{player.ready ? 'Ready' : 'Waiting'}</i>}
      </div>)}
```

- [ ] **Step 3: Add the CSS**

In `game/app/immersive.css`, right after the existing `.camp-avatar { ... }` rule, add:

```css
.camp-avatar { border-color: var(--seat-accent, #baaf9e); }
```

(this is more specific than nothing but less specific than the existing `.camp-seat.team-sun .camp-avatar` / `.camp-seat.ready .camp-avatar` class rules further down the file, and those rules only ever apply on seats that keep `--seat-accent` unset per Step 2's guard, so team/ready colors continue to win exactly where they already did)

- [ ] **Step 4: Add header back-chevron and invite icon**

In `OnlineLobby`, change:

```tsx
    <div className="lobby-heading">
      <div><p className="section-kicker">Room code</p><h1 className="room-code">{snapshot.code}</h1></div>
      <button type="button" className="secondary-button" onClick={copy}>Copy invite <span aria-hidden="true">↗</span></button>
    </div>
```

to:

```tsx
    <div className="lobby-heading">
      <button type="button" className="lobby-back-button" onClick={leave} aria-label="Leave room">‹</button>
      <div><p className="section-kicker">Room code</p><h1 className="room-code">{snapshot.code}</h1></div>
      <button type="button" className="lobby-invite-button" onClick={copy} aria-label="Copy invite link">＋👤</button>
    </div>
```

- [ ] **Step 5: Add the CSS**

In `game/app/immersive.css`, right after the existing `.in-world .lobby-heading .secondary-button { ... }` rule, add:

```css
.lobby-back-button, .lobby-invite-button {
  flex: none; width: 36px; height: 36px; padding: 0; display: grid; place-items: center;
  border: 2px solid #f2d79d; border-radius: 10px 10px 11px 4px;
  background: linear-gradient(#8ddbc4, #3f9e81); color: #123c32; font-size: 15px; font-weight: 800;
  box-shadow: inset 0 2px 0 #ffffff74, 0 3px 0 #24684f;
}
.lobby-back-button:active, .lobby-invite-button:active { translate: 0 3px; box-shadow: inset 0 2px 0 #ffffff70; }
```

- [ ] **Step 6: Type-check and manually verify**

Run: `cd game && npx tsc --noEmit`
Expected: no errors

Run: `cd game && npm run dev`, create an online room with a second browser tab/player, confirm: each seated player (not on a team) shows a visually distinct ring color that's stable across re-renders; switching the room to Teams mode still colors seats by team, not by the per-player hash; the lobby header shows a back chevron (leaves the room) and an invite icon (still copies the join link).

- [ ] **Step 7: Commit**

```bash
git add game/components/GatherWordApp.tsx game/app/immersive.css
git commit -m "feat: give lobby seats distinct accent colors and iconify the lobby header"
```

---

## Final verification (after all tasks)

- [ ] Run the full suite: `cd game && npm test && npx tsc --noEmit && npm run lint && npm run build`
- [ ] Manually walk all four mockup panels on a 390×844 viewport: home map, an active solo match, a level-complete results screen, and an online lobby — compare side by side with `game/docs/design/wordin-ui-direction.png`.
- [ ] Confirm `prefers-reduced-motion: reduce` still disables the medallion glow, gem-earned callout has no motion to begin with, and nothing new introduced a forced animation.
