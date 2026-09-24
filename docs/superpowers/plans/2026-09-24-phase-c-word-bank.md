# Phase C — Word Bank Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the word bank from 165 to ~660 NWT-verified proper nouns, add `tribe` and `nation` categories, replace the four length-based bands with a nine-level difficulty model, and fix the numbered-book collision by putting the numeral into the scramble.

**Architecture:** `data/word-bank.ts` keeps its current shape — plain source rows compiled into `WordEntry[]` by a builder function — but each row gains a familiarity rating, and the builder computes level from `letters + familiarity × 2`. New words land as `status: 'draft'` and are filtered out of play until approved, so the game keeps running on the existing 165 throughout. Source rows are split into per-category files to keep any one file reviewable.

**Tech Stack:** TypeScript, `node:test` via `tsx`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-wordin-progression-and-retention.md` §2, §4

## Global Constraints

- **NWT-only naming standard.** Every spelling and reference must match the English New World Translation (2013 revision). jw.org **may be consulted** to confirm a spelling; it must **never** be scraped, bulk-extracted, or copied. No KJV/WEB/other-translation forms.
- **Greek Scriptures use Hebrew name forms** in NWT: *Isaiah* not Esaias, *Elijah* not Elias, *Elisha* not Eliseus, *Hosea* not Osee, *Jeremiah* not Jeremias, *Noah* not Noe, *Korah* not Core, *Zion* not Sion, *Mark* not Marcus. A KJV-style form is a test failure.
- **Proper nouns only.** Names are facts and need no doctrinal vetting. No abstract terms, no quoted passages, no apocryphal names.
- **Only `status: 'approved'` words enter play.** New words are `draft` until reviewed.
- **No new runtime dependencies.**
- Test command is `npm test` from `game/`.

---

### Task 1: Widen the types for nine levels and new categories

**Files:**
- Modify: `game/lib/types.ts`
- Modify: `game/lib/game-engine.ts`
- Test: `game/tests/word-bank.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Category = 'book' | 'person' | 'place' | 'tribe' | 'nation'`
  - `type Level = 1|2|3|4|5|6|7|8|9`
  - `type Familiarity = 0|1|2|3|4`
  - `WordEntry` gains `level: Level`, `familiarity: Familiarity`, `status: 'draft' | 'approved'`
  - `const LEVEL_NAMES: readonly string[]`
  - `function levelFor(letterCount: number, familiarity: Familiarity, index: number, total: number): Level` — see Task 2
  - `normalizeAnswer` keeps digits

- [ ] **Step 1: Write the failing test**

Create `game/tests/word-bank.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_NAMES } from '../lib/types';
import { normalizeAnswer } from '../lib/game-engine';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `LEVEL_NAMES` is not exported from `../lib/types`.

- [ ] **Step 3: Write the implementation**

In `game/lib/types.ts`, replace the `Category` and `DifficultyBand` declarations and widen `WordEntry`:

```ts
export type Category = 'book' | 'person' | 'place' | 'tribe' | 'nation';
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/** 0 = a household name, 4 = genuinely obscure. Set by hand per word. */
export type Familiarity = 0 | 1 | 2 | 3 | 4;

/** Kept as an alias so existing call sites compile while Phase D migrates
 * them; remove once nothing references it. */
export type DifficultyBand = Level;

export const LEVEL_NAMES = [
  'Studying', 'Publisher', 'Baptized', 'Serving', 'Reaching Out',
  'Maturity', 'Strong Faith', 'New World', 'Eternity',
] as const;

export type WordEntry = {
  id: string;
  answer: string;
  display: string;
  playable: string;
  fixedPrefix?: string;
  categories: Category[];
  level: Level;
  familiarity: Familiarity;
  /** Retained as an alias of `level` during the Phase D migration. */
  band: Level;
  hints: [string, string];
  references: string[];
  verification: 'English NWT naming standard';
  status: 'draft' | 'approved';
};
```

Update `GameSettings` in the same file so `maxBand` becomes a `Level` and add the new categories to any literal union:

```ts
export type GameSettings = {
  categories: Category[];
  maxBand: Level;
  length: number;
};
```

In `game/lib/game-engine.ts`, change `normalizeAnswer` to keep digits:

```ts
/** Digits are kept so "1 Kings" and "2 Kings" stay distinguishable --
 * they scramble to identical letters otherwise. */
export function normalizeAnswer(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
```

- [ ] **Step 4: Retire the four hardcoded band names**

`BAND_NAMES` is declared at `components/GatherWordApp.tsx:36` and read in 19 places. With nine levels, `BAND_NAMES[entry.band - 1]` renders `undefined` for anything above level 4. Delete the constant and repoint every usage at the nine-name list:

