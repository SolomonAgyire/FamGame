import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLetterHint, BIBLE_BOOKS, bookIndexOf, hintsFor } from '../lib/hints';
import { PLAYABLE_BANK } from '../lib/game-engine';

const entry = PLAYABLE_BANK.find((e) => e.display === 'Nehemiah')!;
/** A word whose citation points somewhere other than its own name, which
 * is the ordinary case: 674 of the 760 words in the bank. */
const crossReferenced = PLAYABLE_BANK.find((e) => !e.references[0].toUpperCase().replace(/[^A-Z0-9]/g, '').includes(e.playable))!;

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
  const [, , third] = hintsFor(crossReferenced);
  assert.equal(third.kind, 'reference');
  assert.ok(third.text.includes(crossReferenced.references[0]),
    `${crossReferenced.display}: "${third.text}" does not cite ${crossReferenced.references[0]}`);
});

// A Bible book is cited by its own name, so printing "Nehemiah 1:1" would
// hand over the answer. Those entries get the position in the canon, which
// is just as much a scripture fact and still points the player at a book.
test('a book, whose citation would be the answer, is placed in the canon instead', () => {
  const [, , third] = hintsFor(entry);
  assert.equal(third.kind, 'reference');
  assert.ok(/\bBook 16 of the 66\b/.test(third.text), `unexpected book hint: "${third.text}"`);
  assert.ok(third.text.includes('Ezra') && third.text.includes('Esther'));
});

test('a person named after their own book gets chapter and verse, not the book', () => {
  const ruth = PLAYABLE_BANK.find((e) => e.display === 'Ruth' && e.categories.includes('person'))!;
  const [, , third] = hintsFor(ruth);
  assert.equal(third.kind, 'reference');
  assert.ok(/chapter \d+, verse \d+/.test(third.text), `unexpected hint: "${third.text}"`);
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

test('every approved word can produce all three hints', () => {
  for (const sample of PLAYABLE_BANK) {
    assert.equal(hintsFor(sample).length, 3, `${sample.display} produced the wrong number of hints`);
  }
});

test('every citation in the bank names a book the ladder recognises', () => {
  for (const sample of PLAYABLE_BANK) {
    assert.ok(bookIndexOf(sample.references[0]) >= 0,
      `${sample.display} cites "${sample.references[0]}", which is not one of the 66`);
  }
  assert.equal(BIBLE_BOOKS.length, 66);
});

test('the context hint tells the player which Testament they are in', () => {
  const hebrew = hintsFor({ categories: ['person'], references: ['Exodus 2:10'], playable: 'MOSES' })[1];
  const greek = hintsFor({ categories: ['person'], references: ['Matthew 4:18'], playable: 'PETER' })[1];
  assert.ok(hebrew.text.includes('Hebrew Scriptures'), hebrew.text);
  assert.ok(greek.text.includes('Christian Greek Scriptures'), greek.text);
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
