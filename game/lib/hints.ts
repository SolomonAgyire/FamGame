import type { Category, WordEntry } from '@/lib/types';

export type HintKind = 'category' | 'letter';

export type Hint = {
  kind: HintKind;
  text: string;
  /** Only on a `letter` hint: the position in the answer it uncovers. */
  revealIndex?: number;
};

/** What the player is about to buy, shown on the button so paying is an
 * informed choice rather than a coin flip. */
export const HINT_LABELS: Record<HintKind, string> = {
  category: 'what it is',
  letter: 'a letter',
};

/** The 66 books in canonical order. Kept as reference metadata: the word
 * bank's own tests check every citation names a book on this list. */
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

/** "Book," "name" or "place" -- the noun a player would actually ask for
 * ("is it a book, a place, or a name?"), not the bank's internal category
 * id (a person is asked about as a "name", never a "person"). */
const CATEGORY_HINT_NOUN: Record<Category, string> = {
  book: 'book', person: 'name', place: 'place', tribe: 'name', nation: 'name',
};

/** Everything `hintsFor` needs. Typed as a subset of `WordEntry` so the
 * word bank can build the ladder while an entry is still half-made. */
export type HintSource = Pick<WordEntry, 'categories' | 'references' | 'playable'>;

/** Two rungs: what kind of answer it is, then its opening letter placed on
 * the board. Nothing past that -- a citation would tell a player exactly
 * where to read the answer's own name for a Bible book, so the ladder
 * never reaches the scripture reference. */
export function hintsFor(entry: HintSource): Hint[] {
  const playable = entry.playable;
  const noun = CATEGORY_HINT_NOUN[entry.categories[0]] ?? 'name';
  return [
    { kind: 'category', text: `It's a ${noun}.` },
    // The opening character, not "the first letter": a numbered book
    // carries its numeral into the scramble, so "1 Kings" starts with 1.
    { kind: 'letter', text: `It starts with ${playable[0]}.`, revealIndex: 0 },
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
