# Phase A — Persistence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give WordIn a durable player record — lifetime points, personal bests, per-word mastery and level progress — and rework the results screen so a score is never reported without something to compare it against.

**Architecture:** One versioned record in `localStorage` behind a small pure module (`lib/progress.ts`). All reads/writes go through it; no component touches `localStorage` directly. Scoring moves out of the component into a pure `lib/scoring.ts` so it can be tested without a DOM. The record is written once at match end.

**Tech Stack:** TypeScript, React 19, Next 16 (vinext), `node:test` via `tsx`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-wordin-progression-and-retention.md`

## Global Constraints

- **$0 to operate.** No paid database, no new hosted service, no custom domain.
- **No new runtime dependencies.** Runtime deps stay exactly: `next`, `react`, `react-dom`, `drizzle-orm`.
- **NWT-only naming standard** for any player-facing word or reference. jw.org may be consulted, never scraped.
- **Mobile-first**; must work on a five-year-old Android phone.
- **`localStorage` can throw or be blocked.** Every read and write is wrapped in try/catch and the game must stay fully playable when storage is unavailable.
- Test command is `npm test` from `game/`, which runs `tsx --test tests/*.test.ts`.
- Tests import with relative paths (`../lib/foo`), app code imports with the `@/` alias.

---

### Task 1: The progress record module

**Files:**
- Create: `game/lib/progress.ts`
- Test: `game/tests/progress.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ProgressRecord`
  - `const PROGRESS_KEY = 'wordin-progress-v1'`
  - `function emptyProgress(): ProgressRecord`
  - `function loadProgress(): ProgressRecord`
  - `function saveProgress(record: ProgressRecord): void`
  - `function dayKey(date: Date): string`

- [ ] **Step 1: Write the failing test**

Create `game/tests/progress.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, dayKey, loadProgress, saveProgress, PROGRESS_KEY } from '../lib/progress';

test('an empty progress record starts at zero with level 1 unlocked', () => {
  const record = emptyProgress();
  assert.equal(record.version, 1);
  assert.equal(record.lifetimePoints, 0);
  assert.equal(record.totalSolved, 0);
  assert.equal(record.totalWrong, 0);
  assert.equal(record.unlockedLevel, 1);
  assert.deepEqual(record.bestByMode, {});
  assert.deepEqual(record.solveCounts, {});
  assert.deepEqual(record.levelProgress, {});
});

test('the day key rolls over at 3am local, not midnight', () => {
  // 2am on the 5th still belongs to the 4th
  assert.equal(dayKey(new Date(2026, 8, 5, 2, 30)), '2026-09-04');
  // 3am on the 5th starts the 5th
  assert.equal(dayKey(new Date(2026, 8, 5, 3, 0)), '2026-09-05');
  assert.equal(dayKey(new Date(2026, 8, 5, 23, 59)), '2026-09-05');
});

test('load returns an empty record when storage is unavailable and never throws', () => {
  // no globalThis.localStorage in the node test environment
  const record = loadProgress();
  assert.equal(record.lifetimePoints, 0);
  assert.doesNotThrow(() => saveProgress(record));
});

test('load round-trips a saved record through a stub storage', () => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  const record = emptyProgress();
  record.lifetimePoints = 420;
  record.solveCounts['book.john'] = 3;
  saveProgress(record);
  assert.ok(store.get(PROGRESS_KEY));
  assert.equal(loadProgress().lifetimePoints, 420);
  assert.equal(loadProgress().solveCounts['book.john'], 3);
  delete (globalThis as Record<string, unknown>).localStorage;
});

test('a record from an unknown future version is discarded rather than trusted', () => {
  const store = new Map<string, string>([[PROGRESS_KEY, JSON.stringify({ version: 99, lifetimePoints: 5 })]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  assert.equal(loadProgress().lifetimePoints, 0);
  delete (globalThis as Record<string, unknown>).localStorage;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `Cannot find module '../lib/progress'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/progress.ts`:

```ts
/** One versioned record holding everything a player accumulates across
 * sessions. Every read and write goes through this module -- no component
 * touches localStorage directly, so storage being blocked is handled once. */

export const PROGRESS_KEY = 'wordin-progress-v1';

export type LevelProgress = {
  /** Distinct entry ids solved at this level -- drives the clear condition. */
  solvedIds: string[];
  correct: number;
  attempts: number;
  cleared: boolean;
};

