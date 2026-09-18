import type { Category, DifficultyBand, WordEntry } from '@/lib/types';

type SourceRow = [display: string, reference: string];

const books: SourceRow[] = [
  ['Genesis', 'Genesis 1:1'], ['Exodus', 'Exodus 1:1'], ['Leviticus', 'Leviticus 1:1'], ['Numbers', 'Numbers 1:1'],
  ['Deuteronomy', 'Deuteronomy 1:1'], ['Joshua', 'Joshua 1:1'], ['Judges', 'Judges 1:1'], ['Ruth', 'Ruth 1:1'],
  ['1 Samuel', '1 Samuel 1:1'], ['2 Samuel', '2 Samuel 1:1'], ['1 Kings', '1 Kings 1:1'], ['2 Kings', '2 Kings 1:1'],
  ['1 Chronicles', '1 Chronicles 1:1'], ['2 Chronicles', '2 Chronicles 1:1'], ['Ezra', 'Ezra 1:1'], ['Nehemiah', 'Nehemiah 1:1'],
  ['Esther', 'Esther 1:1'], ['Job', 'Job 1:1'], ['Psalms', 'Psalms 1:1'], ['Proverbs', 'Proverbs 1:1'],
  ['Ecclesiastes', 'Ecclesiastes 1:1'], ['Song of Solomon', 'Song of Solomon 1:1'], ['Isaiah', 'Isaiah 1:1'], ['Jeremiah', 'Jeremiah 1:1'],
  ['Lamentations', 'Lamentations 1:1'], ['Ezekiel', 'Ezekiel 1:1'], ['Daniel', 'Daniel 1:1'], ['Hosea', 'Hosea 1:1'],
  ['Joel', 'Joel 1:1'], ['Amos', 'Amos 1:1'], ['Obadiah', 'Obadiah 1:1'], ['Jonah', 'Jonah 1:1'],
  ['Micah', 'Micah 1:1'], ['Nahum', 'Nahum 1:1'], ['Habakkuk', 'Habakkuk 1:1'], ['Zephaniah', 'Zephaniah 1:1'],
  ['Haggai', 'Haggai 1:1'], ['Zechariah', 'Zechariah 1:1'], ['Malachi', 'Malachi 1:1'], ['Matthew', 'Matthew 1:1'],
  ['Mark', 'Mark 1:1'], ['Luke', 'Luke 1:1'], ['John', 'John 1:1'], ['Acts', 'Acts 1:1'],
  ['Romans', 'Romans 1:1'], ['1 Corinthians', '1 Corinthians 1:1'], ['2 Corinthians', '2 Corinthians 1:1'], ['Galatians', 'Galatians 1:1'],
  ['Ephesians', 'Ephesians 1:1'], ['Philippians', 'Philippians 1:1'], ['Colossians', 'Colossians 1:1'], ['1 Thessalonians', '1 Thessalonians 1:1'],
  ['2 Thessalonians', '2 Thessalonians 1:1'], ['1 Timothy', '1 Timothy 1:1'], ['2 Timothy', '2 Timothy 1:1'], ['Titus', 'Titus 1:1'],
  ['Philemon', 'Philemon 1:1'], ['Hebrews', 'Hebrews 1:1'], ['James', 'James 1:1'], ['1 Peter', '1 Peter 1:1'],
  ['2 Peter', '2 Peter 1:1'], ['1 John', '1 John 1:1'], ['2 John', '2 John 1:1'], ['3 John', '3 John 1:1'],
  ['Jude', 'Jude 1:1'], ['Revelation', 'Revelation 1:1'],
];

