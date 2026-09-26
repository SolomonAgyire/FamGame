import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, dayKey, loadProgress, saveProgress, PROGRESS_KEY } from '../lib/progress';
import { highestUnlocked, levelStatus } from '../lib/levels';
import { advanceMatch } from '../lib/game-engine';

test('an empty progress record starts at zero with level 1 unlocked', () => {
  const record = emptyProgress();
  assert.equal(record.version, 1);
  assert.equal(record.lifetimePoints, 0);
  assert.equal(record.totalSolved, 0);
  assert.equal(record.totalWrong, 0);
  // Unlock state is derived, never stored -- there is no field to disagree with it.
  assert.equal(highestUnlocked(record), 1);
  assert.equal('unlockedLevel' in record, false);
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
  const record = emptyProgress();
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

// --- Regression: a match recorded twice (finding 1) ---------------------

test('a finished match is recorded once even when the auto-advance timer fires after it', () => {
  // Tapping "See results" on the last puzzle left the 2.2s auto-advance
  // timer armed, and the callback it captured ran the finish branch a
  // second time: lifetime points doubled and every solved word gained two
  // solves instead of one, so mastery landed after two real solves.
  const solvedIds = ['book.john', 'book.ruth', 'book.acts'];
  let record = emptyProgress();
  let state = { index: 9, total: 10, finished: false };

  for (let call = 0; call < 2; call += 1) {
    const step = advanceMatch(state);
    if (step.record) record = recordMatch(record, { mode: 'solo', level: 1, points: 120, solvedIds, wrong: 2 }).record;
    state = { ...state, index: step.index, finished: step.finished };
  }

  assert.equal(record.lifetimePoints, 120, 'the match must not be scored twice');
  assert.equal(record.levelProgress['1'].correct, 3);
  assert.equal(record.levelProgress['1'].attempts, 5);
  for (const id of solvedIds) assert.equal(record.solveCounts[id], 1, `${id} must count one solve, not two`);
});

test('advancing steps through a match and reports the finish exactly once', () => {
  let state = { index: 0, total: 3, finished: false };
  const recorded: number[] = [];
  for (let call = 0; call < 6; call += 1) {
    const step = advanceMatch(state);
    if (step.record) recorded.push(call);
    state = { index: step.index, total: state.total, finished: step.finished };
  }
  assert.deepEqual(recorded, [2], 'only the step off the last puzzle records the match');
  assert.equal(state.index, 2);
  assert.equal(state.finished, true);
});

// --- Regression: stored fields that contradicted derived truth (finding 8) ---

test('a record written with the old unlockedLevel and cleared fields still loads, without them', () => {
  const legacy = {
    version: 1,
    lifetimePoints: 310,
    totalSolved: 24,
    totalWrong: 6,
    bestByMode: { 'solo:1': 120 },
    solveCounts: { 'book.john': 2 },
    unlockedLevel: 1,
    levelProgress: {
      '1': { solvedIds: ['book.john', 'book.ruth'], correct: 24, attempts: 30, cleared: false },
    },
    streak: { current: 3, best: 4, lastPlayedDay: '2026-09-20', freezes: 1 },
    daysPlayed: ['2026-09-20'],
  };
  const store = new Map<string, string>([[PROGRESS_KEY, JSON.stringify(legacy)]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };

  const loaded = loadProgress();
  assert.equal(loaded.lifetimePoints, 310, 'everything still read stays');
  assert.equal(loaded.streak.current, 3);
  assert.deepEqual(loaded.levelProgress['1'].solvedIds, ['book.john', 'book.ruth']);
  assert.equal('unlockedLevel' in loaded, false, 'the dead top-level field is dropped');
  assert.equal('cleared' in loaded.levelProgress['1'], false, 'the dead per-level flag is dropped');

  saveProgress(loaded);
  const rewritten = JSON.parse(store.get(PROGRESS_KEY) as string);
  assert.equal('unlockedLevel' in rewritten, false, 'and is not written back to disk');
  assert.equal('cleared' in rewritten.levelProgress['1'], false);
  delete (globalThis as Record<string, unknown>).localStorage;
});

// --- Regression: scaled clear targets must not re-lock old progress -----

test('a level cleared under the old flat rule is grandfathered on first load after the upgrade', () => {
  // Level 9 needed 20 distinct words at 70% accuracy before Phase G's
  // per-level clear targets landed; it needs 60 now. A record saved back
  // when 20 was enough has no `legacyClears` field at all -- that absence
  // is what tells `migrate()` this predates the change, so it snapshots
  // whichever levels already qualified under the old rule right now,
  // before the new target ever gets a chance to judge them.
  const legacy = {
    version: 1,
    levelProgress: {
      '9': { solvedIds: Array.from({ length: 20 }, (_, i) => `w${i}`), correct: 20, attempts: 22 },
    },
  };
  const store = new Map<string, string>([[PROGRESS_KEY, JSON.stringify(legacy)]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  const loaded = loadProgress();
  assert.equal(loaded.legacyClears['9'], true, 'level 9 qualified under the old flat rule, so it is grandfathered');
  assert.equal(levelStatus(loaded, 9).cleared, true, 'and therefore still reads as cleared under the new target');

  // Once grandfathered, re-saving and reloading must not lose it, even
  // though the field is now present (and empty is not the same as absent).
  saveProgress(loaded);
  const reloaded = loadProgress();
  assert.equal(reloaded.legacyClears['9'], true);
  delete (globalThis as Record<string, unknown>).localStorage;
});

test('a level that never qualified under the old rule is not grandfathered, and a brand-new player gets none for free', () => {
  const legacy = {
    version: 1,
    levelProgress: {
      // Only 12 distinct words -- short of the old rule's 20, so this
      // level was genuinely never cleared before the upgrade either.
      '3': { solvedIds: Array.from({ length: 12 }, (_, i) => `w${i}`), correct: 12, attempts: 14 },
    },
  };
  const store = new Map<string, string>([[PROGRESS_KEY, JSON.stringify(legacy)]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  assert.deepEqual(loadProgress().legacyClears, {});
  delete (globalThis as Record<string, unknown>).localStorage;

  // A player starting fresh after the upgrade has no old save to read at
  // all, so `emptyProgress()` -- not the legacy-snapshot branch -- is what
  // supplies their (empty) `legacyClears`.
  assert.deepEqual(emptyProgress().legacyClears, {});
});

test('a version 1 record with a malformed level entry loads instead of throwing', () => {
  const store = new Map<string, string>([[PROGRESS_KEY, JSON.stringify({
    version: 1, levelProgress: { '2': { solvedIds: 'not-an-array', correct: null } }, streak: 'nonsense',
  })]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  const loaded = loadProgress();
  assert.deepEqual(loaded.levelProgress['2'], { solvedIds: [], correct: 0, attempts: 0 });
  assert.equal(loaded.streak.current, 0);
  assert.doesNotThrow(() => levelStatus(loaded, 2));
  delete (globalThis as Record<string, unknown>).localStorage;
});
