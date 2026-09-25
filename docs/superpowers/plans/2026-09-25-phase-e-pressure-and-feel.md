# Phase E — Time Pressure and Play Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make levels 5–9 playable and the solve moment land. Timers scale with word length and arrive as a bonus before they become a threat; hints stop restating what is on screen; the Check button goes away; the word keeps its shape; and the scripture reference becomes the payoff instead of a grey footnote.

**Architecture:** Timing is a pure function of level and word length in `lib/timing.ts`. The hint ladder becomes data on the entry rather than two pre-baked strings. Everything else is component and CSS work in `GatherWordApp.tsx` / `globals.css`.

**Tech Stack:** TypeScript, React 19, Next 16 (vinext), `node:test` via `tsx`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-wordin-progression-and-retention.md` §3, §7, §8, §11

**Depends on:** Phases A, C, D. Phase B is independent — either order.

## Global Constraints

- **$0 to operate.** No new runtime dependencies (`next`, `react`, `react-dom`, `drizzle-orm` only).
- **Mobile-first at 390px**, one-handed.
- **`localStorage` may throw** — read via `getProgressSnapshot`, write via `saveProgress`.
- **`prefers-reduced-motion` must be respected** by every animation added here.
- **Levels 1–4 have no timer at all.** Levels 5–6 show one that costs nothing. Levels 7–9 enforce it.
- Test command is `npm test` from `game/`. `npx tsc --noEmit` and `npm run lint` stay at 0 errors.

---

### Task 1: Length-scaled timing

**Files:**
- Create: `game/lib/timing.ts`
- Test: `game/tests/timing.test.ts`

**Interfaces:**
- Produces:
  - `type TimerMode = 'none' | 'bonus' | 'enforced'`
  - `function timerModeFor(level: Level): TimerMode`
  - `function secondsFor(level: Level, letterCount: number): number`
  - `const TIMER_TABLE: Record<Level, { base: number; perLetter: number }>`

This replaces the flat `BAND_TIME_LIMITS`, which is what made `Deuteronomy` in 14 seconds impossible.

- [ ] **Step 1: Write the failing test**

Create `game/tests/timing.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { timerModeFor, secondsFor, TIMER_TABLE } from '../lib/timing';
import type { Level } from '../lib/types';

test('levels one to four have no timer', () => {
  for (const level of [1, 2, 3, 4] as Level[]) assert.equal(timerModeFor(level), 'none');
});

test('levels five and six show a timer that costs nothing', () => {
  assert.equal(timerModeFor(5), 'bonus');
  assert.equal(timerModeFor(6), 'bonus');
});

test('levels seven to nine enforce the timer', () => {
  for (const level of [7, 8, 9] as Level[]) assert.equal(timerModeFor(level), 'enforced');
});

test('a longer word always gets more time at the same level', () => {
  assert.ok(secondsFor(7, 11) > secondsFor(7, 5));
  assert.ok(secondsFor(9, 12) > secondsFor(9, 4));
});

test('a harder level always gets less time for the same word', () => {
  for (let level = 6; level <= 9; level += 1) {
    assert.ok(secondsFor(level as Level, 8) < secondsFor((level - 1) as Level, 8),
      `level ${level} should be tighter than level ${level - 1}`);
  }
});

test('the spec table is honoured at its named points', () => {
  assert.equal(secondsFor(5, 11), 45);  // Reaching Out, Deuteronomy
  assert.equal(secondsFor(9, 11), 23);  // Eternity, Deuteronomy
  assert.equal(secondsFor(5, 5), 27);
  assert.equal(secondsFor(9, 5), 13);
});

test('even the hardest short word gets a workable floor', () => {
  assert.ok(secondsFor(9, 2) >= 8, 'a two-letter word at Eternity still needs reading time');
});