const people: SourceRow[] = [
  ['Abraham', 'Genesis 17:5'], ['Sarah', 'Genesis 17:15'], ['Isaac', 'Genesis 21:3'], ['Rebekah', 'Genesis 24:15'],
  ['Jacob', 'Genesis 25:26'], ['Joseph', 'Genesis 30:24'], ['Moses', 'Exodus 3:4'], ['Aaron', 'Exodus 4:14'],
  ['Miriam', 'Exodus 15:20'], ['Joshua', 'Joshua 1:1'], ['Rahab', 'Joshua 2:1'], ['Gideon', 'Judges 6:11'],
  ['Samson', 'Judges 13:24'], ['Ruth', 'Ruth 1:4'], ['Naomi', 'Ruth 1:2'], ['Boaz', 'Ruth 2:1'],
  ['Samuel', '1 Samuel 1:20'], ['Saul', '1 Samuel 9:2'], ['David', '1 Samuel 16:13'], ['Jonathan', '1 Samuel 18:1'],
  ['Abigail', '1 Samuel 25:3'], ['Solomon', '2 Samuel 12:24'], ['Elijah', '1 Kings 17:1'], ['Elisha', '1 Kings 19:16'],
  ['Hezekiah', '2 Kings 18:1'], ['Josiah', '2 Kings 22:1'], ['Ezra', 'Ezra 7:1'], ['Nehemiah', 'Nehemiah 1:1'],
  ['Esther', 'Esther 2:7'], ['Mordecai', 'Esther 2:5'], ['Job', 'Job 1:1'], ['Isaiah', 'Isaiah 1:1'],
  ['Jeremiah', 'Jeremiah 1:1'], ['Ezekiel', 'Ezekiel 1:3'], ['Daniel', 'Daniel 1:6'], ['Hosea', 'Hosea 1:1'],
  ['Jonah', 'Jonah 1:1'], ['Mary', 'Matthew 1:16'], ['Elizabeth', 'Luke 1:5'], ['Zechariah', 'Luke 1:5'],
  ['Jesus', 'Matthew 1:21'], ['Peter', 'Matthew 4:18'], ['Andrew', 'Matthew 4:18'], ['James', 'Matthew 4:21'],
  ['Philip', 'John 1:43'], ['Nathanael', 'John 1:45'], ['Martha', 'Luke 10:38'], ['Lazarus', 'John 11:1'],
  ['Paul', 'Acts 13:9'], ['Barnabas', 'Acts 4:36'], ['Timothy', 'Acts 16:1'], ['Lydia', 'Acts 16:14'],
  ['Priscilla', 'Acts 18:2'], ['Aquila', 'Acts 18:2'], ['Stephen', 'Acts 6:5'], ['Phoebe', 'Romans 16:1'],
  ['Lois', '2 Timothy 1:5'], ['Eunice', '2 Timothy 1:5'],
];

const places: SourceRow[] = [
  ['Eden', 'Genesis 2:8'], ['Ararat', 'Genesis 8:4'], ['Babel', 'Genesis 11:9'], ['Ur', 'Genesis 11:31'],
  ['Canaan', 'Genesis 12:5'], ['Egypt', 'Genesis 12:10'], ['Goshen', 'Genesis 47:1'], ['Sinai', 'Exodus 19:1'],
  ['Midian', 'Exodus 2:15'], ['Jericho', 'Joshua 2:1'], ['Hebron', 'Joshua 10:36'], ['Shechem', 'Joshua 17:7'],
  ['Bethel', 'Genesis 28:19'], ['Ai', 'Joshua 7:2'], ['Jerusalem', '2 Samuel 5:5'], ['Bethlehem', 'Micah 5:2'],
  ['Nazareth', 'Matthew 2:23'], ['Galilee', 'Matthew 2:22'], ['Samaria', 'John 4:4'], ['Judea', 'Matthew 2:1'],
  ['Jordan', 'Matthew 3:5'], ['Gethsemane', 'Matthew 26:36'], ['Golgotha', 'Matthew 27:33'], ['Bethany', 'John 11:1'],
  ['Carmel', '1 Kings 18:19'], ['Nineveh', 'Jonah 1:2'], ['Babylon', '2 Kings 24:1'], ['Shushan', 'Esther 1:2'],
  ['Moab', 'Ruth 1:1'], ['Edom', 'Genesis 36:1'], ['Damascus', 'Acts 9:2'], ['Antioch', 'Acts 11:26'],
  ['Corinth', 'Acts 18:1'], ['Ephesus', 'Acts 18:19'], ['Philippi', 'Acts 16:12'], ['Rome', 'Acts 28:14'],
  ['Malta', 'Acts 28:1'], ['Patmos', 'Revelation 1:9'], ['Tarsus', 'Acts 9:11'], ['Joppa', 'Acts 9:36'],
  ['Caesarea', 'Acts 10:1'],
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lettersOnly = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, '');
const difficulty = (length: number): DifficultyBand => length <= 5 ? 1 : length <= 7 ? 2 : length <= 9 ? 3 : 4;

function makeEntries(category: Category, rows: SourceRow[]): WordEntry[] {
  return rows.map(([display, reference]) => {
    const fixedPrefix = /^\d/.test(display) ? display.match(/^\d/)?.[0] : undefined;
    const playableDisplay = fixedPrefix ? display.replace(/^\d\s*/, '') : display;
    const playable = lettersOnly(playableDisplay);
    const categoryLabel = category === 'book' ? 'Bible book' : category === 'person' ? 'Bible person' : 'Bible place';
    return {
      id: `${category}.${slug(display)}`,
      answer: playable,
      display,
      playable,
      fixedPrefix,
      categories: [category],
      band: difficulty(playable.length),
      hints: [`This answer is a ${categoryLabel}.`, `It begins with ${playable[0]} and has ${playable.length} letters.`],
      references: [reference],
      verification: 'English NWT naming standard',
      status: 'approved',
    };
  });
}

export const WORD_BANK: WordEntry[] = [
  ...makeEntries('book', books),
  ...makeEntries('person', people),
  ...makeEntries('place', places),
];

export const WORD_BANK_VERSION = '2026.09.17-1';

export function getEntry(id: string) {
  return WORD_BANK.find((entry) => entry.id === id);
}