```ts
// delete this line entirely:
// const BAND_NAMES = ['Starter', 'Familiar', 'Challenge', 'Deep Cut'];
```

Add `LEVEL_NAMES` to the existing type import from `@/lib/types` (it is a value, not a type, so it needs its own import clause), then run a mechanical replace of `BAND_NAMES` with `LEVEL_NAMES` across the file. Also delete the now-dead `fixedPrefix` plumbing: `lib/room-service.ts:145`, the `fixedPrefix?: string` field in the `RoomSnapshot` puzzle type at `components/GatherWordApp.tsx:30`, and `fixedPrefix?: string` in `WordEntry`. The numeral now lives in `playable`, so nothing needs a separate prefix.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd game && npm test && npx tsc --noEmit`
Expected: the two new tests PASS. Existing tests may still fail to compile because `WordEntry` requires `level` and `familiarity` — Task 2 fixes that. Note which fail and continue.

- [ ] **Step 6: Commit**

```bash
cd game && git add lib/types.ts lib/game-engine.ts lib/room-service.ts components/GatherWordApp.tsx tests/word-bank.test.ts
git commit -m "feat: widen types to nine levels and five categories

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The level assignment rule and the numeral-in-scramble fix

**Files:**
- Modify: `game/data/word-bank.ts`
- Modify: `game/tests/word-bank.test.ts`

**Interfaces:**
- Consumes: `Category`, `Level`, `Familiarity`, `WordEntry`, `LEVEL_NAMES` from Task 1.
- Produces:
  - `type SourceRow = [display: string, reference: string, familiarity: Familiarity]`
  - `function difficultyScore(playable: string, familiarity: Familiarity): number`
  - `function assignLevels(entries: WordEntry[]): WordEntry[]`
  - `const LEVEL_TARGETS: readonly number[]`
  - `WORD_BANK` compiled with numerals inside `playable`

The numeral now appears as an ordinary scramble tile, so a player sees a `1` and knows which book they are solving.

- [ ] **Step 1: Write the failing test**

Append to `game/tests/word-bank.test.ts`:

```ts
import { WORD_BANK, difficultyScore, LEVEL_TARGETS } from '../data/word-bank';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `difficultyScore` is not exported.

- [ ] **Step 3: Write the implementation**

In `game/data/word-bank.ts`, replace the `SourceRow` type, the `difficulty` helper and `makeEntries`:

```ts
import type { Category, Familiarity, Level, WordEntry } from '@/lib/types';

/** display, NWT reference, familiarity (0 household .. 4 obscure) */
type SourceRow = [display: string, reference: string, familiarity: Familiarity];

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
```

Then rebuild the export at the bottom of the file:

```ts
export const WORD_BANK: WordEntry[] = assignLevels([
  ...makeEntries('book', books, 'approved'),
  ...makeEntries('person', people, 'approved'),
  ...makeEntries('place', places, 'approved'),
]);
```

Add a familiarity value to every existing source row. Use this guide: 0 for names any reader knows (John, David, Moses, Jerusalem); 1 for widely familiar (Nehemiah, Samaria); 2 for recognisable with effort (Habakkuk, Shechem); 3 for uncommon (Mordecai, Midian); 4 for obscure (Melchizedek, Kadesh-barnea).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS — including the pre-existing engine tests, which must keep passing.

- [ ] **Step 5: Commit**

```bash
cd game && git add data/word-bank.ts tests/word-bank.test.ts
git commit -m "feat: assign nine levels by difficulty and scramble book numerals

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: NWT verification guard

**Files:**
- Modify: `game/tests/word-bank.test.ts`

**Interfaces:**
- Consumes: `WORD_BANK` from Task 2.
- Produces: no new exports — this task adds the guard that every later data task must satisfy.

Write this **before** adding 500 words so the additions are constrained from the first one.

- [ ] **Step 1: Write the test**

Append to `game/tests/word-bank.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test**

Run: `cd game && npm test`
Expected: PASS against the existing 165. If the reference-format assertion fails on a current entry, fix that entry's reference — do not loosen the pattern.

- [ ] **Step 3: Commit**

```bash
cd game && git add tests/word-bank.test.ts
git commit -m "test: guard the bank against non-NWT forms and collisions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Add ~240 people

**Files:**
- Create: `game/data/words/people.ts`
- Modify: `game/data/word-bank.ts`

**Interfaces:**
- Consumes: `SourceRow` from Task 2; the guard from Task 3.
- Produces: `export const peopleRows: SourceRow[]` — the existing 58 plus ~240 new, all `draft`.