test('every level has a table entry', () => {
  for (let level = 1; level <= 9; level += 1) {
    assert.ok(TIMER_TABLE[level as Level], `level ${level} has no timing entry`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `Cannot find module '../lib/timing'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/timing.ts`:

```ts
import type { Level } from '@/lib/types';

/** seconds = ceil(base + perLetter x letters). A flat per-level timer is what
 * made an eleven-letter word at the top level unplayable; time has to track
 * how much there is to read. Levels 1-4 are untimed and carry an entry only
 * so the table is total. */
export const TIMER_TABLE: Record<Level, { base: number; perLetter: number }> = {
  1: { base: 0, perLetter: 0 },
  2: { base: 0, perLetter: 0 },
  3: { base: 0, perLetter: 0 },
  4: { base: 0, perLetter: 0 },
  5: { base: 12, perLetter: 3.0 },
  6: { base: 10, perLetter: 2.6 },
  7: { base: 8, perLetter: 2.2 },
  8: { base: 6, perLetter: 1.9 },
  9: { base: 5, perLetter: 1.6 },
};

const FLOOR_SECONDS = 8;

export type TimerMode = 'none' | 'bonus' | 'enforced';

/** The timer arrives as a reward before it becomes a threat: at Reaching Out
 * and Maturity, running out costs nothing and beating it pays a bonus. */
export function timerModeFor(level: Level): TimerMode {
  if (level <= 4) return 'none';
  if (level <= 6) return 'bonus';
  return 'enforced';
}

export function secondsFor(level: Level, letterCount: number): number {
  const row = TIMER_TABLE[level];
  if (row.base === 0 && row.perLetter === 0) return 0;
  return Math.max(FLOOR_SECONDS, Math.ceil(row.base + row.perLetter * letterCount));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/timing.ts tests/timing.test.ts
git commit -m "feat: scale puzzle time by word length and level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: A hint ladder worth paying for

**Files:**
- Modify: `game/data/word-bank.ts`, `game/lib/types.ts`
- Create: `game/lib/hints.ts`
- Test: `game/tests/hints.test.ts`

**Interfaces:**
- Produces:
  - `type HintKind = 'letter' | 'context' | 'reference'`
  - `function hintsFor(entry: WordEntry): { kind: HintKind; text: string; revealIndex?: number }[]`
  - `function applyLetterHint(entry: WordEntry, placed: number[], scramble: string): number[]`

Today hint 1 says "This answer is a Bible book" while the kicker directly above already reads `book · Challenge`, and hint 2 gives a letter count the slots already show. Two points for one real fact.

- [ ] **Step 1: Write the failing test**

Create `game/tests/hints.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { hintsFor } from '../lib/hints';
import { PLAYABLE_BANK } from '../lib/game-engine';

const entry = PLAYABLE_BANK.find((e) => e.display === 'Nehemiah')!;

test('the first hint reveals a letter in place', () => {
  const [first] = hintsFor(entry);
  assert.equal(first.kind, 'letter');
  assert.equal(typeof first.revealIndex, 'number');
});

test('the second hint gives context, not the category already on screen', () => {
  const [, second] = hintsFor(entry);
  assert.equal(second.kind, 'context');
  assert.ok(!/^This answer is a/.test(second.text), 'must not restate the kicker');
});

test('the third hint gives the scripture reference', () => {
  const [, , third] = hintsFor(entry);
  assert.equal(third.kind, 'reference');
  assert.ok(third.text.includes(entry.references[0]));
});

test('no hint ever contains the answer itself', () => {
  for (const sample of PLAYABLE_BANK.slice(0, 120)) {
    for (const hint of hintsFor(sample)) {
      assert.ok(!hint.text.toUpperCase().includes(sample.playable),
        `${sample.display}: hint "${hint.text}" leaks the answer`);
    }
  }
});

test('every approved word can produce all three hints', () => {
  for (const sample of PLAYABLE_BANK) {
    assert.equal(hintsFor(sample).length, 3, `${sample.display} produced the wrong number of hints`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails, then implement**

`hintsFor` builds the ladder from data already on the entry. The `context` hint is generated from category plus level plus the reference's book — for example "a place in the Christian Greek Scriptures" or "a person in the Hebrew Scriptures" — and must never simply restate the kicker text. Derive the Testament from the reference's book name against the existing 66-book list.

`applyLetterHint` returns a new `placed` array with one correct letter moved into its slot, choosing the leftmost slot not already correct.

Hint cost stays 1 point each (`scoreSolve` already handles `hintsUsed`).

- [ ] **Step 3: Wire it into the play screen**

Replace the two-string hint box with the ladder. Hint 1 places a letter on the board. The hint button shows what the next hint will give, so paying is an informed choice.

- [ ] **Step 4: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add lib/hints.ts lib/types.ts data/word-bank.ts components/GatherWordApp.tsx tests/hints.test.ts
git commit -m "feat: replace restated hints with a three-step ladder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Auto-check, shuffle, undo, and the tile shape

**Files:**
- Modify: `game/components/GatherWordApp.tsx`, `game/app/globals.css`

Four play-feel fixes the playtest surfaced.

- [ ] **Step 1: Auto-check on the last tile**

Remove the "Check answer" button. When the final slot fills, evaluate after a ~250ms beat so the player sees the word complete. This matters twice as much under a timer, where a button press costs real seconds. Keep a wrong answer's shake and the miss popup.

- [ ] **Step 2: Add shuffle**

The home sample card advertises "↻ Shuffle" but the play screen only has "↻ Reset". Add a real shuffle that reorders the *unplaced* letters without disturbing placed ones. Free, unlimited, no score effect.

- [ ] **Step 3: Add undo**

One-step undo of the last placed tile, distinct from Reset. Tapping a placed tile already returns it; undo is for the last action specifically.

- [ ] **Step 4: Stop the word wrapping**

`.letter-tile, .answer-slot` is `clamp(34px, 8.5vw, 50px)`. At 390px an eleven-letter word wraps 7 + 4, destroying the silhouette a word game depends on. Scale tiles to fit the longest row on one line — compute from the letter count so a 13-letter word still fits, with a sensible minimum and a reduced font size at the small end.

- [ ] **Step 5: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add components/GatherWordApp.tsx app/globals.css
git commit -m "feat: auto-check, shuffle, undo, and keep the word on one line

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Timers in Solo Journey and Time Attack

**Files:**
- Modify: `game/components/GatherWordApp.tsx`

**Interfaces:**
- Consumes: `timerModeFor`, `secondsFor` from Task 1; `scoreSolve`'s existing `secondsLeft`/`secondsTotal` parameters.

- [ ] **Step 1: Replace the flat table**

Delete `BAND_TIME_LIMITS` and drive both modes from `secondsFor(level, letterCount)`.

- [ ] **Step 2: Implement the three modes**

- `none` (1–4): no timer UI at all.
- `bonus` (5–6): the timer runs and is shown, but hitting zero costs nothing — the puzzle continues, only the speed bonus is lost. Say so on screen the first time a player meets it.
- `enforced` (7–9): hitting zero counts as a miss, as Time Attack does today.

- [ ] **Step 3: Pass the speed bonus through**

`scoreSolve` already accepts `secondsLeft` and `secondsTotal` and is tested for them; they are currently unused in Solo. Pass them whenever the mode is not `none`.

- [ ] **Step 4: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add components/GatherWordApp.tsx
git commit -m "feat: introduce the timer as a bonus before it becomes a threat

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The scripture reveal moment

**Files:**
- Modify: `game/components/GatherWordApp.tsx`, `game/app/globals.css`

The reference currently renders as `{reference} · {award}` — grey text joined by a middle dot, which is both the least memorable treatment available and a recognisable generated-UI tell. The brief lists "drifts from the get-to-know-scripture goal" as a known risk; this closes it at zero cost.

- [ ] **Step 1: Rebuild the resolution block**

One orchestrated moment: the solved word settling into place, then the citation arriving beneath it, then the award. Three staged beats totalling under 700ms, not three simultaneous fades. Spend the branch's visual boldness here — this is the emotional payoff and the only place it should go.

- [ ] **Step 2: Separate the award from the citation**

The points are a game mechanic; the citation is the point of the game. They should not share a line joined by a middle dot.

- [ ] **Step 3: Respect reduced motion**

Under `prefers-reduced-motion: reduce`, the same content appears with no staging.

- [ ] **Step 4: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add components/GatherWordApp.tsx app/globals.css
git commit -m "feat: make the scripture reference the solve payoff

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** §3 in full (length-scaled timers, the exact table, bonus-then-enforced), §7 (three-step hint ladder), §8 (scripture reveal), and the play-feel items from §11 (auto-check, shuffle, undo, tile shape). Haptics and near-miss feedback from §11 are not included — they are polish on top of this, not blocked by it.

**Placeholders.** Tasks 1 and 2 carry complete test code; Task 1 carries the complete implementation. Tasks 3–5 are UI work described by exact behaviour, exact selectors (`.letter-tile`, `.answer-slot`, `BAND_TIME_LIMITS`) and exact numbers, with the reason each change exists so an implementer can judge edge cases.

**Type consistency.** `TimerMode`, `timerModeFor` and `secondsFor` are defined in Task 1 and consumed unchanged in Task 4. `hintsFor` returns `{ kind, text, revealIndex? }` in Task 2 and is consumed with those fields in Task 2 Step 3. `scoreSolve`'s `secondsLeft`/`secondsTotal` parameters already exist and are already tested — Task 4 only supplies them.

**Behaviour change to flag.** Removing the Check button changes how a wrong answer is entered: today a player can fill all slots, notice the mistake and fix it before checking. With auto-check they cannot. That is the intended trade (it is how modern word games behave and it matters under a timer), but Undo from Task 3 must land in the same release or the change is a net loss.
