import test from 'node:test';
import assert from 'node:assert/strict';
import { WORD_BANK } from '../data/word-bank';
import { createFreshRecipe, createRecipe, eligibleWords, nextPlayableLevelAbove, normalizeAnswer, playableLevelFrom, unplayableReason, wordsForLevel } from '../lib/game-engine';
import type { Category, GameSettings, Level } from '../lib/types';

const allSettings: GameSettings = { categories: ['book', 'person', 'place'], maxBand: 4, length: 15 };

test('the starter bank includes all 66 Bible books and complete metadata', () => {
  const books = WORD_BANK.filter((entry) => entry.categories.includes('book'));
  assert.equal(books.length, 66);
  for (const book of books) assert.equal(book.status, 'approved');
  for (const entry of WORD_BANK) {
    assert.ok(entry.id);
    assert.match(entry.playable, /^[A-Z0-9]+$/);
    assert.equal(entry.hints.length, 2);
    assert.ok(entry.references[0]);
    // The bank now carries a review queue: a word is either cleared for
    // play or still a draft. `PLAYABLE_BANK` is what reaches a player.
    assert.ok(['draft', 'approved'].includes(entry.status));
  }
});

test('a recipe is reproducible, contains no repeated entry, and never stores a solved scramble', () => {
  const first = createRecipe(allSettings, 'known-seed');
  const second = createRecipe(allSettings, 'known-seed');
  assert.deepEqual(first, second);
  assert.equal(first.puzzles.length, 15);
  assert.equal(new Set(first.puzzles.map((puzzle) => puzzle.entryId)).size, 15);
  for (const puzzle of first.puzzles) {
    const entry = WORD_BANK.find((item) => item.id === puzzle.entryId);
    assert.ok(entry);
    if (new Set(entry.playable).size > 1) assert.notEqual(puzzle.scramble, entry.playable);
  }
});

test('blended matches keep category representation balanced', () => {
  const recipe = createRecipe(allSettings, 'balanced-seed');
  const counts = { book: 0, person: 0, place: 0 };
  for (const puzzle of recipe.puzzles) {
    const entry = WORD_BANK.find((item) => item.id === puzzle.entryId);
    if (entry) counts[entry.categories[0] as 'book' | 'person' | 'place'] += 1;
  }
  assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1);
});

test('1,000 deterministic seeds generate 1,000 distinct match signatures', () => {
  const signatures = new Set(Array.from({ length: 1000 }, (_, index) => createRecipe(allSettings, `simulation-${index}`).signature));
  assert.equal(signatures.size, 1000);
});

test('settings filter and answer normalization behave predictably', () => {
  const books = eligibleWords({ categories: ['book'], maxBand: 1, length: 10 });
  assert.ok(books.length >= 10);
  assert.ok(books.every((entry) => entry.categories.includes('book') && entry.band === 1));
  // Digits are kept now, so the leading "1" of "1 Samuel" survives.
  assert.equal(normalizeAnswer(' 1 sam-uel '), '1SAMUEL');
});

// --- Regression: an empty pool blanked the screen (finding 2) -----------

test('a category and level combination with no words is refused with a reason that names it', () => {
  // A match draws from exactly one level, so a pool can be empty: there is
  // no approved Bible book at Eternity. That used to build a match with no
  // puzzles, which rendered as a blank page locally and wedged an online
  // room at PUZZLE_OPEN with no Leave, Next or Reveal control.
  const bookOnlyAtEternity: GameSettings = { categories: ['book'], maxBand: 9, length: 10 };
  assert.equal(wordsForLevel(9, ['book']).length, 0, 'this is the combination the guard exists for');
  assert.equal(createRecipe(bookOnlyAtEternity, 'empty-seed').puzzles.length, 0, 'which really does build an empty match');

  const reason = unplayableReason(bookOnlyAtEternity);
  assert.ok(reason, 'starting must be refused');
  assert.match(reason, /Bible Books/);
  assert.match(reason, /Eternity/);
});

test('every level with words at all is playable, and no reason is given for one that is', () => {
  const settings: GameSettings = { categories: ['book', 'person', 'place'], maxBand: 9, length: 10 };
  assert.ok(eligibleWords(settings).length > 0);
  assert.equal(unplayableReason(settings), null);
  for (let level = 1; level <= 9; level += 1) {
    const all: GameSettings = { categories: ['book', 'person', 'place'], maxBand: level as Level, length: 10 };
    assert.equal(unplayableReason(all), null, `the default word set must be playable at level ${level}`);
  }
});

test('a run never steps up into a level that has no words', () => {
  // Time Attack climbs the levels. Book-only runs out after level 8, so
  // stepping to 9 emptied the board and lost the run mid-flight.
  assert.equal(nextPlayableLevelAbove(8, ['book']), null, 'nothing above 8 for books, so the run ends instead');
  assert.equal(nextPlayableLevelAbove(8, ['book', 'person', 'place']), 9);
  const skipped = nextPlayableLevelAbove(1, ['book']);
  assert.ok(skipped && wordsForLevel(skipped, ['book']).length > 0);
});

test('a run starts at a level that has words, sliding off an empty one', () => {
  assert.equal(playableLevelFrom(9, ['book']), 8, 'level 9 is empty for books, so fall back to the nearest below');
  assert.equal(playableLevelFrom(9, ['book', 'person', 'place']), 9);
  assert.equal(playableLevelFrom(1, ['book']), 1);
  for (const categories of [['book'], ['person'], ['place'], ['book', 'person', 'place']] as Category[][]) {
    for (let level = 1; level <= 9; level += 1) {
      const landed = playableLevelFrom(level as Level, categories);
      assert.ok(landed, `no level at all for ${categories.join('+')}`);
      assert.ok(wordsForLevel(landed, categories).length > 0, `landed on an empty level ${landed}`);
    }
  }
});

// --- Regression: blocked storage white-screened the app (finding 3) -----

test('creating a match still works when localStorage throws on every access', () => {
  // `createFreshRecipe` runs inside a useState initialiser, so a throw
  // here happens during render with no error boundary above it -- the
  // whole app white-screened in an embedded frame or older Safari private
  // mode. The game must stay fully playable without storage.
  const thrower = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: thrower, configurable: true });
  try {
    const settings: GameSettings = { categories: ['book', 'person', 'place'], maxBand: 1, length: 6 };
    const recipe = createFreshRecipe(settings);
    assert.equal(recipe.puzzles.length, 6);
    assert.doesNotThrow(() => createFreshRecipe(settings));
  } finally {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
});

test('creating a match survives a localStorage getter that throws on access', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    get() { throw new Error('SecurityError: access is denied'); },
    configurable: true,
  });
  try {
    assert.doesNotThrow(() => createFreshRecipe({ categories: ['book'], maxBand: 1, length: 4 }));
  } finally {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
});

test('a garbage history entry does not stop a match being made', () => {
  const store = new Map<string, string>([['gatherword-match-history-v1', '{ not json']]);
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
    configurable: true,
  });
  try {
    assert.equal(createFreshRecipe({ categories: ['book'], maxBand: 1, length: 4 }).puzzles.length, 4);
  } finally {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
});
