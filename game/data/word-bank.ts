import type { Category, Familiarity, Level, SourceRow, WordEntry } from '@/lib/types';
import { draftPeopleRows, peopleRows } from '@/data/words/people';

export type { SourceRow };

const books: SourceRow[] = [
  ['Genesis', 'Genesis 1:1', 0], ['Exodus', 'Exodus 1:1', 0], ['Leviticus', 'Leviticus 1:1', 1], ['Numbers', 'Numbers 1:1', 0],
  ['Deuteronomy', 'Deuteronomy 1:1', 1], ['Joshua', 'Joshua 1:1', 0], ['Judges', 'Judges 1:1', 0], ['Ruth', 'Ruth 1:1', 0],
  ['1 Samuel', '1 Samuel 1:1', 0], ['2 Samuel', '2 Samuel 1:1', 0], ['1 Kings', '1 Kings 1:1', 0], ['2 Kings', '2 Kings 1:1', 0],
  ['1 Chronicles', '1 Chronicles 1:1', 1], ['2 Chronicles', '2 Chronicles 1:1', 1], ['Ezra', 'Ezra 1:1', 0], ['Nehemiah', 'Nehemiah 1:1', 1],
  ['Esther', 'Esther 1:1', 0], ['Job', 'Job 1:1', 0], ['Psalms', 'Psalms 1:1', 0], ['Proverbs', 'Proverbs 1:1', 0],
  ['Ecclesiastes', 'Ecclesiastes 1:1', 1], ['Song of Solomon', 'Song of Solomon 1:1', 1], ['Isaiah', 'Isaiah 1:1', 0], ['Jeremiah', 'Jeremiah 1:1', 0],
  ['Lamentations', 'Lamentations 1:1', 1], ['Ezekiel', 'Ezekiel 1:1', 1], ['Daniel', 'Daniel 1:1', 0], ['Hosea', 'Hosea 1:1', 1],
  ['Joel', 'Joel 1:1', 1], ['Amos', 'Amos 1:1', 1], ['Obadiah', 'Obadiah 1:1', 2], ['Jonah', 'Jonah 1:1', 0],
  ['Micah', 'Micah 1:1', 1], ['Nahum', 'Nahum 1:1', 2], ['Habakkuk', 'Habakkuk 1:1', 2], ['Zephaniah', 'Zephaniah 1:1', 2],
  ['Haggai', 'Haggai 1:1', 2], ['Zechariah', 'Zechariah 1:1', 1], ['Malachi', 'Malachi 1:1', 1], ['Matthew', 'Matthew 1:1', 0],
  ['Mark', 'Mark 1:1', 0], ['Luke', 'Luke 1:1', 0], ['John', 'John 1:1', 0], ['Acts', 'Acts 1:1', 0],
  ['Romans', 'Romans 1:1', 0], ['1 Corinthians', '1 Corinthians 1:1', 0], ['2 Corinthians', '2 Corinthians 1:1', 0], ['Galatians', 'Galatians 1:1', 1],
  ['Ephesians', 'Ephesians 1:1', 1], ['Philippians', 'Philippians 1:1', 1], ['Colossians', 'Colossians 1:1', 1], ['1 Thessalonians', '1 Thessalonians 1:1', 1],
  ['2 Thessalonians', '2 Thessalonians 1:1', 1], ['1 Timothy', '1 Timothy 1:1', 1], ['2 Timothy', '2 Timothy 1:1', 1], ['Titus', 'Titus 1:1', 1],
  ['Philemon', 'Philemon 1:1', 2], ['Hebrews', 'Hebrews 1:1', 1], ['James', 'James 1:1', 0], ['1 Peter', '1 Peter 1:1', 0],
  ['2 Peter', '2 Peter 1:1', 0], ['1 John', '1 John 1:1', 0], ['2 John', '2 John 1:1', 1], ['3 John', '3 John 1:1', 1],
  ['Jude', 'Jude 1:1', 1], ['Revelation', 'Revelation 1:1', 0],
];


const places: SourceRow[] = [
  ['Eden', 'Genesis 2:8', 0], ['Ararat', 'Genesis 8:4', 1], ['Babel', 'Genesis 11:9', 1], ['Ur', 'Genesis 11:31', 2],
  ['Canaan', 'Genesis 12:5', 0], ['Egypt', 'Genesis 12:10', 0], ['Goshen', 'Genesis 47:1', 2], ['Sinai', 'Exodus 19:1', 0],
  ['Midian', 'Exodus 2:15', 3], ['Jericho', 'Joshua 2:1', 0], ['Hebron', 'Joshua 10:36', 1], ['Shechem', 'Joshua 17:7', 2],
  ['Bethel', 'Genesis 28:19', 1], ['Ai', 'Joshua 7:2', 2], ['Jerusalem', '2 Samuel 5:5', 0], ['Bethlehem', 'Micah 5:2', 0],
  ['Nazareth', 'Matthew 2:23', 0], ['Galilee', 'Matthew 2:22', 0], ['Samaria', 'John 4:4', 1], ['Judea', 'Matthew 2:1', 1],
  ['Jordan', 'Matthew 3:5', 0], ['Gethsemane', 'Matthew 26:36', 1], ['Golgotha', 'Matthew 27:33', 1], ['Bethany', 'John 11:1', 1],
  ['Carmel', '1 Kings 18:19', 1], ['Nineveh', 'Jonah 1:2', 1], ['Babylon', '2 Kings 24:1', 0], ['Shushan', 'Esther 1:2', 3],
  ['Moab', 'Ruth 1:1', 1], ['Edom', 'Genesis 36:1', 1], ['Damascus', 'Acts 9:2', 0], ['Antioch', 'Acts 11:26', 1],
  ['Corinth', 'Acts 18:1', 1], ['Ephesus', 'Acts 18:19', 1], ['Philippi', 'Acts 16:12', 1], ['Rome', 'Acts 28:14', 0],
  ['Malta', 'Acts 28:1', 1], ['Patmos', 'Revelation 1:9', 1], ['Tarsus', 'Acts 9:11', 2], ['Joppa', 'Acts 9:36', 2],
  ['Caesarea', 'Acts 10:1', 1],
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

/** How many words each level should hold. Easier levels are larger so they
 * bear more replay; the hardest levels stay small and special. */
export const LEVEL_TARGETS = [90, 90, 85, 80, 75, 70, 65, 55, 50] as const;

const CATEGORY_LABEL: Record<Category, string> = {
  book: 'Bible book', person: 'Bible person', place: 'Bible place',
  tribe: 'tribe of Israel', nation: 'people or nation',
};

function makeEntries(category: Category, rows: SourceRow[], status: 'draft' | 'approved'): WordEntry[] {
  return rows.map(([display, reference, familiarity]) => {
    const playable = playableOf(display);
    return {
      id: `${category}.${slug(display)}`,
      answer: playable,
      display,
      playable,
      categories: [category],
      level: 1 as Level,
      familiarity,
      band: 1 as Level,
      hints: [
        `This answer is a ${CATEGORY_LABEL[category]}.`,
        `It begins with ${playable[0]} and has ${playable.length} characters.`,
      ],
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
  ...makeEntries('place', places, 'approved'),
]);

export const WORD_BANK_VERSION = '2026.09.17-1';

export function getEntry(id: string) {
  return WORD_BANK.find((entry) => entry.id === id);
}