export type ProgressRecord = {
  version: 1;
  lifetimePoints: number;
  totalSolved: number;
  totalWrong: number;
  /** Keyed "mode:level", e.g. "solo:3" -> best score seen for that pairing. */
  bestByMode: Record<string, number>;
  /** entryId -> how many times it has been solved. Drives mastery. */
  solveCounts: Record<string, number>;
  /** Highest level the player may enter. 1..9 */
  unlockedLevel: number;
  levelProgress: Record<string, LevelProgress>;
  streak: { current: number; best: number; lastPlayedDay: string | null; freezes: number };
  /** Day keys played, newest first, capped at 60. */
  daysPlayed: string[];
};

export function emptyProgress(): ProgressRecord {
  return {
    version: 1,
    lifetimePoints: 0,
    totalSolved: 0,
    totalWrong: 0,
    bestByMode: {},
    solveCounts: {},
    unlockedLevel: 1,
    levelProgress: {},
    streak: { current: 0, best: 0, lastPlayedDay: null, freezes: 0 },
    daysPlayed: [],
  };
}

/** The play day rolls at 3am local time. Someone finishing a puzzle at
 * 1am has not started a new day -- losing a streak to that would feel
 * arbitrary and punishing. */
export function dayKey(date: Date): string {
  const shifted = new Date(date.getTime());
  shifted.setHours(shifted.getHours() - 3);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export function loadProgress(): ProgressRecord {
  const store = storage();
  if (!store) return emptyProgress();
  try {
    const raw = store.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<ProgressRecord>;
    // A record written by a newer build may have a shape this build cannot
    // reason about. Starting fresh is safer than half-reading it.
    if (parsed.version !== 1) return emptyProgress();
    return { ...emptyProgress(), ...parsed, streak: { ...emptyProgress().streak, ...(parsed.streak ?? {}) } };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(record: ProgressRecord): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PROGRESS_KEY, JSON.stringify(record));
  } catch {
    /* quota or private mode -- the game keeps working without persistence */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS — 5 existing tests plus 5 new ones.

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/progress.ts tests/progress.test.ts
git commit -m "feat: add versioned player progress record

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Length-scaled scoring

**Files:**
- Create: `game/lib/scoring.ts`
- Test: `game/tests/scoring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const LEVEL_MULTIPLIERS: readonly number[]` (index 0 = level 1)
  - `function basePoints(letterCount: number): number`
  - `function scoreSolve(input: ScoreInput): number`
  - `type ScoreInput = { letterCount: number; level: number; combo: number; hintsUsed: number; secondsLeft?: number; secondsTotal?: number }`

Replaces the flat 5 points, so `Ai` and `Ecclesiastes` stop being worth the same.

- [ ] **Step 1: Write the failing test**

Create `game/tests/scoring.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { basePoints, scoreSolve, LEVEL_MULTIPLIERS } from '../lib/scoring';

test('base points scale with word length', () => {
  assert.equal(basePoints(2), 4);   // "Ai"
  assert.equal(basePoints(5), 7);   // "David"
  assert.equal(basePoints(12), 14); // "Ecclesiastes"
});

test('there is one multiplier per level, rising from 1 to 3', () => {
  assert.equal(LEVEL_MULTIPLIERS.length, 9);
  assert.equal(LEVEL_MULTIPLIERS[0], 1);
  assert.equal(LEVEL_MULTIPLIERS[8], 3);
  for (let i = 1; i < LEVEL_MULTIPLIERS.length; i += 1) {
    assert.ok(LEVEL_MULTIPLIERS[i] >= LEVEL_MULTIPLIERS[i - 1], `level ${i + 1} must not pay less than level ${i}`);
  }
});

test('a harder level pays more for the same word', () => {
  const easy = scoreSolve({ letterCount: 7, level: 1, combo: 0, hintsUsed: 0 });
  const hard = scoreSolve({ letterCount: 7, level: 9, combo: 0, hintsUsed: 0 });
  assert.ok(hard > easy * 2, `expected level 9 to pay far more than level 1, got ${easy} vs ${hard}`);
});

test('a combo of three or more doubles the award', () => {
  const plain = scoreSolve({ letterCount: 6, level: 1, combo: 0, hintsUsed: 0 });
  const combo = scoreSolve({ letterCount: 6, level: 1, combo: 3, hintsUsed: 0 });
  assert.equal(combo, plain * 2);
});

test('each hint costs a point and a clean solve earns a bonus', () => {
  const clean = scoreSolve({ letterCount: 6, level: 1, combo: 0, hintsUsed: 0 });
  const hinted = scoreSolve({ letterCount: 6, level: 1, combo: 0, hintsUsed: 2 });
  assert.equal(clean - hinted, 4); // +2 no-hint bonus lost, plus 2 points of hint cost
});

test('an award is never below one point however many hints were taken', () => {
  assert.ok(scoreSolve({ letterCount: 2, level: 1, combo: 0, hintsUsed: 3 }) >= 1);
});

test('solving with time to spare pays a speed bonus', () => {
  const slow = scoreSolve({ letterCount: 6, level: 7, combo: 0, hintsUsed: 0, secondsLeft: 0, secondsTotal: 20 });
  const fast = scoreSolve({ letterCount: 6, level: 7, combo: 0, hintsUsed: 0, secondsLeft: 20, secondsTotal: 20 });
  assert.ok(fast > slow);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `Cannot find module '../lib/scoring'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/scoring.ts`:

```ts
/** Scoring lives here rather than in the component so it can be tested
 * without a DOM, and so solo, Time Attack and online rooms all award
 * points the same way. */

/** Index 0 is level 1 (Studying); index 8 is level 9 (Eternity). */
export const LEVEL_MULTIPLIERS = [1, 1.2, 1.4, 1.6, 1.9, 2.2, 2.5, 2.75, 3] as const;

const NO_HINT_BONUS = 2;
const HINT_COST = 1;
const MAX_SPEED_BONUS = 4;

export type ScoreInput = {
  letterCount: number;
  /** 1..9 */
  level: number;
  /** Correct answers in a row immediately before this one. */
  combo: number;
  hintsUsed: number;
  secondsLeft?: number;
  secondsTotal?: number;
};

/** A two-letter word is worth 4, a twelve-letter word 14. Length is the
 * honest proxy for how hard a scramble is to read. */
export function basePoints(letterCount: number): number {
  return 2 + letterCount;
}

export function scoreSolve(input: ScoreInput): number {
  const multiplier = LEVEL_MULTIPLIERS[Math.min(Math.max(input.level, 1), 9) - 1];
  let points = basePoints(input.letterCount) * multiplier;
  if (input.combo >= 3) points *= 2;
  if (input.hintsUsed === 0) points += NO_HINT_BONUS;
  points -= input.hintsUsed * HINT_COST;
  if (input.secondsTotal && input.secondsTotal > 0 && typeof input.secondsLeft === 'number') {
    const fraction = Math.max(0, Math.min(1, input.secondsLeft / input.secondsTotal));
    points += fraction * MAX_SPEED_BONUS;
  }
  return Math.max(1, Math.round(points));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/scoring.ts tests/scoring.test.ts
git commit -m "feat: scale points by word length and level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Recording a finished match

**Files:**
- Modify: `game/lib/progress.ts`
- Modify: `game/tests/progress.test.ts`

**Interfaces:**
- Consumes: `ProgressRecord`, `loadProgress`, `saveProgress`, `dayKey` from Task 1.
- Produces:
  - `type MatchResult = { mode: string; level: number; points: number; solvedIds: string[]; wrong: number; now?: Date }`
  - `function recordMatch(record: ProgressRecord, result: MatchResult): { record: ProgressRecord; isBest: boolean; previousBest: number }`
  - `function masteredCount(record: ProgressRecord): number`
  - `const MASTERY_THRESHOLD = 3`

- [ ] **Step 1: Write the failing test**

Append to `game/tests/progress.test.ts`:

```ts
import { recordMatch, masteredCount, MASTERY_THRESHOLD } from '../lib/progress';

test('recording a match accumulates lifetime totals', () => {
  let record = emptyProgress();
  record = recordMatch(record, { mode: 'solo', level: 1, points: 40, solvedIds: ['book.john', 'book.ruth'], wrong: 1 }).record;
  record = recordMatch(record, { mode: 'solo', level: 1, points: 35, solvedIds: ['book.acts'], wrong: 0 }).record;
  assert.equal(record.lifetimePoints, 75);
  assert.equal(record.totalSolved, 3);
  assert.equal(record.totalWrong, 1);
});

test('a personal best is reported the first time and beaten scores are tracked per mode and level', () => {
  let record = emptyProgress();
  const first = recordMatch(record, { mode: 'solo', level: 2, points: 50, solvedIds: ['book.john'], wrong: 0 });
  assert.equal(first.isBest, true);
  assert.equal(first.previousBest, 0);
  const worse = recordMatch(first.record, { mode: 'solo', level: 2, points: 30, solvedIds: ['book.ruth'], wrong: 0 });
  assert.equal(worse.isBest, false);
  assert.equal(worse.previousBest, 50);
  assert.equal(worse.record.bestByMode['solo:2'], 50);
  const better = recordMatch(worse.record, { mode: 'solo', level: 2, points: 80, solvedIds: ['book.acts'], wrong: 0 });
  assert.equal(better.isBest, true);
  assert.equal(better.record.bestByMode['solo:2'], 80);
});

test('bests are kept separately per level', () => {
  let record = emptyProgress();
  record = recordMatch(record, { mode: 'solo', level: 1, points: 90, solvedIds: ['book.john'], wrong: 0 }).record;
  const onLevelNine = recordMatch(record, { mode: 'solo', level: 9, points: 20, solvedIds: ['book.ruth'], wrong: 0 });
  assert.equal(onLevelNine.isBest, true, 'a first score at level 9 is a best even if lower than a level 1 score');
});

test('a word becomes mastered once it has been solved three times', () => {
  let record = emptyProgress();
  for (let i = 0; i < MASTERY_THRESHOLD; i += 1) {
    record = recordMatch(record, { mode: 'solo', level: 1, points: 10, solvedIds: ['book.john'], wrong: 0 }).record;
  }
  assert.equal(record.solveCounts['book.john'], 3);
  assert.equal(masteredCount(record), 1);
});

test('level progress counts only distinct words solved at that level', () => {
  let record = emptyProgress();
  record = recordMatch(record, { mode: 'solo', level: 4, points: 10, solvedIds: ['book.john', 'book.john'], wrong: 0 }).record;
  record = recordMatch(record, { mode: 'solo', level: 4, points: 10, solvedIds: ['book.john', 'book.ruth'], wrong: 0 }).record;
  assert.deepEqual(record.levelProgress['4'].solvedIds.sort(), ['book.john', 'book.ruth']);
});

test('playing records the day and never lets the day list grow without bound', () => {
  let record = emptyProgress();
  for (let day = 1; day <= 70; day += 1) {
    record = recordMatch(record, { mode: 'solo', level: 1, points: 1, solvedIds: ['book.john'], wrong: 0, now: new Date(2026, 0, day, 12) }).record;
  }
  assert.equal(record.daysPlayed.length, 60);
  assert.equal(record.daysPlayed[0], dayKey(new Date(2026, 0, 70, 12)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `recordMatch is not a function`

- [ ] **Step 3: Write the implementation**

Append to `game/lib/progress.ts`:

```ts
export const MASTERY_THRESHOLD = 3;
const MAX_DAYS_TRACKED = 60;

export type MatchResult = {
  mode: string;
  /** 1..9 */
  level: number;
  points: number;
  /** Entry ids solved in this match. Duplicates are tolerated and collapsed. */
  solvedIds: string[];
  wrong: number;
  /** Injectable for tests; defaults to now. */
  now?: Date;
};

export function recordMatch(
  record: ProgressRecord,
  result: MatchResult,
): { record: ProgressRecord; isBest: boolean; previousBest: number } {
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

  // Bests are per mode AND per level -- a first run at Eternity is a
  // personal best even if it scores under a long run at Studying.
  const bestKey = `${result.mode}:${result.level}`;
  const previousBest = next.bestByMode[bestKey] ?? 0;
  const isBest = result.points > previousBest;
  if (isBest) next.bestByMode[bestKey] = result.points;

  for (const id of distinct) {
    next.solveCounts[id] = (next.solveCounts[id] ?? 0) + 1;
  }

  const levelKey = String(result.level);
  const existing = next.levelProgress[levelKey] ?? { solvedIds: [], correct: 0, attempts: 0, cleared: false };
  next.levelProgress[levelKey] = {
    ...existing,
    solvedIds: [...new Set([...existing.solvedIds, ...distinct])],
    correct: existing.correct + distinct.length,
    attempts: existing.attempts + distinct.length + result.wrong,
  };

  const today = dayKey(result.now ?? new Date());
  next.daysPlayed = [today, ...next.daysPlayed.filter((day) => day !== today)].slice(0, MAX_DAYS_TRACKED);

  return { record: next, isBest, previousBest };
}

export function masteredCount(record: ProgressRecord): number {
  return Object.values(record.solveCounts).filter((count) => count >= MASTERY_THRESHOLD).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/progress.ts tests/progress.test.ts
git commit -m "feat: record finished matches into the progress record

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire scoring and recording into the solo game

**Files:**
- Modify: `game/components/GatherWordApp.tsx` (the `LocalGame` component, roughly lines 164–246)

**Interfaces:**
- Consumes: `scoreSolve` from Task 2; `loadProgress`, `saveProgress`, `recordMatch` from Tasks 1 and 3.
- Produces: `LocalGame` now passes `matchSummary` into `Results` (see Task 5 for its shape).

This task has no unit test of its own — it is UI wiring, verified by Task 6's playthrough. Keep the diff small.

- [ ] **Step 1: Import the new modules**

At the top of `game/components/GatherWordApp.tsx`, add to the existing import block:

```ts
import { scoreSolve } from '@/lib/scoring';
import { loadProgress, saveProgress, recordMatch, masteredCount } from '@/lib/progress';
```

- [ ] **Step 2: Track solved ids and a combo inside `LocalGame`**

Add beside the existing `useState` declarations in `LocalGame`:

```ts
const [solvedIds, setSolvedIds] = useState<string[]>([]);
const [combo, setCombo] = useState(0);
const [summary, setSummary] = useState<{ points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number } | null>(null);
```

- [ ] **Step 3: Replace the flat award in `check()`**

Find `const currentValue = Math.max(1, 5 - hints);` and replace it with:

```ts
const currentValue = scoreSolve({ letterCount: puzzle.scramble.length, level: entry.band, combo, hintsUsed: hints });
```

Then inside `check()`, in the `if (correct)` branch, after `setCorrectCount(correctCount + 1);` add:

```ts
setSolvedIds((current) => [...current, entry.id]);
setCombo(combo + 1);
```

and in the `else` branch, after `setWrongCount(wrongCount + 1);` add:

```ts
setCombo(0);
```

- [ ] **Step 4: Write the record when the match finishes**

Replace the body of `next()` so finishing persists the match:

```ts
const next = () => {
  if (index >= recipe.puzzles.length - 1) {
    const total = scores.reduce((sum, team) => sum + team.score, 0);
    const outcome = recordMatch(loadProgress(), {
      mode: mode === 'solo' ? 'solo' : mode,
      level: settings.maxBand,
      points: total,
      solvedIds,
      wrong: wrongCount,
    });
    saveProgress(outcome.record);
    setSummary({
      points: total,
      isBest: outcome.isBest,
      previousBest: outcome.previousBest,
      lifetime: outcome.record.lifetimePoints,
      mastered: masteredCount(outcome.record),
    });
    setFinished(true);
  } else {
    setIndex(index + 1);
    resetPuzzle();
  }
};
```

- [ ] **Step 5: Reset the new state on rematch**

In `rematch()`, add alongside the existing resets:

```ts
setSolvedIds([]); setCombo(0); setSummary(null);
```

- [ ] **Step 6: Pass the summary to `Results`**

Change the finished branch from `if (finished) return <Results ... />` to include the summary:

```tsx
if (finished) return <Results mode={mode} scores={scores} correct={correctCount} wrong={wrongCount} total={recipe.puzzles.length} summary={summary} rematch={rematch} changeSet={onChangeSet} home={onHome} />;
```

- [ ] **Step 7: Verify it compiles**

Run: `cd game && npx tsc --noEmit`
Expected: one error about `Results` not accepting a `summary` prop — Task 5 fixes it. Do not commit yet.

---

### Task 5: Results screen that compares

**Files:**
- Modify: `game/components/GatherWordApp.tsx` (the `Results` component)
- Modify: `game/app/globals.css`

**Interfaces:**
- Consumes: the `summary` prop shape from Task 4.
- Produces: `Results` accepting `summary: { points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number } | null`.

This closes the finding that a score is reported with nothing to compare it against.

- [ ] **Step 1: Widen the `Results` signature**

Replace the `Results` function signature and body's opening with:

```tsx
function Results({ mode, scores, correct, wrong, total, summary, rematch, changeSet, home }: {
  mode: PlayMode; scores: Team[]; correct: number; wrong: number; total: number;
  summary: { points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number } | null;
  rematch: () => void; changeSet: () => void; home: () => void;
}) {
  const ranking = [...scores].sort((a, b) => b.score - a.score); const winner = ranking[0];
```

- [ ] **Step 2: Add the comparison block**

Immediately after the existing `<div className="result-score">…</div>` line, insert:

```tsx
{summary && <div className="score-compare">
  {summary.isBest
    ? <p className="best-flag">Your best yet at this level — previous best {summary.previousBest}</p>
    : <p className="best-flag quiet">Your best at this level is {summary.previousBest}</p>}
  <div className="lifetime-row">
    <span><strong>{summary.lifetime.toLocaleString()}</strong>Points all time</span>
    <span><strong>{summary.mastered}</strong>Words mastered</span>
  </div>
</div>}
```

- [ ] **Step 3: Style it**

Append to `game/app/globals.css`:

```css
/* ============================================================
   Results comparison — a score means nothing on its own, so the
   match total always sits next to a previous best and a lifetime
   running total.
   ============================================================ */
.score-compare { margin: 6px 0 18px; text-align: center; }
.best-flag {
  display: inline-block; margin: 0 0 14px; padding: 7px 15px; border-radius: 999px;
  background: linear-gradient(180deg, #ffd876, var(--sun)); color: var(--sun-ink);
  font-size: 13px; font-weight: 700; box-shadow: 0 3px 0 var(--sun-deep);
}
.best-flag.quiet {
  background: var(--surface2); color: var(--muted);
  border: 1px solid var(--line); box-shadow: 0 3px 0 #d8c79f;
}
.lifetime-row { display: flex; gap: 10px; justify-content: center; }
.lifetime-row span {
  flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 12px 8px;
  border: 1px solid var(--line); border-radius: 18px; background: var(--surface2);
  color: var(--muted); font-size: 11px; font-weight: 700; line-height: 1.3;
}
.lifetime-row strong { font-family: var(--font-display); font-size: 21px; color: var(--ink); }
```

- [ ] **Step 4: Verify it compiles and the suite still passes**

Run: `cd game && npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
cd game && git add components/GatherWordApp.tsx app/globals.css
git commit -m "feat: show personal best and lifetime totals on results

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Verify in the running app

**Files:** none modified — this is the verification gate.

- [ ] **Step 1: Start the dev server**

```bash
cd game && npm run dev
```
Expected: `Local: http://localhost:3000/`

- [ ] **Step 2: Play a short match end to end**

In a browser at mobile width: Solo Journey → pick any level → set length to 3 → solve all three → reach the results screen.

- [ ] **Step 3: Confirm the three claims**

- The results screen shows **"Your best yet at this level"** on a first run.
- **Points all time** is non-zero and equals the match total.
- Play a second, deliberately worse match: the flag now reads **"Your best at this level is N"** with the higher number, and **Points all time** has grown to the sum of both matches.

- [ ] **Step 4: Confirm storage failure is survivable**

In devtools, block storage (Application → Storage → clear, or run in a private window with site data blocked). Play a match. Expected: the game plays normally, the results screen renders, the comparison block is absent or zeroed, and nothing throws in the console.

- [ ] **Step 5: Commit any fixes, then report**

Report completion with: the final `npm test` output, and what the results screen showed on run 1 versus run 2.

---

## Self-Review

**Spec coverage.** This plan implements spec §5.2 (lifetime points, per-mode/level bests, words mastered, per-word mastery counts) and §6 (length-scaled scoring, level multiplier, combo, no-hint bonus, speed-bonus hook). It deliberately leaves §5.1 streaks to Phase B — the record carries the `streak` field so Phase B is additive only. Level *unlocking* uses `levelProgress` written here but is implemented in Phase D. The `speedBonus` path in `scoreSolve` is unused until Phase E supplies timers; it is tested now so Phase E only has to pass the arguments.

**Placeholders.** None. Every step carries the literal code or the literal command.

**Type consistency.** `ProgressRecord`, `LevelProgress`, `MatchResult` and `ScoreInput` are defined in Tasks 1–3 and consumed unchanged in Tasks 4–5. `recordMatch` returns `{ record, isBest, previousBest }` in Task 3 and is destructured that way in Task 4. The `summary` shape in Task 4 Step 2 matches the `Results` prop in Task 5 Step 1 field for field.

**Known temporary state.** Task 4 passes `settings.maxBand` as `level`. That is correct for today's 4 bands and becomes the real 1–9 level in Phase D, which changes the value passed, not the interface.
