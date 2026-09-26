# Phase G — Match Pacing, Room Difficulty & Top-End Words

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop asking solo players how many puzzles they want, and make climbing the journey mean longer, harder, genuinely more demanding runs. Give online rooms a difficulty setting that suits mixed-ability family play. Grow the top three levels so the hardest content is replayable.

**Architecture:** Run length and the clear requirement both become pure functions of level in `lib/levels.ts`. Room difficulty becomes a `mixed | Level` setting handled in `lib/room-rules.ts`. New words extend the existing per-category source files. Task order matters: the words land first, because the clear requirements are sized against the real pools.

**Tech Stack:** TypeScript, React 19, Next 16 (vinext), Cloudflare Workers + Durable Objects, `node:test` via `tsx`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-wordin-progression-and-retention.md` (§2.1 clear condition, §4 bank, §10 rooms)

## Global Constraints

- **$0 to operate.** No new hosted service, no new npm dependencies (`next`, `react`, `react-dom`, `drizzle-orm` only).
- **NWT-only naming standard**, 2013 revision. Hebrew name forms in the Greek Scriptures (*Isaiah* not Esaias, *Elijah* not Elias, *Noah* not Noe). jw.org may be consulted, never scraped. Proper nouns only.
- **Mobile-first at 390px**; the home screen currently fits an iPhone 16 (393×852) with no scrolling and must continue to.
- **`localStorage` may throw.** Read via `getProgressSnapshot()`, write via `saveProgress()`.
- **Online rooms stay ungated** — the host picks any difficulty regardless of personal progress.
- Test command `npm test` from `game/`. `npx tsc --noEmit`, `npm run lint` and `npm run build` must all stay clean.
- `main` auto-deploys on push. Commit only; do not push.

---

### Task 1: Grow levels 7-9

**Files:**
- Modify: `game/data/words/people.ts`, `game/data/words/places.ts`, `game/data/words/peoples.ts`
- Test: `game/tests/word-bank.test.ts`

**Interfaces:**
- Consumes: `SourceRow` = `[display, reference, familiarity]`.
- Produces: roughly 100 additional approved entries weighted to the hard end.

The top levels are thin: Eternity holds 57 words and, because the difficulty sort strips short familiar names out of the top, **zero books**. Difficulty is `letters + familiarity × 2`, so a word lands high by being long, obscure, or both.

- [ ] **Step 1: Write the failing test**

Append to `game/tests/word-bank.test.ts`:

```ts
test('the top three levels are deep enough to replay', () => {
  for (const level of [7, 8, 9]) {
    const pool = PLAYABLE_BANK.filter((entry) => entry.level === level);
    assert.ok(pool.length >= 85, `level ${level} has only ${pool.length} words`);
  }
});

