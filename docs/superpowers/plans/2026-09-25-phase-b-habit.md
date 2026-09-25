# Phase B — Daily Word, Streaks & Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give WordIn a reason to open tomorrow — one shared puzzle a day, a day streak with freezes and repair, milestone rewards, a week strip on home, and a shareable result card.

**Architecture:** All streak logic is pure and lives in `lib/streak.ts`, operating on the `ProgressRecord` that Phase A built (its `streak` and `daysPlayed` fields are already there and unused). The Daily Word is derived from the date with no backend — the same date seeds the same puzzle for everyone. Sharing is clipboard text, no API.

**Tech Stack:** TypeScript, React 19, Next 16 (vinext), `node:test` via `tsx`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-wordin-progression-and-retention.md` §5.1, §9

**Depends on:** Phases A, C, D (merged on `feat/nine-level-progression`).

## Global Constraints

- **$0 to operate.** No backend, no account, no push service.
- **No new runtime dependencies.** Exactly `next`, `react`, `react-dom`, `drizzle-orm`.
- **`localStorage` may throw.** Read and write through `lib/progress.ts`'s cached accessors (`getProgressSnapshot`, `saveProgress`) — never `localStorage` directly, and never `loadProgress` in components.
- **The play day rolls at 3am local**, via the existing `dayKey(date)`. Do not reimplement it.
- **Mobile-first at 390px.**
- Test command is `npm test` from `game/`. `npx tsc --noEmit` and `npm run lint` must stay at 0 errors.

---

### Task 1: Streak rules

**Files:**
- Create: `game/lib/streak.ts`
- Test: `game/tests/streak.test.ts`

**Interfaces:**
- Consumes: `ProgressRecord`, `dayKey` from `lib/progress.ts`.
- Produces:
  - `const FREEZE_EARNED_EVERY = 5`, `const MAX_FREEZES = 2`, `const REPAIR_WINDOW_DAYS = 2`, `const REPAIR_PUZZLES = 3`
  - `const MILESTONES = [3, 7, 30, 100]`
  - `function applyPlay(record: ProgressRecord, now: Date): { record: ProgressRecord; extended: boolean; frozeADay: boolean; brokeStreak: boolean; milestone: number | null }`
  - `function streakState(record: ProgressRecord, now: Date): { current: number; best: number; freezes: number; playedToday: boolean; repairable: boolean; daysMissed: number }`
  - `function weekStrip(record: ProgressRecord, now: Date): { day: string; played: boolean }[]` — seven entries, oldest first

- [ ] **Step 1: Write the failing test**

Create `game/tests/streak.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, dayKey } from '../lib/progress';
import { applyPlay, streakState, weekStrip, MAX_FREEZES, MILESTONES } from '../lib/streak';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

test('first play starts a streak of one', () => {
  const out = applyPlay(emptyProgress(), at(2026, 9, 1));
  assert.equal(out.record.streak.current, 1);
  assert.equal(out.record.streak.best, 1);
  assert.equal(out.extended, true);
});

test('playing again the same day does not extend the streak', () => {
  let r = applyPlay(emptyProgress(), at(2026, 9, 1)).record;
  const second = applyPlay(r, at(2026, 9, 1, 20));
  assert.equal(second.record.streak.current, 1);
  assert.equal(second.extended, false);
});

test('consecutive days extend the streak and track a best', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 4; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.current, 4);
  assert.equal(r.streak.best, 4);
});

test('a freeze is earned every five days and caps at two', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 5; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.freezes, 1);
  for (let d = 6; d <= 20; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.freezes, MAX_FREEZES);
});

test('missing one day spends a freeze and keeps the streak', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 5; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.freezes, 1);
  const out = applyPlay(r, at(2026, 9, 7)); // skipped the 6th
  assert.equal(out.frozeADay, true);
  assert.equal(out.record.streak.current, 6, 'the streak survives and counts today');
  assert.equal(out.record.streak.freezes, 0);
});

test('missing a day with no freeze breaks the streak back to one', () => {
  let r = applyPlay(emptyProgress(), at(2026, 9, 1)).record;
  const out = applyPlay(r, at(2026, 9, 3));
  assert.equal(out.brokeStreak, true);
  assert.equal(out.record.streak.current, 1);
  assert.equal(out.record.streak.best, 1, 'the best is remembered');
});