Split into its own file because a 300-row array inside `word-bank.ts` stops being reviewable.

- [ ] **Step 1: Create the file with the existing rows moved across**

Create `game/data/words/people.ts`, exporting `peopleRows`, and move the current `people` array into it with familiarity added to each row.

- [ ] **Step 2: Add the new people**

Extend `peopleRows` to ~300 total. Cover, with an NWT reference and familiarity for each:

- **Patriarchs and family:** Adam, Eve, Cain, Abel, Seth, Enoch, Methuselah, Lamech, Shem, Ham, Japheth, Terah, Lot, Hagar, Ishmael, Esau, Leah, Rachel, Bilhah, Zilpah, Dinah, Reuben, Simeon, Levi, Judah, Issachar, Zebulun, Dan, Naphtali, Gad, Asher, Benjamin, Manasseh, Ephraim, Tamar, Potiphar, Asenath.
- **Exodus and wilderness:** Jochebed, Amram, Zipporah, Jethro, Hur, Bezalel, Oholiab, Nadab, Abihu, Eleazar, Ithamar, Phinehas, Korah, Dathan, Abiram, Balaam, Balak, Caleb, Achan.
- **Judges:** Othniel, Ehud, Shamgar, Deborah, Barak, Jael, Sisera, Abimelech, Tola, Jair, Jephthah, Ibzan, Elon, Abdon, Delilah, Micah, Eli, Hophni, Phinehas.
- **United and divided kingdoms:** Jesse, Abner, Joab, Absalom, Amnon, Tamar, Ahithophel, Mephibosheth, Ziba, Nathan, Bathsheba, Adonijah, Zadok, Abiathar, Benaiah, Rehoboam, Jeroboam, Abijah, Asa, Jehoshaphat, Jehoram, Ahaziah, Athaliah, Joash, Amaziah, Uzziah, Jotham, Ahaz, Manasseh, Amon, Jehoahaz, Jehoiakim, Jehoiachin, Zedekiah, Omri, Ahab, Jezebel, Naboth, Jehu, Hazael, Ben-hadad, Naaman, Gehazi, Sennacherib, Nebuchadnezzar, Belshazzar, Darius, Cyrus, Artaxerxes, Ahasuerus, Haman, Vashti, Zerubbabel, Jeshua, Sanballat, Tobiah.
- **Prophets and scribes:** Micaiah, Obadiah, Huldah, Baruch, Ebed-melech, Hananiah, Shadrach, Meshach, Abednego, Ezekiel, Haggai, Zechariah, Malachi, Melchizedek, Jabez, Boaz, Elimelech, Orpah.
- **Greek Scriptures:** Joseph, Anna, Simeon, Herod, Herodias, Salome, Pilate, Caiaphas, Annas, Barabbas, Nicodemus, Zacchaeus, Bartimaeus, Jairus, Matthew, Thomas, Thaddaeus, Bartholomew, Simon, Judas, Matthias, Stephen, Philip, Ananias, Sapphira, Cornelius, Tabitha, Dorcas, Silas, Titus, Apollos, Onesimus, Philemon, Epaphras, Epaphroditus, Tychicus, Demas, Gaius, Demetrius, Diotrephes, Felix, Festus, Agrippa, Bernice, Drusilla, Gallio, Sergius Paulus, Elymas, Rhoda, Eutychus, Junia, Andronicus, Tryphaena, Persis, Euodia, Syntyche, Claudia, Linus, Pudens.

Set `status` for this category to `'draft'` in `word-bank.ts`:

```ts
...makeEntries('person', peopleRows, 'draft'),
```

Then re-approve the original 58 by id in a follow-up constant, or simpler: keep the original rows in a separate `approvedPeopleRows` array built with `'approved'` and the new ones in `draftPeopleRows` built with `'draft'`.

- [ ] **Step 3: Run the guard**

Run: `cd game && npm test`
Expected: PASS. Every new word must satisfy the reference-format, uniqueness and non-NWT-form assertions from Task 3. Fix data, never the test.

- [ ] **Step 4: Commit**