test('every level offers more than one category', () => {
  for (let level = 1; level <= 9; level += 1) {
    const pool = PLAYABLE_BANK.filter((entry) => entry.level === level);
    const kinds = new Set(pool.map((entry) => entry.categories[0]));
    assert.ok(kinds.size >= 3, `level ${level} draws from only ${[...kinds].join(', ')}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — levels 7-9 hold 75, 63 and 57.

- [ ] **Step 3: Add the words**

Roughly 100 new entries, chosen to land at levels 7-9 — long, obscure, or both. Every one needs a real NWT `Book chapter:verse` reference and an honest familiarity (mostly 3-4 here).

- **Long people:** Adonizedek, Ashpenaz, Bathsheba, Chedorlaomer, Eliashib, Elimelech, Eliphaz, Esarhaddon, Evil-merodach, Hananiah, Hazarmaveth, Jehoiada, Jehoshaphat, Jeroboam, Jehozadak, Mahershalalhashbaz, Merodachbaladan, Mephibosheth, Nebuzaradan, Nebushazban, Rabsaris, Rabshakeh, Sennacherib, Shadrach, Shealtiel, Shemaiah, Sheshbazzar, Tiglathpileser, Tilgathpilneser, Zerubbabel, Zephaniah, Abednego, Ahasuerus, Artaxerxes, Jehoiachin, Jehoiakim, Nebuchadnezzar, Belteshazzar, Amraphel, Arioch, Ashurbanipal, Jehohanan, Meshullam, Nethaniah, Pedaiah, Shephatiah, Zebadiah.
- **Long places:** Abelbethmaacah, Aroer, Ashtaroth, Baalhazor, Bethhoron, Bethshemesh, Chinnereth, Chorazin, Ekron, Ephrathah, Esdraelon, Gibbethon, Hazazontamar, Jabeshgilead, Jehoshaphat, Kadeshbarnea, Kiriathjearim, Lachish, Michmash, Migdol, Mizpah, Ophrah, Pihahiroth, Ramothgilead, Rehoboth, Riblah, Shaaraim, Shushan, Succoth, Taberah, Timnathserah, Zarephath, Ziklag, Zoar, Abelmeholah, Bethdiblathaim, Casiphia, Gederothaim, Helkathhazzurim, Jotbathah.
- **Long nations:** Ammonites, Ashdodites, Beerothites, Gibeonites, Girgashites, Jerahmeelites, Kadmonites, Maachathites, Mehunim, Naamathites, Rephaim, Shuhites, Sidonians, Zemarites, Zuzim.
- **Restore books at the top** by raising the familiarity of the genuinely obscure ones so they sort upward: Habakkuk, Zephaniah, Haggai, Nahum, Obadiah, Ecclesiastes, Lamentations, Philemon, Colossians, Thessalonians. Do not invent book names — there are exactly 66 and they are all present.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS, including the existing NWT guard, the reference-format assertion and the per-category duplicate check. **Fix data, never the test.**

- [ ] **Step 5: Report the new distribution**

```bash
cd "/Users/kingsolomon/Desktop/Friends Wordle /game" && cat > lvl.ts <<'X'
import { PLAYABLE_BANK } from './lib/game-engine';
for (let l = 1; l <= 9; l++) {
  const w = PLAYABLE_BANK.filter(e => e.level === l);
  const c = (k: string) => w.filter(e => e.categories[0] === k).length;
  console.log(`L${l}: ${w.length} (book ${c('book')}, person ${c('person')}, place ${c('place')}, tribe ${c('tribe')}, nation ${c('nation')})`);
}
X
./node_modules/.bin/tsx lvl.ts; rm lvl.ts
```

- [ ] **Step 6: Commit**

```bash
cd game && git add data/words tests/word-bank.test.ts
git commit -m "feat: deepen the top three levels

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Run length and clear requirement scale with level

**Files:**
- Modify: `game/lib/levels.ts`
- Test: `game/tests/levels.test.ts`

**Interfaces:**
- Produces:
  - `const RUN_LENGTHS: Record<Level, number>` — 10 at Studying rising to 25 at Eternity
  - `const CLEAR_TARGETS: Record<Level, number>` — 20 rising to 60
  - `function runLengthFor(level: Level): number`
  - `function clearTargetFor(level: Level): number`
  - `isLevelCleared` and `levelStatus` use `clearTargetFor(level)` instead of the flat `WORDS_TO_CLEAR`

**Why both scale, and why the clear target scales faster:** clearing needs distinct words. If runs grew to 25 while the target stayed at 20, one Eternity run would clear the hardest level while Studying still took two — the climb would get *shorter* as it got harder. The clear target therefore rises faster than run length, so higher levels take more runs, not fewer.

- [ ] **Step 1: Write the failing test**

Append to `game/tests/levels.test.ts`:

```ts
import { runLengthFor, clearTargetFor, RUN_LENGTHS, CLEAR_TARGETS } from '../lib/levels';
import { PLAYABLE_BANK } from '../lib/game-engine';

test('a run gets longer as the journey climbs', () => {
  assert.equal(runLengthFor(1), 10);
  assert.equal(runLengthFor(9), 25);
  for (let level = 2; level <= 9; level += 1) {
    assert.ok(runLengthFor(level as Level) >= runLengthFor((level - 1) as Level),
      `level ${level} runs shorter than level ${level - 1}`);
  }
});

test('clearing a level takes more as the journey climbs', () => {
  assert.equal(clearTargetFor(1), 20);
  assert.ok(clearTargetFor(9) > clearTargetFor(1) * 2);
  for (let level = 2; level <= 9; level += 1) {
    assert.ok(clearTargetFor(level as Level) >= clearTargetFor((level - 1) as Level));
  }
});

test('higher levels take at least as many runs to clear, never fewer', () => {
  let previous = 0;
  for (let level = 1; level <= 9; level += 1) {
    const runs = Math.ceil(clearTargetFor(level as Level) / runLengthFor(level as Level));
    assert.ok(runs >= previous, `level ${level} clears in ${runs} runs, fewer than level ${level - 1}`);
    previous = runs;
  }
});

test('every level has enough approved words to meet its own clear target', () => {
  for (let level = 1; level <= 9; level += 1) {
    const pool = PLAYABLE_BANK.filter((entry) => entry.level === level).length;
    assert.ok(pool >= clearTargetFor(level as Level),
      `level ${level} needs ${clearTargetFor(level as Level)} distinct words but has ${pool}`);
  }
});

test('a run never asks for more words than the level holds', () => {
  for (let level = 1; level <= 9; level += 1) {
    const pool = PLAYABLE_BANK.filter((entry) => entry.level === level).length;
    assert.ok(pool >= runLengthFor(level as Level));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `runLengthFor` is not exported.

- [ ] **Step 3: Write the implementation**

In `game/lib/levels.ts`:

```ts
/** A run is longer the further up the journey it is -- ten words at
 * Studying, twenty-five at Eternity. */
export const RUN_LENGTHS: Record<Level, number> = {
  1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 22, 8: 24, 9: 25,
};

/** Distinct words needed to clear a level. This rises FASTER than run
 * length on purpose: if it did not, a longer run at the top would clear the
 * hardest level in fewer attempts than the easiest, and the climb would get
 * shorter as it got harder. */
export const CLEAR_TARGETS: Record<Level, number> = {
  1: 20, 2: 24, 3: 28, 4: 33, 5: 38, 6: 44, 7: 50, 8: 55, 9: 60,
};

export function runLengthFor(level: Level): number { return RUN_LENGTHS[level]; }
export function clearTargetFor(level: Level): number { return CLEAR_TARGETS[level]; }
```

Replace every use of the flat `WORDS_TO_CLEAR` in `isLevelCleared` and `levelStatus` with `clearTargetFor(level)`. Keep `WORDS_TO_CLEAR` exported as `CLEAR_TARGETS[1]` only if something still imports it; otherwise remove it and update the importers.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS. If the pool assertions fail, Task 1 did not add enough words at that level — fix the data, not the targets.

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/levels.ts tests/levels.test.ts
git commit -m "feat: scale run length and clear target with level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Stop asking solo how many puzzles

**Files:**
- Modify: `game/components/GatherWordApp.tsx`

- [ ] **Step 1: Default the length from the level**

`SetupScreen` currently offers 10 / 15 / custom. Drop the question from the default path: the match length comes from `runLengthFor(level)`. The setup screen should state what is about to happen in plain words — for example "18 puzzles at Reaching Out" — rather than asking.

- [ ] **Step 2: Keep Custom, out of the way**

A small "Change length" control reveals the number input, still clamped to the level's approved pool. Anyone who wants to pick still can; nobody is asked.

- [ ] **Step 3: Keep the level in step**

Changing level on the home screen must update the defaulted length. Settings are frozen at match start (`LocalGame` freezes at mount), so the default is read when the match begins, not while it runs.

- [ ] **Step 4: Verify the home screen still fits**

Run the dev server and measure at 393×852:

```js
document.documentElement.scrollHeight <= window.innerHeight
```

Expected: still true.

- [ ] **Step 5: Commit**

```bash
cd game && git add components/GatherWordApp.tsx
git commit -m "feat: derive solo match length from the level

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Room difficulty, with Mixed as the default

**Files:**
- Modify: `game/lib/types.ts`, `game/lib/room-rules.ts`, `game/lib/room-service.ts`, `game/durable/RoomDO.ts`, `game/components/GatherWordApp.tsx`
- Test: `game/tests/room-service.test.ts`

**Interfaces:**
- Produces: `type RoomDifficulty = 'mixed' | Level`; `function buildRoomRecipe(difficulty: RoomDifficulty, categories: Category[], length: number, seed: string): MatchRecipe`

**Why Mixed is the default:** a room is mixed ability by nature — a grandparent and a child on one screen. A single pinned level is wrong for both at once. A spread that starts easy and rises means everyone lands some words, which is what "warm rather than cutthroat" in the brief actually requires. The word "Level" also stops being used in the lobby: in solo a level is *earned*, in a room it is just picked, and using one word for both cheapens the unlock.

- [ ] **Step 1: Write the failing test**

Append to `game/tests/room-service.test.ts`:

```ts
test('a mixed room rises in difficulty across the match', () => {
  const recipe = buildRoomRecipe('mixed', ['book', 'person', 'place'], 12, 'mixed-seed');
  const levels = recipe.puzzles.map((puzzle) => entryLevel(puzzle.entryId));
  const firstThird = levels.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
  const lastThird = levels.slice(-4).reduce((a, b) => a + b, 0) / 4;
  assert.ok(lastThird > firstThird, `expected a rise, got ${firstThird} then ${lastThird}`);
});

test('a mixed room starts somewhere a newcomer can score', () => {
  const recipe = buildRoomRecipe('mixed', ['book', 'person', 'place'], 12, 'mixed-seed-2');
  assert.ok(entryLevel(recipe.puzzles[0].entryId) <= 3);
});

test('a pinned difficulty draws only from that level', () => {
  const recipe = buildRoomRecipe(6, ['book', 'person', 'place'], 10, 'pinned-seed');
  for (const puzzle of recipe.puzzles) assert.equal(entryLevel(puzzle.entryId), 6);
});

test('a room recipe never repeats a word', () => {
  const recipe = buildRoomRecipe('mixed', ['book', 'person', 'place'], 20, 'norepeat');
  assert.equal(new Set(recipe.puzzles.map((p) => p.entryId)).size, 20);
});
```

Add an `entryLevel` helper in the test that looks the id up in `PLAYABLE_BANK`.

- [ ] **Step 2: Run test to verify it fails, then implement**

`buildRoomRecipe` with `'mixed'` spreads the match across levels 1-9 on a rising curve — opening in the 1-3 band and finishing in the 7-9 band — while keeping the existing per-category round-robin and the no-repeat guarantee. A pinned `Level` behaves exactly as today.

- [ ] **Step 3: Rename it in the lobby**

The lobby control is labelled **Difficulty**, not Level, and offers **Mixed — starts easy, gets harder** as the default plus the nine named levels. Reuse the compact `LevelBar` sheet pattern from the home screen so the lobby does not scroll. Keep the puzzle-count control in the lobby — a host setting the length for a group is a real decision, unlike a solo player setting it for themselves.

- [ ] **Step 4: Carry it through the server**

`RoomDifficulty` must survive `configure`, `start` and `rematch` in `room-service.ts` and `RoomDO.ts`, and the server must validate it — `'mixed'` or an integer 1-9, anything else rejected.

- [ ] **Step 5: Verify against wrangler**

```bash
cd game && npx wrangler dev --port 8788
```
Create a room, set Mixed, start, and confirm the drawn levels rise across the match.

- [ ] **Step 6: Commit**

```bash
cd game && git add lib components tests durable
git commit -m "feat: give rooms a difficulty setting that starts mixed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: No two matches open the same way

**Files:**
- Modify: `game/lib/game-engine.ts`
- Test: `game/tests/engine.test.ts`

`createFreshRecipe` already remembers 1000 past match signatures, so a whole match is never repeated. It does not stop two consecutive matches **opening on the same word**, which is the repetition a player actually notices.

- [ ] **Step 1: Write the failing test**

```ts
test('consecutive fresh matches do not open on the same word', () => {
  const settings = { categories: ['book', 'person', 'place'] as Category[], maxBand: 1 as Level, length: 10 };
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  let previous = '';
  for (let run = 0; run < 25; run += 1) {
    const recipe = createFreshRecipe(settings);
    assert.notEqual(recipe.puzzles[0].entryId, previous, `run ${run} opened on the same word as the run before`);
    previous = recipe.puzzles[0].entryId;
  }
  delete (globalThis as Record<string, unknown>).localStorage;
});
```

- [ ] **Step 2: Implement**

Record the opening `entryId` alongside the signature history and reject a candidate recipe whose first puzzle matches the previous match's opener, within the same retry budget already in place. Keep the existing signature check.

- [ ] **Step 3: Verify and commit**

```bash
cd game && npm test && npx tsc --noEmit && npm run lint
git add lib/game-engine.ts tests/engine.test.ts
git commit -m "feat: never open two matches in a row on the same word

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** Extends §2.1 (the clear condition becomes per-level), §4 (bank growth at the hard end) and §10 (room difficulty). The decision to call it Difficulty rather than Level in rooms is new and is recorded here with its reasoning.

**Placeholders.** Tasks 1, 2, 4 and 5 carry complete test code; Task 2 carries the complete implementation and both tables. Tasks 3 and 4's UI steps describe exact behaviour and name the exact components, because the controls do not exist yet.

**Task order is load-bearing.** Task 1 must land before Task 2: the clear targets rise to 60 at Eternity, and Task 2's own test asserts every level holds at least its clear target in approved words. Eternity currently has 57, so Task 2 fails until Task 1 deepens it.

**Type consistency.** `runLengthFor`/`clearTargetFor` are defined in Task 2 and consumed in Task 3. `RoomDifficulty` is defined in Task 4 and threaded through `room-rules.ts`, `room-service.ts` and `RoomDO.ts` in the same task. `buildRoomRecipe(difficulty, categories, length, seed)` keeps that argument order everywhere.

**Risk to watch.** Task 2 changes what "cleared" means for players who already cleared levels under the flat 20-word rule. A level cleared yesterday could read as uncleared today, re-locking progress. The implementer must check `migrate()` in `lib/progress.ts` and decide deliberately — grandfathering already-cleared levels is the safer default and should be stated in the report either way.
