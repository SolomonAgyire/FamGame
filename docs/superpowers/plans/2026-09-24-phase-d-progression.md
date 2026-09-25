# Phase D — Locked Level Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-choice difficulty dropdown with a nine-level locked journey. A player starts at Studying, sees the rest behind padlocks, and unlocks the next level by clearing the current one.

**Architecture:** Unlock rules live in a pure `lib/levels.ts` that reads the `ProgressRecord` from Phase A and the `PLAYABLE_BANK` from Phase C. The home screen becomes a vertical journey path; the solo setup screen loses its band picker. Online rooms deliberately keep free choice so one player's progress never blocks a group.

**Tech Stack:** TypeScript, React 19, Next 16 (vinext), `node:test` via `tsx`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-wordin-progression-and-retention.md` §2.1

**Depends on:** Phase A (Tasks 1–5) and Phase C (Tasks 1–7) must be merged first.

## Global Constraints

- **$0 to operate.** No new hosted service.
- **No new runtime dependencies.**
- **Mobile-first**; the journey path must be usable one-handed at 390px wide.
- **`localStorage` can throw.** Unlock state falls back to level 1 only, and the game stays playable.
- **Online rooms are not gated.** The host picks any level.
- Test command is `npm test` from `game/`.

---

### Task 1: Unlock rules

**Files:**
- Create: `game/lib/levels.ts`
- Test: `game/tests/levels.test.ts`

**Interfaces:**
- Consumes: `ProgressRecord`, `LevelProgress` from Phase A Task 1; `LEVEL_NAMES`, `Level` from Phase C Task 1.
- Produces:
  - `const WORDS_TO_CLEAR = 20`
  - `const ACCURACY_TO_CLEAR = 0.7`
  - `function isLevelCleared(record: ProgressRecord, level: Level): boolean`
  - `function highestUnlocked(record: ProgressRecord): Level`
  - `function isUnlocked(record: ProgressRecord, level: Level): boolean`
  - `function levelStatus(record: ProgressRecord, level: Level): { name: string; unlocked: boolean; cleared: boolean; solved: number; needed: number; accuracy: number }`

- [ ] **Step 1: Write the failing test**

Create `game/tests/levels.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress } from '../lib/progress';
import { isLevelCleared, highestUnlocked, isUnlocked, levelStatus, WORDS_TO_CLEAR } from '../lib/levels';
import type { Level } from '../lib/types';

function withLevel(level: Level, solvedCount: number, correct: number, attempts: number) {
  const record = emptyProgress();
  record.levelProgress[String(level)] = {
    solvedIds: Array.from({ length: solvedCount }, (_, i) => `word.${level}.${i}`),
    correct, attempts, cleared: false,
  };
  return record;
}

test('a fresh player has only level 1 unlocked', () => {
  const record = emptyProgress();
  assert.equal(highestUnlocked(record), 1);
  assert.equal(isUnlocked(record, 1), true);
  assert.equal(isUnlocked(record, 2), false);
  assert.equal(isUnlocked(record, 9), false);
});

test('a level is cleared at twenty distinct words with at least seventy percent accuracy', () => {
  assert.equal(isLevelCleared(withLevel(1, WORDS_TO_CLEAR, 20, 25), 1), true);   // 80%
  assert.equal(isLevelCleared(withLevel(1, WORDS_TO_CLEAR, 20, 40), 1), false);  // 50%
  assert.equal(isLevelCleared(withLevel(1, WORDS_TO_CLEAR - 1, 19, 20), 1), false);
});

test('clearing a level unlocks exactly the next one', () => {
  const record = withLevel(1, WORDS_TO_CLEAR, 20, 22);
  assert.equal(highestUnlocked(record), 2);
  assert.equal(isUnlocked(record, 2), true);
  assert.equal(isUnlocked(record, 3), false);
});

test('unlocks do not skip — clearing level 5 without clearing 2 does not open 6', () => {
  const record = withLevel(5, WORDS_TO_CLEAR, 20, 22);
  assert.equal(highestUnlocked(record), 1, 'level 1 was never cleared, so nothing beyond it opens');
});

test('unlocking stops at level 9', () => {
  const record = emptyProgress();
  for (let level = 1; level <= 9; level += 1) {
    record.levelProgress[String(level)] = {
      solvedIds: Array.from({ length: WORDS_TO_CLEAR }, (_, i) => `w${level}-${i}`),
      correct: 20, attempts: 20, cleared: true,
    };
  }
  assert.equal(highestUnlocked(record), 9);
  assert.equal(isUnlocked(record, 9), true);
});