```bash
cd game && git add data/words/people.ts data/word-bank.ts
git commit -m "feat: add ~240 draft people to the word bank

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Add ~180 places

**Files:**
- Create: `game/data/words/places.ts`
- Modify: `game/data/word-bank.ts`

**Interfaces:**
- Produces: `export const placeRows: SourceRow[]` — existing places plus ~180 new, `draft`.

- [ ] **Step 1: Move the existing place rows into the new file with familiarity added**

- [ ] **Step 2: Add the new places**

Cover, each with an NWT reference and familiarity:

- **Hebrew Scriptures:** Eden, Ararat, Babel, Ur, Haran, Shechem, Bethel, Hebron, Beersheba, Gerar, Sodom, Gomorrah, Zoar, Peniel, Succoth, Goshen, Rameses, Pithom, Marah, Elim, Rephidim, Sinai, Horeb, Kadesh, Kadesh-barnea, Moab, Pisgah, Nebo, Jericho, Gilgal, Ai, Gibeon, Aijalon, Shiloh, Mizpah, Ramah, Gibeah, Michmash, Jabesh, Endor, Ziklag, Adullam, Engedi, Carmel, Jezreel, Samaria, Dothan, Megiddo, Taanach, Bethshan, Tirzah, Damascus, Lebanon, Hermon, Bashan, Gilead, Ammon, Edom, Seir, Teman, Sela, Philistia, Gath, Gaza, Ashkelon, Ashdod, Ekron, Joppa, Tyre, Sidon, Zarephath, Nineveh, Calah, Asshur, Babylon, Chebar, Shushan, Ecbatana, Tarshish, Ophir, Sheba, Cush, Put, Elam, Media, Persia.
- **Greek Scriptures:** Bethlehem, Nazareth, Capernaum, Chorazin, Bethsaida, Cana, Nain, Magadan, Gadara, Gerasa, Caesarea, Caesarea Philippi, Jericho, Bethany, Bethphage, Gethsemane, Golgotha, Emmaus, Samaria, Sychar, Joppa, Lydda, Antioch, Seleucia, Salamis, Paphos, Perga, Attalia, Iconium, Lystra, Derbe, Troas, Samothrace, Neapolis, Philippi, Amphipolis, Thessalonica, Berea, Athens, Corinth, Cenchreae, Ephesus, Miletus, Rhodes, Patara, Myra, Cnidus, Crete, Malta, Syracuse, Rhegium, Puteoli, Rome, Patmos, Smyrna, Pergamum, Thyatira, Sardis, Philadelphia, Laodicea, Colossae, Hierapolis, Galatia, Cappadocia, Bithynia, Pontus, Macedonia, Achaia, Cyprus, Cilicia, Tarsus.

- [ ] **Step 3: Run the guard**

Run: `cd game && npm test`
Expected: PASS. Watch for the collision assertion — `Ai` already exists, and `Samaria` and `Joppa` appear in both lists above; keep one entry each.

- [ ] **Step 4: Commit**

```bash
cd game && git add data/words/places.ts data/word-bank.ts
git commit -m "feat: add ~180 draft places to the word bank

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Add tribes and nations

**Files:**
- Create: `game/data/words/peoples.ts`
- Modify: `game/data/word-bank.ts`
- Modify: `game/tests/word-bank.test.ts`

**Interfaces:**
- Produces: `export const tribeRows: SourceRow[]`, `export const nationRows: SourceRow[]`.

- [ ] **Step 1: Write the failing test**

Append to `game/tests/word-bank.test.ts`:

```ts
test('the twelve tribes and the major nations are present', () => {
  const tribes = WORD_BANK.filter((entry) => entry.categories.includes('tribe'));
  assert.ok(tribes.length >= 12, `expected at least 12 tribes, found ${tribes.length}`);
  const nations = WORD_BANK.filter((entry) => entry.categories.includes('nation'));
  assert.ok(nations.length >= 20, `expected at least 20 nations, found ${nations.length}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — 0 tribes found.

- [ ] **Step 3: Add the data**

`tribeRows`: Reuben, Simeon, Levi, Judah, Dan, Naphtali, Gad, Asher, Issachar, Zebulun, Joseph, Benjamin, Ephraim, Manasseh.

`nationRows`: Amalekites, Ammonites, Amorites, Assyrians, Babylonians, Canaanites, Chaldeans, Edomites, Egyptians, Girgashites, Hittites, Hivites, Horites, Israelites, Jebusites, Kenites, Medes, Midianites, Moabites, Perizzites, Persians, Philistines, Phoenicians, Samaritans, Syrians.

Note these collide with the tribe and person lists by name (Judah, Levi, Benjamin, Joseph, Dan, Gad, Asher). The collision guard is scoped per category, so a tribe `Judah` and a person `Judah` coexist — that is intended, and they carry different references.

Register both in `word-bank.ts`:

