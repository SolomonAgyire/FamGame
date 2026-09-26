import type { Category, Familiarity, Level, SourceRow, WordEntry } from '@/lib/types';
import { hintsFor } from '@/lib/hints';
import { draftPeopleRows, peopleRows } from '@/data/words/people';
import { draftPlaceRows, placeRows } from '@/data/words/places';
import { draftNationRows, nationRows, tribeRows } from '@/data/words/peoples';

export type { SourceRow };

const books: SourceRow[] = [
  ['Genesis', 'Genesis 1:1', 0], ['Exodus', 'Exodus 1:1', 0], ['Leviticus', 'Leviticus 1:1', 1], ['Numbers', 'Numbers 1:1', 0],
  ['Deuteronomy', 'Deuteronomy 1:1', 1], ['Joshua', 'Joshua 1:1', 0], ['Judges', 'Judges 1:1', 0], ['Ruth', 'Ruth 1:1', 0],
  ['1 Samuel', '1 Samuel 1:1', 0], ['2 Samuel', '2 Samuel 1:1', 0], ['1 Kings', '1 Kings 1:1', 0], ['2 Kings', '2 Kings 1:1', 0],
  ['1 Chronicles', '1 Chronicles 1:1', 1], ['2 Chronicles', '2 Chronicles 1:1', 1], ['Ezra', 'Ezra 1:1', 0], ['Nehemiah', 'Nehemiah 1:1', 1],
  ['Esther', 'Esther 1:1', 0], ['Job', 'Job 1:1', 0], ['Psalms', 'Psalms 1:1', 0], ['Proverbs', 'Proverbs 1:1', 0],
  ['Ecclesiastes', 'Ecclesiastes 1:1', 3], ['Song of Solomon', 'Song of Solomon 1:1', 1], ['Isaiah', 'Isaiah 1:1', 0], ['Jeremiah', 'Jeremiah 1:1', 0],
  ['Lamentations', 'Lamentations 1:1', 3], ['Ezekiel', 'Ezekiel 1:1', 1], ['Daniel', 'Daniel 1:1', 0], ['Hosea', 'Hosea 1:1', 1],
  ['Joel', 'Joel 1:1', 1], ['Amos', 'Amos 1:1', 1], ['Obadiah', 'Obadiah 1:1', 4], ['Jonah', 'Jonah 1:1', 0],
  ['Micah', 'Micah 1:1', 1], ['Nahum', 'Nahum 1:1', 4], ['Habakkuk', 'Habakkuk 1:1', 4], ['Zephaniah', 'Zephaniah 1:1', 4],
  ['Haggai', 'Haggai 1:1', 4], ['Zechariah', 'Zechariah 1:1', 1], ['Malachi', 'Malachi 1:1', 1], ['Matthew', 'Matthew 1:1', 0],
  ['Mark', 'Mark 1:1', 0], ['Luke', 'Luke 1:1', 0], ['John', 'John 1:1', 0], ['Acts', 'Acts 1:1', 0],
  ['Romans', 'Romans 1:1', 0], ['1 Corinthians', '1 Corinthians 1:1', 0], ['2 Corinthians', '2 Corinthians 1:1', 0], ['Galatians', 'Galatians 1:1', 1],
  ['Ephesians', 'Ephesians 1:1', 1], ['Philippians', 'Philippians 1:1', 1], ['Colossians', 'Colossians 1:1', 3], ['1 Thessalonians', '1 Thessalonians 1:1', 3],
  ['2 Thessalonians', '2 Thessalonians 1:1', 3], ['1 Timothy', '1 Timothy 1:1', 1], ['2 Timothy', '2 Timothy 1:1', 1], ['Titus', 'Titus 1:1', 1],
  ['Philemon', 'Philemon 1:1', 4], ['Hebrews', 'Hebrews 1:1', 1], ['James', 'James 1:1', 0], ['1 Peter', '1 Peter 1:1', 0],
  ['2 Peter', '2 Peter 1:1', 0], ['1 John', '1 John 1:1', 0], ['2 John', '2 John 1:1', 1], ['3 John', '3 John 1:1', 1],
  ['Jude', 'Jude 1:1', 1], ['Revelation', 'Revelation 1:1', 0],
];


const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Digits are kept: the numeral of "1 Kings" becomes a real scramble tile
 * so the player can tell it from "2 Kings" instead of guessing. */
const playableOf = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Length is the honest proxy for how hard a scramble is to read;
 * familiarity carries how likely the player is to recognise it at all. */
export function difficultyScore(playable: string, familiarity: Familiarity): number {
  return playable.length + familiarity * 2;
}

/** How many words each level should hold, as relative weights (the actual
 * count per level scales to the size of the bank -- see `assignLevels`).
 * Levels still shrink through the middle of the climb, but the top three
 * hold a deliberately large, roughly equal share: Phase G grew the hard end
 * specifically so Strong Faith, New World and Eternity replay well instead
 * of running out of distinct words after a few sittings. */
export const LEVEL_TARGETS = [88, 88, 83, 78, 73, 68, 80, 80, 80] as const;

function makeEntries(category: Category, rows: SourceRow[], status: 'draft' | 'approved'): WordEntry[] {
  return rows.map(([display, reference, familiarity]) => {
    const playable = playableOf(display);
    // The stored pair is the last two rungs of the shared ladder. The first
    // rung places a letter on the board, so it is derived at play time from
    // whatever the player has already built rather than baked in here.
    const ladder = hintsFor({ categories: [category], references: [reference], playable });
    return {
      id: `${category}.${slug(display)}`,
      answer: playable,
      display,
      playable,
      categories: [category],
      level: 1 as Level,
      familiarity,
      band: 1 as Level,
      hints: [ladder[1].text, ladder[2].text],
      references: [reference],
      verification: 'English NWT naming standard',
      status,
    };
  });
}

/** Sort the whole bank by difficulty, then cut it into the nine target
 * buckets. Deterministic and re-runnable every time the bank grows. */
export function assignLevels(entries: WordEntry[]): WordEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const delta = difficultyScore(a.playable, a.familiarity) - difficultyScore(b.playable, b.familiarity);
    return delta !== 0 ? delta : a.display.localeCompare(b.display);
  });
  const total = sorted.length;
  const scale = total / LEVEL_TARGETS.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  const out: WordEntry[] = [];
  for (let index = 0; index < LEVEL_TARGETS.length; index += 1) {
    const take = index === LEVEL_TARGETS.length - 1 ? total - cursor : Math.round(LEVEL_TARGETS[index] * scale);
    const level = (index + 1) as Level;
    for (const entry of sorted.slice(cursor, cursor + take)) {
      out.push({ ...entry, level, band: level });
    }
    cursor += take;
  }
  return out;
}

export const WORD_BANK: WordEntry[] = assignLevels([
  ...makeEntries('book', books, 'approved'),
  ...makeEntries('person', peopleRows, 'approved'),
  ...makeEntries('person', draftPeopleRows, 'draft'),
  ...makeEntries('place', placeRows, 'approved'),
  ...makeEntries('place', draftPlaceRows, 'draft'),
  ...makeEntries('tribe', tribeRows, 'approved'),
  ...makeEntries('nation', nationRows, 'approved'),
  ...makeEntries('nation', draftNationRows, 'draft'),
]);

export const WORD_BANK_VERSION = '2026.09.24-1';

export function getEntry(id: string) {
  return WORD_BANK.find((entry) => entry.id === id);
}