test('level status reports progress toward the clear condition', () => {
  const status = levelStatus(withLevel(1, 8, 8, 10), 1);
  assert.equal(status.name, 'Studying');
  assert.equal(status.unlocked, true);
  assert.equal(status.cleared, false);
  assert.equal(status.solved, 8);
  assert.equal(status.needed, WORDS_TO_CLEAR);
  assert.equal(status.accuracy, 0.8);
});

test('a level never played reports zero progress without throwing', () => {
  const status = levelStatus(emptyProgress(), 7);
  assert.equal(status.solved, 0);
  assert.equal(status.accuracy, 0);
  assert.equal(status.unlocked, false);
  assert.equal(status.name, 'Strong Faith');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `Cannot find module '../lib/levels'`

- [ ] **Step 3: Write the implementation**

Create `game/lib/levels.ts`:

```ts
import type { ProgressRecord } from '@/lib/progress';
import { LEVEL_NAMES, type Level } from '@/lib/types';

/** Clearing a level means solving twenty DISTINCT words at it, accurately.
 * Requiring the whole level would repeat the Time Attack grind that made
 * the hardest content unreachable. */
export const WORDS_TO_CLEAR = 20;
export const ACCURACY_TO_CLEAR = 0.7;

export function isLevelCleared(record: ProgressRecord, level: Level): boolean {
  const progress = record.levelProgress[String(level)];
  if (!progress) return false;
  if (progress.solvedIds.length < WORDS_TO_CLEAR) return false;
  if (progress.attempts === 0) return false;
  return progress.correct / progress.attempts >= ACCURACY_TO_CLEAR;
}

/** Walk up from level 1. Progression never skips: clearing level 5 while
 * level 2 is unfinished opens nothing. */
export function highestUnlocked(record: ProgressRecord): Level {
  let unlocked: Level = 1;
  for (let level = 1 as Level; level < 9; level = (level + 1) as Level) {
    if (!isLevelCleared(record, level)) break;
    unlocked = (level + 1) as Level;
  }
  return unlocked;
}

export function isUnlocked(record: ProgressRecord, level: Level): boolean {
  return level <= highestUnlocked(record);
}

export function levelStatus(record: ProgressRecord, level: Level) {
  const progress = record.levelProgress[String(level)];
  const solved = progress?.solvedIds.length ?? 0;
  const accuracy = progress && progress.attempts > 0 ? progress.correct / progress.attempts : 0;
  return {
    name: LEVEL_NAMES[level - 1],
    unlocked: isUnlocked(record, level),
    cleared: isLevelCleared(record, level),
    solved,
    needed: WORDS_TO_CLEAR,
    accuracy,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/levels.ts tests/levels.test.ts
git commit -m "feat: add nine-level unlock rules

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The journey path on the home screen

**Files:**
- Create: `game/components/LevelPath.tsx`
- Modify: `game/components/GatherWordApp.tsx` (`HomeScreen`)
- Modify: `game/app/globals.css`

**Interfaces:**
- Consumes: `levelStatus`, `highestUnlocked` from Task 1; `loadProgress` from Phase A.
- Produces: `<LevelPath selected={level} onSelect={(level: Level) => void} />`

- [ ] **Step 1: Build the component**

Create `game/components/LevelPath.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { loadProgress, type ProgressRecord } from '@/lib/progress';
import { levelStatus } from '@/lib/levels';
import { emptyProgress } from '@/lib/progress';
import type { Level } from '@/lib/types';

const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function LevelPath({ selected, onSelect }: { selected: Level; onSelect: (level: Level) => void }) {
  // Read storage after mount so the server and first client render agree.
  const [record, setRecord] = useState<ProgressRecord>(() => emptyProgress());
  useEffect(() => { setRecord(loadProgress()); }, []);

  return <ol className="level-path" aria-label="Your journey">
    {LEVELS.map((level) => {
      const status = levelStatus(record, level);
      const isSelected = selected === level;
      return <li key={level} className={`level-node ${status.unlocked ? '' : 'locked'} ${status.cleared ? 'cleared' : ''} ${isSelected ? 'selected' : ''}`}>
        <button
          type="button"
          disabled={!status.unlocked}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => onSelect(level)}
        >
          <span className="level-badge" aria-hidden="true">{status.cleared ? '✓' : status.unlocked ? level : '🔒'}</span>
          <span className="level-text">
            <strong>{status.name}</strong>
            <small>{status.unlocked
              ? status.cleared ? 'Cleared' : `${status.solved} of ${status.needed} words`
              : 'Locked'}</small>
          </span>
          {status.unlocked && !status.cleared && <span className="level-meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (status.solved / status.needed) * 100)}%` }} />
          </span>}
        </button>
      </li>;
    })}
  </ol>;
}
```

- [ ] **Step 2: Style it**

Append to `game/app/globals.css`:

```css
/* ============================================================
   Level journey — a vertical path. A locked node is visibly a
   destination, not an error: it keeps its name so the player can
   see where they are going.
   ============================================================ */
.level-path { display: flex; flex-direction: column; gap: 10px; width: 100%; margin: 0; padding: 0; list-style: none; }
.level-node button {
  position: relative; display: flex; width: 100%; gap: 14px; padding: 14px 16px;
  align-items: center; text-align: left; border: 1px solid var(--line);
  border-radius: 20px; background: var(--surface); box-shadow: 0 4px 0 #e6d4ab;
}
.level-node button:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 0 0 #e6d4ab; }
.level-badge {
  display: grid; flex: none; width: 40px; height: 40px; place-items: center;
  border-radius: 50%; background: linear-gradient(180deg, #ffd876, var(--sun));
  color: var(--sun-ink); font-family: var(--font-display); font-size: 17px; font-weight: 700;
  box-shadow: 0 3px 0 var(--sun-deep);
}
.level-text { display: flex; flex-direction: column; gap: 2px; }
.level-text strong { font-family: var(--font-display); font-size: 16px; color: var(--ink); }
.level-text small { color: var(--muted); font-size: 12px; font-weight: 600; }
.level-meter {
  position: absolute; right: 16px; bottom: 12px; width: 64px; height: 5px;
  border-radius: 999px; background: var(--surface2); overflow: hidden;
}
.level-meter i { display: block; height: 100%; background: var(--grass); }
.level-node.selected button { border-color: var(--sun-deep); box-shadow: 0 4px 0 var(--sun-deep); }
.level-node.cleared .level-badge { background: linear-gradient(180deg, #7be0a0, var(--grass)); color: #fff; box-shadow: 0 3px 0 var(--grass-deep); }
.level-node.locked button { background: var(--surface2); box-shadow: none; opacity: .72; }
.level-node.locked .level-badge { background: var(--surface2); color: var(--muted); border: 1px dashed var(--line); box-shadow: none; }
```

- [ ] **Step 3: Use it in `HomeScreen`**

Import `LevelPath` and `Level`, hold `const [level, setLevel] = useState<Level>(1)` in `GatherWordApp`, pass it down, and render `<LevelPath selected={level} onSelect={setLevel} />` between the mode grid and the start button. Change the start button label to `Start {modeTitle} · {LEVEL_NAMES[level - 1]}`.

- [ ] **Step 4: Verify it compiles**

Run: `cd game && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd game && git add components/LevelPath.tsx components/GatherWordApp.tsx app/globals.css
git commit -m "feat: add the nine-level journey path with padlocks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Solo play uses the chosen level, not a free band

**Files:**
- Modify: `game/components/GatherWordApp.tsx` (`SettingsPanel`, `SetupScreen`, `LocalGame`)
- Modify: `game/lib/game-engine.ts`

**Interfaces:**
- Consumes: `highestUnlocked` from Task 1, `PLAYABLE_BANK` from Phase C Task 7.
- Produces: `function wordsForLevel(level: Level, categories: Category[]): WordEntry[]`; `createRecipe` draws from exactly one level.

Solo matches now draw from a single level rather than "everything up to N", which is what made a Deep Cut match open on a two-letter word.

- [ ] **Step 1: Write the failing test**

Append to `game/tests/levels.test.ts`:

```ts
import { createRecipe, wordsForLevel, getPuzzleEntry } from '../lib/game-engine';

test('a match draws only from the chosen level', () => {
  const recipe = createRecipe({ categories: ['book', 'person', 'place'], maxBand: 1, length: 8 }, 'level-seed');
  for (let i = 0; i < recipe.puzzles.length; i += 1) {
    const entry = getPuzzleEntry(recipe, i);
    assert.ok(entry);
    assert.equal(entry.level, 1, `${entry.display} is level ${entry.level}, not the requested level 1`);
  }
});

test('words for a level are all at that level and all approved', () => {
  const words = wordsForLevel(2, ['book', 'person', 'place']);
  assert.ok(words.length > 0);
  for (const word of words) {
    assert.equal(word.level, 2);
    assert.equal(word.status, 'approved');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `wordsForLevel` is not exported, and `createRecipe` still draws `level <= maxBand`.

- [ ] **Step 3: Write the implementation**

In `game/lib/game-engine.ts`, add `wordsForLevel` and repoint `eligibleWords`:

```ts
/** Every approved word at exactly one level. A match is a run at a level,
 * not a sweep of everything below it. */
export function wordsForLevel(level: Level, categories: Category[]) {
  return PLAYABLE_BANK.filter((entry) => entry.level === level && entry.categories.some((category) => categories.includes(category)));
}

export function eligibleWords(settings: GameSettings) {
  return wordsForLevel(settings.maxBand, settings.categories);
}
```

- [ ] **Step 4: Remove the band picker from solo setup**

In `SettingsPanel`, delete the `How challenging?` fieldset entirely — the level now comes from the journey path. Keep the category and length fieldsets. Update the pool help line to name the level:

```tsx
<p className="field-help">{pool} approved answers at {LEVEL_NAMES[settings.maxBand - 1]} · no repeats inside a match</p>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd game && npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
cd game && git add lib/game-engine.ts components/GatherWordApp.tsx tests/levels.test.ts
git commit -m "feat: draw solo matches from a single chosen level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The unlock moment

**Files:**
- Modify: `game/components/GatherWordApp.tsx` (`LocalGame`, `Results`)
- Modify: `game/app/globals.css`

**Interfaces:**
- Consumes: `isLevelCleared`, `highestUnlocked` from Task 1; `recordMatch` from Phase A Task 3.
- Produces: `Results` gains `unlocked: { level: Level; name: string } | null`.

- [ ] **Step 1: Detect the unlock when the match is recorded**

In `LocalGame`'s `next()` (added in Phase A Task 4), compare unlock state before and after:

```ts
const before = loadProgress();
const wasUnlocked = highestUnlocked(before);
const outcome = recordMatch(before, { /* …as Phase A… */ });
saveProgress(outcome.record);
const nowUnlocked = highestUnlocked(outcome.record);
setUnlocked(nowUnlocked > wasUnlocked ? { level: nowUnlocked, name: LEVEL_NAMES[nowUnlocked - 1] } : null);
```

Add the matching `const [unlocked, setUnlocked] = useState<{ level: Level; name: string } | null>(null);` and reset it in `rematch()`.

- [ ] **Step 2: Celebrate it on the results screen**

In `Results`, above the score block:

```tsx
{unlocked && <div className="unlock-banner" role="status">
  <span className="unlock-key" aria-hidden="true">🔓</span>
  <strong>{unlocked.name} unlocked</strong>
  <small>A new level is open on your journey.</small>
</div>}
```

- [ ] **Step 3: Style it**

```css
/* Unlocking a level is the single biggest moment in the run — it gets a
   full-width banner rather than a line of text. */
.unlock-banner {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  margin: 0 0 18px; padding: 16px; border-radius: 22px;
  background: linear-gradient(180deg, #7be0a0, var(--grass)); color: #fff;
  box-shadow: 0 4px 0 var(--grass-deep);
}
.unlock-key { font-size: 26px; }
.unlock-banner strong { font-family: var(--font-display); font-size: 19px; }
.unlock-banner small { opacity: .9; font-size: 12px; font-weight: 600; }
```

- [ ] **Step 4: Verify**

Run: `cd game && npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd game && git add components/GatherWordApp.tsx app/globals.css
git commit -m "feat: celebrate unlocking the next level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Time Attack starts from the highest unlocked level

**Files:**
- Modify: `game/components/GatherWordApp.tsx` (`TimeAttackGame`)

**Interfaces:**
- Consumes: `highestUnlocked` from Task 1, `buildLevelQueue` from the engine.

Today Time Attack always starts at band 1, which is why 151 words stood between a player and the hardest content.

- [ ] **Step 1: Seed the starting band from progress**

Replace the two initial `useState` calls:

```ts
const startLevel = useMemo(() => highestUnlocked(loadProgress()), []);
const [band, setBand] = useState<Level>(startLevel);
const [queue, setQueue] = useState<PuzzleRecipe[]>(() => buildLevelQueue(startLevel, categories));
const [timeLeft, setTimeLeft] = useState(() => BAND_TIME_LIMITS[startLevel]);
```

- [ ] **Step 2: Extend the time table to nine levels**

`BAND_TIME_LIMITS` currently has four entries. Phase E replaces it with a length-scaled formula; until then, widen it so levels 5–9 do not read `undefined`:

```ts
const BAND_TIME_LIMITS: Record<Level, number> = { 1: 40, 2: 36, 3: 32, 4: 28, 5: 24, 6: 22, 7: 20, 8: 18, 9: 16 };
```

- [ ] **Step 3: Verify**

Run: `cd game && npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd game && git add components/GatherWordApp.tsx
git commit -m "feat: start Time Attack at the highest unlocked level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Online rooms keep free level choice

**Files:**
- Modify: `game/components/GatherWordApp.tsx` (`OnlineLobby`)
- Modify: `game/lib/room-service.ts`

The host must be able to pick any level so a group is never blocked by one person's progress.

- [ ] **Step 1: Give the lobby its own level picker**

`SettingsPanel` lost its band fieldset in Task 3. Add a lobby-only picker that lists all nine levels with no padlocks:

```tsx
<fieldset><legend>Which level?</legend><div className="band-grid">
  {LEVEL_NAMES.map((name, index) => <button type="button" key={name}
    onClick={() => setSettings({ ...settings, maxBand: (index + 1) as Level })}
    className={`band-button ${settings.maxBand === index + 1 ? 'selected' : ''}`}>
    <small>Level {index + 1}</small><strong>{name}</strong>
  </button>)}
</div></fieldset>
```

- [ ] **Step 2: Widen server-side validation**

In `room-service.ts`, the settings sanitiser clamps `maxBand` to 4. Raise it to 9:

```ts
const maxBand = Math.min(9, Math.max(1, Math.floor(Number(input.maxBand) || 1))) as Level;
```

- [ ] **Step 3: Verify**

Run: `cd game && npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd game && git add components/GatherWordApp.tsx lib/room-service.ts
git commit -m "feat: let online hosts pick any level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Full playthrough verification

**Files:** none modified — this is the gate.

- [ ] **Step 1: Confirm the suite is green**

Run: `cd game && npm test && npx tsc --noEmit && npm run lint`

- [ ] **Step 2: Confirm the padlock actually locks**

Start the dev server. On a fresh profile (clear site data), confirm: level 1 is selectable, levels 2–9 show 🔒 and their buttons are `disabled`.

- [ ] **Step 3: Clear level 1 and watch level 2 open**

Play level 1 until 20 distinct words are solved at ≥70% accuracy. Confirm the results screen shows **"Publisher unlocked"** and the home path now shows level 2 selectable with a ✓ on level 1.

- [ ] **Step 4: Drive all nine levels**

Use a Playwright script against `localhost:3000` that clears each level in turn and asserts the next unlocks, ending with Eternity selectable. Record for each level: its name, the words drawn, that every word was at that level, and the score.

- [ ] **Step 5: Report**

Report with the `npm test` output, the nine-level unlock trace, and a screenshot of the completed journey path.

---

## Self-Review

**Spec coverage.** Implements spec §2.1 in full: padlocked nodes, clear condition of 20 distinct words at ≥70%, no skipping, unlock celebration, gating in solo and Time Attack, and free choice in online rooms. Spec §3 (length-scaled timers, bonus-then-enforced model) is deliberately Phase E; Task 5 widens the existing flat table to nine entries as a stopgap so nothing reads `undefined` in the meantime.

**Placeholders.** None. Task 2 Step 3 and Task 6 Step 1 describe edits in prose but give the literal JSX to insert and name the exact component and identifiers.

**Type consistency.** `Level` is the Phase C type used throughout. `levelStatus` returns `{ name, unlocked, cleared, solved, needed, accuracy }` in Task 1 and every field is consumed in Task 2's component. `highestUnlocked` is used in Tasks 2, 4 and 5 with the same signature. `wordsForLevel` is defined in Task 3 and is what `eligibleWords` delegates to.

**Behaviour change to flag.** Task 3 changes `eligibleWords` from "everything up to N" to "exactly N". This narrows the pool for a match, so the length picker's maximum falls — a level with 50 approved words can no longer host a 60-puzzle match. The existing `Math.min(value, pool)` clamp in `SettingsPanel` already handles this.
