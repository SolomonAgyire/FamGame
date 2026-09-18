import test from 'node:test';
import assert from 'node:assert/strict';
import { WORD_BANK } from '../data/word-bank';
import { createRecipe, eligibleWords, normalizeAnswer } from '../lib/game-engine';
import type { GameSettings } from '../lib/types';

const allSettings: GameSettings = { categories: ['book', 'person', 'place'], maxBand: 4, length: 15 };

test('the starter bank includes all 66 Bible books and complete metadata', () => {
  assert.equal(WORD_BANK.filter((entry) => entry.categories.includes('book')).length, 66);
  for (const entry of WORD_BANK) {
    assert.ok(entry.id);
    assert.match(entry.playable, /^[A-Z]+$/);
    assert.equal(entry.hints.length, 2);
    assert.ok(entry.references[0]);
    assert.equal(entry.status, 'approved');
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
    if (entry) counts[entry.categories[0]] += 1;
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
  assert.equal(normalizeAnswer(' 1 sam-uel '), 'SAMUEL');
});