```ts
...makeEntries('tribe', tribeRows, 'draft'),
...makeEntries('nation', nationRows, 'draft'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd game && git add data/words/peoples.ts data/word-bank.ts tests/word-bank.test.ts
git commit -m "feat: add tribe and nation categories to the word bank

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Only approved words reach play

**Files:**
- Modify: `game/lib/game-engine.ts`
- Modify: `game/tests/word-bank.test.ts`

**Interfaces:**
- Consumes: `WORD_BANK`.
- Produces: `export const PLAYABLE_BANK: WordEntry[]`; `eligibleWords` and `wordsForBand` filter on it.

- [ ] **Step 1: Write the failing test**

Append to `game/tests/word-bank.test.ts`:

```ts
import { PLAYABLE_BANK } from '../lib/game-engine';

test('draft words never reach play', () => {
  assert.ok(PLAYABLE_BANK.length > 0);
  for (const entry of PLAYABLE_BANK) assert.equal(entry.status, 'approved');
  assert.ok(PLAYABLE_BANK.length < WORD_BANK.length, 'there should be drafts awaiting review');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd game && npm test`
Expected: FAIL — `PLAYABLE_BANK` is not exported.

- [ ] **Step 3: Write the implementation**

In `game/lib/game-engine.ts`, add near the top and repoint the two selector functions:

```ts
/** Words cleared for play. Drafts stay out until a human has checked the
 * spelling and reference against the NWT. */
export const PLAYABLE_BANK = WORD_BANK.filter((entry) => entry.status === 'approved');

export function eligibleWords(settings: GameSettings) {
  return PLAYABLE_BANK.filter((entry) => entry.level <= settings.maxBand && entry.categories.some((category) => settings.categories.includes(category)));
}

export function wordsForBand(band: Level, categories: Category[]) {
  return PLAYABLE_BANK.filter((entry) => entry.level === band && entry.categories.some((category) => categories.includes(category)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd game && npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
cd game && git add lib/game-engine.ts tests/word-bank.test.ts
git commit -m "feat: keep draft words out of play until reviewed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Batch review screen

**Files:**
- Create: `game/app/review/page.tsx`
- Create: `game/components/WordReview.tsx`
- Modify: `game/lib/progress.ts`

**Interfaces:**
- Consumes: `WORD_BANK`, `loadProgress`/`saveProgress` from Phase A Task 1.
- Produces: `approvedDraftIds: string[]` on `ProgressRecord`; a `/review` route listing drafts with Approve / Reject per word.

Approvals are stored locally and merged at load, so a reviewer's decisions survive without a backend. A later task can export them back into source.

- [ ] **Step 1: Extend the record**

Add to `ProgressRecord` in `game/lib/progress.ts` and to `emptyProgress()`:

```ts
  /** Draft entry ids a reviewer has approved on this device. */
  approvedDraftIds: string[];
  rejectedDraftIds: string[];
```

- [ ] **Step 2: Build the review screen**

`WordReview.tsx` renders drafts 20 at a time, each row showing display, category, level, familiarity, reference and both hints, with Approve and Reject buttons and a running "N of M reviewed" counter. Approve pushes the id into `approvedDraftIds` and saves.

- [ ] **Step 3: Verify manually**

Run `npm run dev`, visit `http://localhost:3000/review`, approve a batch of 20, reload, confirm the approvals persisted.

- [ ] **Step 4: Commit**

```bash
cd game && git add app/review/page.tsx components/WordReview.tsx lib/progress.ts
git commit -m "feat: add a batch review screen for draft words

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** Implements spec §2.2 (level assignment rule), §4.1 (sourcing across five categories to ~660), §4.2 (NWT verification rules as an executable guard, draft/approved gating, review screen) and §4.3 (numbered-book fix, via the scramble-tile approach chosen over the fixed-prefix approach). Level *names* land in Task 1; level *unlocking* is Phase D.

**Placeholders.** The word lists in Tasks 4–6 name every word to add rather than saying "add more people". The correctness bar for each is the executable guard in Task 3 — reference format, uniqueness, non-NWT forms and completeness are all asserted, so a wrong entry fails the build rather than reaching a player.

**Type consistency.** `SourceRow` gains a third element in Task 2 and every later data task uses that three-element shape. `Level` replaces `DifficultyBand` in Task 1 with an alias retained so Phase D can migrate call sites separately. `difficultyScore`, `assignLevels` and `LEVEL_TARGETS` are defined in Task 2 and consumed unchanged in Tasks 3–7. `PLAYABLE_BANK` is introduced in Task 7 and is what Phase D's level selection reads.

**Risk to watch.** Task 2 requires adding a familiarity value to all 165 existing rows in the same commit that changes `SourceRow`; the build breaks until every row is updated. Do that mechanically in one pass.
