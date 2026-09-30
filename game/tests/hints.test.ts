import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLetterHint, BIBLE_BOOKS, bookIndexOf, hintsFor } from '../lib/hints';
import { PLAYABLE_BANK } from '../lib/game-engine';

const entry = PLAYABLE_BANK.find((e) => e.display === 'Nehemiah')!;

test('the first hint says what kind of answer it is', () => {
  const [first] = hintsFor(entry);
  assert.equal(first.kind, 'category');
});

test('a book entry\'s first hint calls it a book', () => {
  const [first] = hintsFor({ categories: ['book'], references: ['Genesis 1:1'], playable: 'GENESIS' });
  assert.equal(first.text, "It's a book.");
});

test('a person entry\'s first hint calls it a name, not a person', () => {
  const [first] = hintsFor({ categories: ['person'], references: ['Exodus 2:10'], playable: 'MOSES' });
  assert.equal(first.text, "It's a name.");
});

test('a place entry\'s first hint calls it a place', () => {
  const [first] = hintsFor({ categories: ['place'], references: ['Genesis 13:18'], playable: 'HEBRON' });
  assert.equal(first.text, "It's a place.");
});

test('the second hint reveals a letter in place', () => {
  const [, second] = hintsFor(entry);
  assert.equal(second.kind, 'letter');
  assert.equal(typeof second.revealIndex, 'number');
});

test('there are exactly two hints -- nothing past the letter', () => {
  const [first, second, third] = hintsFor(entry);
  assert.ok(first && second);
  assert.equal(third, undefined);
});

test('no hint ever contains the answer itself', () => {
  for (const sample of PLAYABLE_BANK.slice(0, 120)) {
    for (const hint of hintsFor(sample)) {
      assert.ok(!hint.text.toUpperCase().includes(sample.playable),
        `${sample.display}: hint "${hint.text}" leaks the answer`);
    }
  }
});

// The slice above is the plan's spot check; a word game cannot afford a
// leak anywhere, so the same rule is enforced over the whole bank, and
// with spaces and punctuation stripped so "1 Kings 1:1" counts as a leak
// of `1KINGS` too.
test('no hint leaks the answer anywhere in the bank, spacing included', () => {
  for (const sample of PLAYABLE_BANK) {
    for (const hint of hintsFor(sample)) {
      assert.ok(!hint.text.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(sample.playable),
        `${sample.display}: hint "${hint.text}" leaks the answer`);
    }
  }
});

test('every approved word produces exactly two hints', () => {
  for (const sample of PLAYABLE_BANK) {
    assert.equal(hintsFor(sample).length, 2, `${sample.display} produced the wrong number of hints`);
  }
});

test('every citation in the bank names a book the canon recognises', () => {
  for (const sample of PLAYABLE_BANK) {
    assert.ok(bookIndexOf(sample.references[0]) >= 0,
      `${sample.display} cites "${sample.references[0]}", which is not one of the 66`);
  }
  assert.equal(BIBLE_BOOKS.length, 66);
});

test('a letter hint puts the opening tile in its slot', () => {
  const source = { categories: ['person'] as const, references: ['Exodus 2:10'], playable: 'MOSES' };
  const scramble = 'SEMOS';
  const placed = applyLetterHint({ ...source, categories: ['person'] }, [], scramble);
  assert.equal(scramble[placed[0]], 'M');
  assert.equal(placed.length, 1);
});

test('a letter hint fills the leftmost slot that is empty or wrong', () => {
  const source = { categories: ['person'] as const, references: ['Exodus 2:10'], playable: 'MOSES' };
  const scramble = 'SEMOS';           // indexes: 0=S 1=E 2=M 3=O 4=S
  // M is already right, so the hint should correct slot 1 -- which holds S.
  const placed = applyLetterHint({ ...source, categories: ['person'] }, [2, 0], scramble);
  assert.equal(scramble[placed[0]], 'M');
  assert.equal(scramble[placed[1]], 'O');
  assert.equal(placed.length, 2);
});

test('a letter hint on a solved board changes nothing', () => {
  const source = { categories: ['person'] as const, references: ['Exodus 2:10'], playable: 'MOSES' };
  const scramble = 'SEMOS';
  const solved = [2, 3, 0, 1, 4];      // M O S E S
  assert.deepEqual(applyLetterHint({ ...source, categories: ['person'] }, solved, scramble), solved);
});

test('a letter hint never reuses a tile that is already placed', () => {
  for (const sample of PLAYABLE_BANK.slice(0, 60)) {
    const scramble = [...sample.playable].reverse().join('');
    let placed: number[] = [];
    for (let step = 0; step < sample.playable.length; step += 1) {
      placed = applyLetterHint(sample, placed, scramble);
      assert.equal(new Set(placed).size, placed.length, `${sample.display} placed a tile twice`);
    }
    assert.equal(placed.map((index) => scramble[index]).join(''), sample.playable);
  }
});