test('a milestone fires exactly once at each threshold', () => {
  let r = emptyProgress();
  const hits: number[] = [];
  for (let d = 1; d <= 8; d += 1) {
    const out = applyPlay(r, at(2026, 9, d));
    r = out.record;
    if (out.milestone) hits.push(out.milestone);
  }
  assert.deepEqual(hits, [3, 7]);
  assert.ok(MILESTONES.includes(3));
});

test('a milestone also grants a freeze', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 3; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.ok(r.streak.freezes >= 1, 'hitting day 3 should hand out a freeze');
});

test('streak state reports whether today is already played and how many days were missed', () => {
  const r = applyPlay(emptyProgress(), at(2026, 9, 1)).record;
  assert.equal(streakState(r, at(2026, 9, 1, 18)).playedToday, true);
  const later = streakState(r, at(2026, 9, 3));
  assert.equal(later.playedToday, false);
  assert.equal(later.daysMissed, 1);
  assert.equal(later.repairable, true, 'within the two-day window');
  assert.equal(streakState(r, at(2026, 9, 10)).repairable, false);
});

test('the week strip is seven days oldest first and marks the days played', () => {
  let r = emptyProgress();
  r = applyPlay(r, at(2026, 9, 10)).record;
  r = applyPlay(r, at(2026, 9, 12)).record;
  const strip = weekStrip(r, at(2026, 9, 12));
  assert.equal(strip.length, 7);
  assert.equal(strip[6].day, dayKey(at(2026, 9, 12)));
  assert.equal(strip[6].played, true);
  assert.equal(strip[4].played, true);  // the 10th
  assert.equal(strip[5].played, false); // the 11th
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `Cannot find module '../lib/streak'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/streak.ts`. Implement to the tests above. Key rules, stated so there is no guessing:

- A day is identified by `dayKey(date)` from `lib/progress.ts` (3am rollover). Do not write a second date function.
- `applyPlay` is idempotent within a day: if `dayKey(now)` already equals `record.streak.lastPlayedDay`, return the record unchanged with `extended: false`.
- Gap of exactly 1 day (yesterday): extend, `current += 1`.
- Gap of 2 or more days: spend one freeze per missed day if freezes allow, and if every missed day is covered, extend as normal with `frozeADay: true`. Otherwise `current = 1` and `brokeStreak: true`.
- `best = Math.max(best, current)` after every change.
- A freeze is earned when the new `current` is a positive multiple of `FREEZE_EARNED_EVERY`, and when a milestone is hit; both are clamped to `MAX_FREEZES`.
- `milestone` is the value from `MILESTONES` exactly equal to the new `current`, else `null`.
- `daysPlayed` already exists on the record and is maintained by `recordMatch`; `weekStrip` reads it and must not mutate.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS — all previous tests plus 10 new.

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/streak.ts tests/streak.test.ts
git commit -m "feat: add day streaks with freezes, repair and milestones

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The Daily Word

**Files:**
- Create: `game/lib/daily.ts`
- Test: `game/tests/daily.test.ts`

**Interfaces:**
- Consumes: `PLAYABLE_BANK`, `createRecipe` from `lib/game-engine.ts`; `dayKey` from `lib/progress.ts`.
- Produces:
  - `function dailyPuzzleFor(date: Date): { entryId: string; scramble: string; dayKey: string; number: number }`
  - `function dailyEternityFor(date: Date): { entryId: string; scramble: string; dayKey: string }`
  - `const DAILY_EPOCH = '2026-09-25'`

Everyone gets the same puzzle on the same day, derived from the date — no backend, no sync.

- [ ] **Step 1: Write the failing test**

Create `game/tests/daily.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPuzzleFor, dailyEternityFor } from '../lib/daily';
import { PLAYABLE_BANK } from '../lib/game-engine';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

test('the same date always yields the same puzzle', () => {
  const a = dailyPuzzleFor(at(2026, 10, 1));
  const b = dailyPuzzleFor(at(2026, 10, 1));
  assert.deepEqual(a, b);
});

test('different dates yield different puzzles', () => {
  const a = dailyPuzzleFor(at(2026, 10, 1));
  const b = dailyPuzzleFor(at(2026, 10, 2));
  assert.notEqual(a.entryId, b.entryId);
});

test('the daily puzzle is always a real approved word and never pre-solved', () => {
  for (let d = 1; d <= 60; d += 1) {
    const daily = dailyPuzzleFor(at(2026, 10, d));
    const entry = PLAYABLE_BANK.find((e) => e.id === daily.entryId);
    assert.ok(entry, `day ${d} picked an unknown entry`);
    if (new Set(entry.playable).size > 1) {
      assert.notEqual(daily.scramble, entry.playable, `day ${d} handed out a solved scramble`);
    }
  }
});

test('the puzzle number increments by one per day', () => {
  const a = dailyPuzzleFor(at(2026, 10, 1));
  const b = dailyPuzzleFor(at(2026, 10, 2));
  assert.equal(b.number, a.number + 1);
});

test('the daily Eternity word is always from level 9', () => {
  for (let d = 1; d <= 30; d += 1) {
    const daily = dailyEternityFor(at(2026, 11, d));
    const entry = PLAYABLE_BANK.find((e) => e.id === daily.entryId);
    assert.ok(entry);
    assert.equal(entry.level, 9, 'the daily hard word must come from Eternity');
  }
});

test('a daily run does not repeat a word within a fortnight', () => {
  const ids = Array.from({ length: 14 }, (_, i) => dailyPuzzleFor(at(2026, 10, i + 1)).entryId);
  assert.equal(new Set(ids).size, 14);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `Cannot find module '../lib/daily'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/daily.ts`. Requirements:

- Seed from `dayKey(date)` so the 3am rollover applies to the daily too.
- `number` = whole days between `DAILY_EPOCH` and the day key, plus 1.
- Pick from `PLAYABLE_BANK` across all levels for the main daily; from level 9 only for `dailyEternityFor`.
- Walk the pool by a hash of the day key so consecutive days land far apart in the pool — a plain modulo over a sorted bank gives near-identical neighbouring words, which is why the fortnight test exists.
- Reuse `makeScramble`-equivalent behaviour: never hand out a scramble equal to the answer. Export a small local helper rather than duplicating the engine's private one, or export the engine's and import it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/daily.ts tests/daily.test.ts
git commit -m "feat: derive a shared daily puzzle from the date

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Result sharing

**Files:**
- Create: `game/lib/share.ts`
- Test: `game/tests/share.test.ts`

**Interfaces:**
- Produces:
  - `function buildShareText(input: { number: number; solved: boolean; guesses: number; hintsUsed: number; streak: number; level?: string }): string`
  - `function shareResult(text: string): Promise<'copied' | 'shared' | 'failed'>`

- [ ] **Step 1: Write the failing test**

Create `game/tests/share.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText } from '../lib/share';

test('a solved result names the puzzle number and the streak', () => {
  const text = buildShareText({ number: 142, solved: true, guesses: 1, hintsUsed: 0, streak: 6 });
  assert.match(text, /WordIn #142/);
  assert.match(text, /6/);
  assert.ok(text.includes('🟩'));
});

test('hints show as yellow and misses as grey', () => {
  const text = buildShareText({ number: 5, solved: true, guesses: 2, hintsUsed: 1, streak: 1 });
  assert.ok(text.includes('🟨'), 'a hint should show');
  assert.ok(text.includes('⬜'), 'a wrong guess should show');
});

test('a failed result is marked and never claims a solve', () => {
  const text = buildShareText({ number: 9, solved: false, guesses: 3, hintsUsed: 2, streak: 0 });
  assert.match(text, /X/);
  assert.ok(!text.includes('🟩'));
});

test('the share text never leaks the answer', () => {
  const text = buildShareText({ number: 1, solved: true, guesses: 1, hintsUsed: 0, streak: 1, level: 'Eternity' });
  assert.ok(!/[A-Z]{3,}/.test(text.replace(/WORDIN/gi, '')), 'no long uppercase run that could be a word');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `Cannot find module '../lib/share'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/share.ts`. `buildShareText` returns something like:

```
WordIn #142 · Eternity
🟩 first try, no hints
🔥 6 day streak
```

with 🟨 per hint used and ⬜ per wrong guess, and `X` in place of the square when unsolved. **It must never contain the answer word.** `shareResult` tries `navigator.share` first, falls back to `navigator.clipboard.writeText`, and returns `'failed'` if both throw — both are wrapped, because neither exists in every browser.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/share.ts tests/share.test.ts
git commit -m "feat: build a shareable result card that never leaks the answer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Daily Word screen and home streak header

**Files:**
- Create: `game/components/DailyWord.tsx`
- Modify: `game/components/GatherWordApp.tsx`
- Modify: `game/app/globals.css`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: a `'daily'` entry mode; a streak header on home.

- [ ] **Step 1: Add the streak header to home**

Above the hero title, render current streak, a flame when it is live, freezes held, and the seven-dot week strip from `weekStrip`. Read progress with `useSyncExternalStore` over `subscribeProgress`/`getProgressSnapshot`/`getProgressServerSnapshot` — the same pattern `LevelPath.tsx` already uses. Do not add a mount effect that calls `setState`; that rule is configured as a lint error.

- [ ] **Step 2: Build the Daily Word screen**

A single puzzle using the existing `TileBoard`. On resolve, call `applyPlay`, persist with `saveProgress`, show the streak result (extended / frozen / broken / milestone), and offer a Share button wired to `shareResult(buildShareText(...))`. If the day is already played, open in a read-only "come back tomorrow" state showing the streak and the share card rather than letting the day be replayed.

- [ ] **Step 3: Add it to the home mode grid**

A fifth mode tile, `Daily Word`, with a badge showing the puzzle number and a dot when today is unplayed. It is ungated — no level requirement.

- [ ] **Step 4: Style it**

Add the streak header, week strip, and milestone celebration styles, following the existing token system in `globals.css` (`--sun`, `--grass`, `--berry`, the hard offset-shadow button treatment, 999px pills). Must work at 390px.

- [ ] **Step 5: Verify**

Run: `cd game && npm test && npx tsc --noEmit && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
cd game && git add components/DailyWord.tsx components/GatherWordApp.tsx app/globals.css
git commit -m "feat: add the Daily Word screen and home streak header

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Streak repair

**Files:**
- Modify: `game/lib/streak.ts`, `game/components/GatherWordApp.tsx`
- Modify: `game/tests/streak.test.ts`

**Interfaces:**
- Produces: `function repairStreak(record: ProgressRecord, now: Date, puzzlesSolved: number): { record: ProgressRecord; repaired: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
test('solving three puzzles within the window restores a broken streak', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 6; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  const broken = applyPlay(r, at(2026, 9, 9)); // two days missed, no freeze left
  assert.equal(broken.record.streak.current, 1);
  const fixed = repairStreak(broken.record, at(2026, 9, 9), 3);
  assert.equal(fixed.repaired, true);
  assert.equal(fixed.record.streak.current, 7, 'the old streak plus today');
});

test('fewer than three puzzles does not repair', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 6; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  const broken = applyPlay(r, at(2026, 9, 9)).record;
  assert.equal(repairStreak(broken, at(2026, 9, 9), 2).repaired, false);
});

test('a repair is refused once the window has passed', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 6; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  const broken = applyPlay(r, at(2026, 9, 20)).record;
  assert.equal(repairStreak(broken, at(2026, 9, 20), 5).repaired, false);
});
```

- [ ] **Step 2: Run test to verify it fails, implement, re-run**

`applyPlay` must stash the pre-break streak on the record so `repairStreak` can restore it — add a `brokenStreak: { value: number; onDay: string } | null` field to the streak object and handle it in `migrate()` in `lib/progress.ts` so older records still load.

- [ ] **Step 3: Offer it in the UI**

When `streakState().repairable` is true and a streak was broken, the home streak header shows "Solve 3 puzzles to win back your N-day streak" with live progress.

- [ ] **Step 4: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add lib/streak.ts lib/progress.ts components/GatherWordApp.tsx tests/streak.test.ts
git commit -m "feat: let a broken streak be won back within two days

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** §5.1 in full (day streak, 3am rollover via the existing `dayKey`, freezes earned and capped, repair window, milestones, week strip) and §9 (daily word, daily Eternity word, share card). The archive of missed days from §9 is deliberately out — it needs stored per-day results, which is its own change.

**Placeholders.** Tasks 1–3 carry complete test code. Tasks 4 and 5 describe UI in prose because the components do not exist yet; they name the exact modules, the exact state-reading pattern to copy (`useSyncExternalStore`, already used in `LevelPath.tsx`), and the exact lint rule that forbids the obvious alternative.

**Type consistency.** `applyPlay` returns `{ record, extended, frozeADay, brokeStreak, milestone }` in Task 1 and is destructured that way in Tasks 4 and 5. `streakState` returns `{ current, best, freezes, playedToday, repairable, daysMissed }` and every field is consumed. Task 5 adds `brokenStreak` to the record and explicitly requires the `migrate()` update so Phase A's `version: 1` records keep loading.

**Risk to watch.** `recordMatch` already maintains `daysPlayed`; `applyPlay` maintains `streak`. They must be called together on a finished match or the week strip and the streak will disagree.
