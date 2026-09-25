import type { Category, WordEntry } from '@/lib/types';

export type HintKind = 'letter' | 'context' | 'reference';

export type Hint = {
  kind: HintKind;
  text: string;
  /** Only on a `letter` hint: the position in the answer it uncovers. */
  revealIndex?: number;
};

/** What the player is about to buy, shown on the button so paying is an
 * informed choice rather than a coin flip. */
export const HINT_LABELS: Record<HintKind, string> = {
  letter: 'a letter',
  context: 'where it sits',
  reference: 'the scripture',
};

/** The 66 books in canonical order. This lives here rather than in the
 * word bank because it is reference metadata, not playable content: the
 * Testament, the section of the Bible and a book's position in the canon
 * all fall out of this one list. */
export const BIBLE_BOOKS: readonly string[] = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah',
  'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah',
  'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew',
  'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians',
  'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
  'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
  'Jude', 'Revelation',
];

/** Malachi is the last of the Hebrew Scriptures; Matthew opens the
 * Christian Greek Scriptures. */
const HEBREW_BOOK_COUNT = 39;

/** The bank cites the Psalms both ways. Anything else is spelled exactly
 * as `BIBLE_BOOKS` spells it. */
const BOOK_ALIASES: Record<string, string> = { Psalm: 'Psalms' };

/** "1 Samuel 1:20" -> "1 Samuel". References are always `Book c:v`, which
 * `word-bank.test.ts` enforces for every row in the bank. */
export function referenceBook(reference: string): string {
  const name = reference.replace(/\s+\d+:\d+\s*$/, '').trim();
  return BOOK_ALIASES[name] ?? name;
}

/** Position of the cited book in the canon, or -1 when the citation names
 * a book this list does not know. */
export function bookIndexOf(reference: string): number {
  return BIBLE_BOOKS.indexOf(referenceBook(reference));
}

function sectionFor(index: number): string {
  if (index <= 4) return 'the Law';
  if (index <= 16) return 'the history books';
  if (index <= 21) return 'the poetry and wisdom books';
  if (index <= 38) return 'the prophets';
  if (index <= 43) return 'the Gospels and Acts';
  if (index <= 64) return 'the letters';
  return 'Revelation';
}

function testamentFor(index: number): string {
  return index < HEBREW_BOOK_COUNT ? 'Hebrew Scriptures' : 'Christian Greek Scriptures';
}

const CATEGORY_NOUN: Record<Category, string> = {
  book: 'book', person: 'person', place: 'place',
  tribe: 'tribe of Israel', nation: 'people or nation',
};

/** Stricter than the naked substring test a reader would apply: the answer
 * is stripped of spaces and punctuation before the comparison, so "Read it
 * at 1 Kings 1:1" is caught as a leak of `1KINGS` even though the two do
 * not match character for character. */
function leaks(text: string, playable: string): boolean {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(playable);
}

/** The first phrasing that does not hand over the answer. Later candidates
 * deliberately drop detail: a place called "Ur" cannot be told it is in the
 * "Hebrew Scriptures" without the word Script-UR-es spelling it out. */
function pick(candidates: string[], playable: string): string {
  return candidates.find((candidate) => !leaks(candidate, playable)) ?? candidates[candidates.length - 1];
}

/** What the entry is and where in the Bible it sits. Never restates the
 * kicker, which already shows the category and the level. */
function contextCandidates(categories: Category[], reference: string): string[] {
  const noun = CATEGORY_NOUN[categories[0]] ?? 'name';
  const index = bookIndexOf(reference);
  if (index < 0) return [`A ${noun} named in the Bible.`, 'Named somewhere in the Bible.'];
  const section = sectionFor(index);
  const testament = testamentFor(index);
  return [
    `A ${noun} from the ${testament}, in ${section}.`,
    `A ${noun} from ${section}.`,
    `Named in ${section}.`,
    `From ${section}.`,
    `In the ${testament}.`,
  ];
}

/** The citation itself, which is the whole point of the game -- except
 * where the citation *is* the answer. Every Bible book is cited by its own
 * name, and so are the people and places with a book named after them, so
 * those get the canon position or a bare chapter and verse instead. */
function referenceCandidates(categories: Category[], reference: string): string[] {
  const index = bookIndexOf(reference);
  const chapterVerse = /(\d+):(\d+)\s*$/.exec(reference);
  const candidates = [`Read it at ${reference}.`];
  if (categories.includes('book') && index >= 0) {
    const position = index + 1;
    const previous = BIBLE_BOOKS[index - 1];
    const next = BIBLE_BOOKS[index + 1];
    candidates.push(
      previous && next ? `Book ${position} of the 66, between ${previous} and ${next}.`
        : next ? `The very first of the 66 books, just before ${next}.`
          : `The last of the 66 books, right after ${previous}.`,
      `Book ${position} of the 66.`,
    );
  }
  if (chapterVerse) {
    candidates.push(
      `Read it at chapter ${chapterVerse[1]}, verse ${chapterVerse[2]} of the book that carries this very name.`,
      `Read it at chapter ${chapterVerse[1]}, verse ${chapterVerse[2]}.`,
      `Chapter ${chapterVerse[1]}, verse ${chapterVerse[2]}.`,
    );
  }
  return candidates;
}

/** Everything `hintsFor` needs. Typed as a subset of `WordEntry` so the
 * word bank can build the ladder while an entry is still half-made. */
export type HintSource = Pick<WordEntry, 'categories' | 'references' | 'playable'>;

/** Three rungs, each worth a point: a letter on the board, then where in
 * the Bible the answer sits, then the citation. The old pair restated the
 * kicker and the slot count -- two points for one real fact. */
export function hintsFor(entry: HintSource): Hint[] {
  const playable = entry.playable;
  const reference = entry.references[0] ?? '';
  return [
    // The opening character, not "the first letter": a numbered book
    // carries its numeral into the scramble, so "1 Kings" starts with 1.
    { kind: 'letter', text: pick([`It starts with ${playable[0]}.`], playable), revealIndex: 0 },
    { kind: 'context', text: pick(contextCandidates(entry.categories, reference), playable) },
    { kind: 'reference', text: pick(referenceCandidates(entry.categories, reference), playable) },
  ];
}

/** The slot the letter hint should fill: the leftmost one that is empty or
 * holding the wrong tile. -1 once the board already spells the answer. */
function firstUnsolvedSlot(placed: number[], scramble: string, answer: string): number {
  for (let slot = 0; slot < answer.length; slot += 1) {
    if (slot >= placed.length) return slot;
    if (scramble[placed[slot]] !== answer[slot]) return slot;
  }
  return -1;
}

/** A new `placed` array with one correct tile moved into place. Whatever
 * was sitting in that slot goes back to the tray, which is what makes this
 * a hint rather than a nudge. */
export function applyLetterHint(entry: HintSource, placed: number[], scramble: string): number[] {
  const answer = entry.playable;
  const slot = firstUnsolvedSlot(placed, scramble, answer);
  if (slot < 0) return placed;
  const spokenFor = new Set(placed.filter((_, index) => index !== slot));
  let source = -1;
  for (let index = 0; index < scramble.length; index += 1) {
    if (scramble[index] === answer[slot] && !spokenFor.has(index)) { source = index; break; }
  }
  if (source < 0) return placed;
  if (slot >= placed.length) return [...placed, source];
  const next = [...placed];
  next[slot] = source;
  return next;
}
