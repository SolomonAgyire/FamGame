import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_NAMES } from '../lib/types';
import { PLAYABLE_BANK, normalizeAnswer } from '../lib/game-engine';
import { WORD_BANK, difficultyScore, LEVEL_TARGETS } from '../data/word-bank';

test('there are nine levels with the agreed names in order', () => {
  assert.deepEqual([...LEVEL_NAMES], [
    'Studying', 'Publisher', 'Baptized', 'Serving', 'Reaching Out',
    'Maturity', 'Strong Faith', 'New World', 'Eternity',
  ]);
});

test('answer normalization keeps digits so numbered books stay distinct', () => {
  assert.equal(normalizeAnswer('1 Kings'), '1KINGS');
  assert.equal(normalizeAnswer('2 Kings'), '2KINGS');
  assert.notEqual(normalizeAnswer('1 Kings'), normalizeAnswer('2 Kings'));
  assert.equal(normalizeAnswer('Song of Solomon'), 'SONGOFSOLOMON');
});

test('difficulty combines length with familiarity', () => {
  // A long household name and a short obscure one can land close together
  assert.equal(difficultyScore('DAVID', 0), 5);
  assert.equal(difficultyScore('DAVID', 4), 13);
  assert.ok(difficultyScore('DEUTERONOMY', 2) > difficultyScore('JOHN', 0));
});

test('numbered books carry the numeral in the playable letters', () => {
  const first = WORD_BANK.find((entry) => entry.display === '1 Kings');
  const second = WORD_BANK.find((entry) => entry.display === '2 Kings');
  assert.ok(first && second);
  assert.equal(first.playable, '1KINGS');
  assert.equal(second.playable, '2KINGS');
  assert.notEqual(first.answer, second.answer, '1 Kings and 2 Kings must not share an answer');
});

test('every entry has a level in range and the targets sum to the bank size', () => {
  assert.equal(LEVEL_TARGETS.length, 9);
  for (const entry of WORD_BANK) {
    assert.ok(entry.level >= 1 && entry.level <= 9, `${entry.display} has level ${entry.level}`);
    assert.equal(entry.band, entry.level, 'band must mirror level during migration');
  }
});

test('levels are ordered — no level contains an easier average word than the level below', () => {
  const averages = Array.from({ length: 9 }, (_, i) => {
    const words = WORD_BANK.filter((entry) => entry.level === i + 1);
    if (!words.length) return 0;
    return words.reduce((sum, entry) => sum + difficultyScore(entry.playable, entry.familiarity), 0) / words.length;
  });
  for (let i = 1; i < 9; i += 1) {
    if (averages[i] === 0 || averages[i - 1] === 0) continue;
    assert.ok(averages[i] >= averages[i - 1], `level ${i + 1} averages ${averages[i]} but level ${i} averages ${averages[i - 1]}`);
  }
});

/** Forms that belong to KJV and other translations, not the NWT. Their
 * presence means a word was sourced from the wrong translation. */
const NON_NWT_FORMS = [
  'Esaias', 'Elias', 'Eliseus', 'Osee', 'Jeremias', 'Noe', 'Core', 'Sion',
  'Marcus', 'Lucas', 'Timotheus', 'Zacharias', 'Ezekias', 'Josias', 'Jonas',
  'Judas Iscariot the son of Simon', 'Aggeus', 'Sophonias', 'Abdias', 'Micheas',
];

test('no entry uses a non-NWT name form', () => {
  for (const entry of WORD_BANK) {
    for (const bad of NON_NWT_FORMS) {
      assert.notEqual(entry.display.toLowerCase(), bad.toLowerCase(), `${entry.display} is a non-NWT form`);
    }
  }
});

test('every entry is complete and internally consistent', () => {
  for (const entry of WORD_BANK) {
    assert.ok(entry.id, 'missing id');
    assert.match(entry.playable, /^[A-Z0-9]+$/, `${entry.display} has an unplayable answer`);
    assert.equal(entry.answer, entry.playable, `${entry.display} answer and playable disagree`);
    assert.equal(entry.hints.length, 2, `${entry.display} needs exactly two hints`);
    assert.ok(entry.references[0], `${entry.display} has no reference`);
    assert.match(entry.references[0], /^[1-3]?\s?[A-Za-z][A-Za-z ]*\s\d+:\d+$/, `${entry.display} reference "${entry.references[0]}" is not book chapter:verse`);
    assert.ok(entry.familiarity >= 0 && entry.familiarity <= 4, `${entry.display} familiarity out of range`);
    assert.ok(['draft', 'approved'].includes(entry.status), `${entry.display} has an invalid status`);
    assert.equal(entry.verification, 'English NWT naming standard');
  }
});

test('no two entries share an id or a playable answer within a category', () => {
  const ids = new Set<string>();
  const seen = new Map<string, string>();
  for (const entry of WORD_BANK) {
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    const key = `${entry.categories[0]}:${entry.playable}`;
    const previous = seen.get(key);
    assert.ok(!previous, `${entry.display} collides with ${previous} — identical tiles, different answers`);
    seen.set(key, entry.display);
  }
});

test('all 66 Bible books are present and approved', () => {
  const books = WORD_BANK.filter((entry) => entry.categories.includes('book'));
  assert.equal(books.length, 66);
  for (const book of books) assert.equal(book.status, 'approved');
});

test('the twelve tribes and the major nations are present', () => {
  const tribes = WORD_BANK.filter((entry) => entry.categories.includes('tribe'));
  assert.ok(tribes.length >= 12, `expected at least 12 tribes, found ${tribes.length}`);
  const nations = WORD_BANK.filter((entry) => entry.categories.includes('nation'));
  assert.ok(nations.length >= 20, `expected at least 20 nations, found ${nations.length}`);
});

test('draft words never reach play', () => {
  assert.ok(PLAYABLE_BANK.length > 0);
  for (const entry of PLAYABLE_BANK) assert.equal(entry.status, 'approved');
  assert.ok(PLAYABLE_BANK.length < WORD_BANK.length, 'there should be drafts awaiting review');
});
