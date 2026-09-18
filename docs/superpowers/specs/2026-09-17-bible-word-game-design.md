# Bible Word Game — Design Extension: Categories, Match Variety, and Content Scale

Status: approved for implementation on 2026-09-17. The first release locks four
difficulty labels: Starter, Familiar, Challenge, and Deep Cut.

This document extends `bible-word-game-brief.md` (the original working brief).
It does not re-litigate anything settled there — tap-to-place input, the team
mechanic, hint system, hotseat-first, single-lightweight-app philosophy, and
the "don't re-litigate" list in the brief's section 3 all still stand. This
doc covers three things the brief left open or under-scoped:

1. Letting players choose a category (Books / People / Places) per match,
   including blending more than one.
2. Making every match meaningfully different from every other, even across
   thousands of plays.
3. Growing the word bank far beyond the brief's ~150-250 word starting pool,
   using English New World Translation (NWT) spellings and Scripture
   references without copying or bulk-extracting JW.org content.

It also settles one infrastructure question (database choice for future
persistence/multiplayer) and raises the visual design bar explicitly.

---

## 1. Goals

- Players choose which category (or blend of categories) to play each
  match: Books, People, Places.
- No two matches should play out the same way — not the same words, not in
  the same order, not scrambled the same way, not the same difficulty shape,
  not the same team/turn order. The app remembers and rejects the last 1,000
  generated match and opening signatures on that browser installation.
- The word bank is large and grows over time, with every player-facing answer
  manually verified against the English NWT. It is built in priority order:
  66 books → places → people/names → general
  vocabulary. The scale target ("over 1M") is delivered by how the
  randomization engine combines a real, honest word list — not by storing a
  literal million records.
- The game looks and feels like a modern, polished casual word game (the bar
  set by things like Wordle or NYT Games, with Duolingo-style warmth), and
  works cleanly on both phone and laptop screens.

## 2. Non-goals (for this pass)

- No paid service is required. The first release uses free hosting/runtime
  allowances and a provider-supplied web address; a custom domain, app-store
  distribution, paid assets, and paid persistence are optional later choices.
- The deployed free service must not depend on the owner signing in every week
  or manually waking an inactivity-paused project.
- Persistent saved campaigns remain out of scope. Private cross-device rooms
  are included in the first release alongside the offline-capable local modes.
- No change to core mechanics already decided: tap-to-place input, hint
  system, and team scoring. The shared-device claim-and-build interaction is
  defined in section 5.
- Four difficulty bands are used: Starter, Familiar, Challenge, and Deep Cut.

## 3. Architecture

No server for the MVP. A static app plus a data file it loads, and an
offline script for growing that data file — keeping the brief's "no build
step to play" principle while letting content grow independently of code.

```
/bible-word-game/
  index.html          — shell, styles, screens (setup, play, results)
  engine.js           — game logic: match setup, randomization, scoring, input handling
  data/
    words.json         — the word bank (generated, not hand-typed inline)
  tools/
    build-wordbank.js  — offline script: takes raw sourced word lists per
                          category, validates them (no dupes, no words too
                          short to scramble meaningfully, band assignment),
                          and writes data/words.json. Run by the content
                          owner when adding words; never runs for players.
```

`engine.js` fetches `words.json` once when the app loads. Adding 500 more
entries later means re-running the build script and shipping a new
`words.json` — no code change.

## 4. Content pipeline & data model

Each word bank entry has a stable identity, the exact player-facing spelling,
one or more categories, original hints, NWT Scripture references, and a
review state:

```json
{
  "id": "book.habakkuk",
  "answer": "HABAKKUK",
  "display": "Habakkuk",
  "playable": "HABAKKUK",
  "categories": ["book"],
  "band": 3,
  "hints": ["A prophetic book", "Its name begins with H"],
  "references": ["Habakkuk 1:1"],
  "verification": "English NWT manual review",
  "status": "approved"
}
```

- `categories`: one or more of `"book" | "person" | "place"` (with room to
  add `"vocabulary"` later). Multiple categories preserve valid overlaps
  instead of incorrectly deleting them as duplicates.
- `band`: difficulty band (see brief section 5; count TBD during
  implementation, brief suggests 3-5).
- `hints`: original, short text usable by the progressive hint system.
- `references`: NWT locations that establish that the answer is Biblical;
  the app stores the reference, not copied verse text.
- `answer` is the normalized answer used for checking; `display` preserves
  presentation; `playable` contains the letters that are scrambled. For a
  numbered book such as `1 Samuel`, the `1` remains fixed and `SAMUEL` is the
  playable portion. Punctuation, spaces, and fixed numeric prefixes are never
  shuffled as letter tiles.

**NWT-only naming standard**: the English NWT is the authority for every
answer's spelling and Bible reference. The game does not use KJV, WEB, or
another translation to choose player-facing answers. Content is manually
curated and verified by reading the NWT. JW.org may be consulted or linked as
an official reference, but the pipeline does not scrape, download, or copy
site text, definitions, images, or other assets. Hints are written originally.
Bulk extraction from the NWT is prohibited unless written permission is
obtained; this keeps the game within JW.org's published reuse restrictions
while preserving the NWT vocabulary players expect.

**Build order** (matches what was decided in this brainstorm):
1. 66 book names (already scoped in the brief).
2. Bible places.
3. Bible people/names.
4. Manually curated, NWT-verified general vocabulary (feeds the later tier in
   section 8, not the core bands).

Each category is authored as its own raw list and merged by
`build-wordbank.js`, which is also the natural place to catch duplicate IDs,
invalid category combinations, answers with too few distinct permutations,
and missing hints, references, verification, or approval state. A duplicate
spelling in different categories is valid and is merged into one entry with
multiple categories rather than discarded.

## 5. Match setup, scoring, and category blending

Terminology is fixed so the UI and implementation use the same words:

- A **puzzle** is one scrambled Bible answer.
- A **match** is the full user-selected set of puzzles that produces a winner
  and a results screen.

At match start (solo or group), the player(s) select one **or more**
categories (Books / People / Places) to blend. The match pool is the union of
the selected categories, drawn according to the difficulty bands defined in
the brief (section 5), using the `band` field from the data model above.
Bands are curated so that "Band 2" feels similarly hard whether it is a book,
a person, or a place. When categories are blended, the generator uses balanced
quotas so every selected category appears; random variation may change the
order and small remainder, but may not silently turn a blended match into an
almost single-category match.

Players choose the match length. The setup screen offers quick choices of 10
(default) or 15 puzzles and a Custom option. Custom accepts a positive whole
number no larger than the eligible no-repeat pool for the chosen categories
and difficulty. The selected length is fixed for that match and is never
randomized.

### Scoring and winner

- Each puzzle starts with a 5-point value. A correct answer adds the puzzle's
  current value to the solving player or team.
- An incorrect checked answer removes 1 point from that player or team, with
  the match total never falling below zero.
- Each hint used reduces the points available for that puzzle by 1, to a
  minimum correct-answer award of 1 point.
- There is no per-puzzle timer in the MVP. The point and control penalties
  provide tension without making family play feel rushed. A separate timed
  mode can be tested later.
- In competitive play, the highest total after the selected number of puzzles
  wins. A tie triggers sudden-death puzzles for the tied teams; the first tied
  team to solve one correctly wins, while a wrong claim releases control.
- Solo results congratulate the player and show the final score. Cooperative
  results congratulate the whole group and compare its score with the maximum
  possible score. Competitive results congratulate the winning player or
  team.

The results screen offers **Play Again** (same settings, new seed), **Change
Set** (return to category, difficulty, and length choices), and **Home**.

### Shared-device teams

For hotseat team play, each team has a large Claim button and chooses a
rotating builder. Any teammate may recognize or discuss the answer, but the
builder operates the shared device after that team claims the puzzle. The
first claim temporarily gives that team control of the letter tiles. A
correct check locks the puzzle and awards the team; an incorrect check costs
1 point and releases the puzzle for another team to claim. The team may also
use a Release button without submitting. No claim timer is required for the
friendly MVP. Randomized team order is used only where a tie or simultaneous
claim needs resolution.

## 6. Randomization engine

This is the mechanism that makes "never the same, even after 1,000 matches"
true on one browser installation while its local history remains intact.
Every match generates a fresh random seed via `crypto.getRandomValues`, then
uses a deterministic seeded generator so the match can be reproduced from its
seed for debugging or future online synchronization. Separate derived random
streams drive:

- **Word selection & order** — which words are drawn from the blended pool
  for this match, and the order they are presented in.
- **Scramble pattern per word** — the letter arrangement shown is computed
  fresh each time a word is presented (a Fisher-Yates shuffle over the
  word's letters, re-rolled if it accidentally produces the original word or
  another real word already in the bank), never a single stored scramble
  per word.
- **Category mix & difficulty curve shape** — when multiple categories are
  blended, the allocation stays balanced while the remainder, presentation
  order, and difficulty ramp (steep vs. gradual, how many words per band)
  vary from match to match.
- **Team/turn order** — which team is considered first for simultaneous-claim
  resolution and sudden death. The user-selected puzzle count is not random.

Before a match begins, the app hashes both the complete generated match recipe
and its opening signature (the first three answer IDs and scrambles, or every
puzzle in a shorter match). It stores the last 1,000 hashes of each in
`localStorage`. If either hash is already present, the app generates another
seed. This guarantees different matches and meaningfully different openings
within that installation's retained history. Clearing browser storage, using
another browser/device, or exhausting the valid combination space resets or
limits that guarantee; the UI and marketing must not claim global uniqueness.

At the pool sizes reached even in the near term (hundreds to low thousands
of words across categories), the combination of these four independent
sources of variation already produces well over a million distinct possible
matches. No puzzle content needs to be pre-generated or stored to make that
true — it falls out of combinatorics applied to an honestly-sized word list.

**Testing**: simulation tests run thousands of matches and check selection,
scrambles, category balance, difficulty curves, and reproducibility from a
seed. Unit tests deliberately force hash collisions and verify that the
history rejection path generates a new match. The build script also rejects
answers that cannot produce enough distinct, non-answer scrambles and the
runtime scramble loop has a bounded attempt count plus a safe fallback.

## 7. Future persistence and online rooms (decided now, built later)

No external database is required for the $0 initial release. Local progress
stays in browser storage, and live room state belongs to the authoritative
room coordinator described below. **Turso** (hosted SQLite, built on libSQL)
remains only a possible later choice for accounts, cross-device campaign
progress, or optional cross-room history. Pricing, browser authorization, and
security must be rechecked before adding it; no long-lived write credential
may be shipped in the public frontend.

This keeps the first release dependent on one free hosting/runtime provider,
avoids a database service that the core game does not need, and ensures the
online feature can fail independently without breaking Solo or Play Together.

### Online room-code experience

The complete mode, lobby, match, reconnect, and failure-state plan lives in
`2026-09-17-bible-word-game-play-modes-and-rooms.md`. The summary below is the
minimum contract carried by this design.

Online group play follows the familiar private-room pattern:

1. A host selects **Create Room**.
2. The room service creates a random six-character code using unambiguous
   uppercase letters and digits (excluding characters such as `O/0` and
   `I/1`) and rejects collisions with active rooms.
3. Other players select **Join Room**, enter the code and a display name,
   and choose or are assigned a team.
4. The host chooses categories, difficulty, and puzzle count, then starts the
   match when everyone is present.
5. The server owns the canonical seed, puzzle index, claims, answers, scores,
   and rematch state so every device stays in the same room and match.

The code is a join convenience, not a password. Each joined device also gets
a temporary player token so another player cannot impersonate it merely by
knowing the room code. The host may remove a player or close the room. A room
survives **Play Again** but expires after the room closes or two hours without
activity.

A database and random room code do not themselves provide live synchronization.
The current recommendation is one Cloudflare Durable Object with hibernatable
WebSockets per active room. Its per-room storage holds live roster, match, and
reconnect state. Turso is reserved for optional cross-room data such as saved
campaigns, accounts, or long-term history; the room protocol remains vendor-
neutral so the coordinator can be replaced without changing game rules.

## 8. Bulk vocabulary tier (explicitly later, not this build)

Once the randomization engine above exists, a second, larger vocabulary tier
can be added without redesigning the game. It remains NWT-only: each playable
word must be manually selected, verified against the English NWT, supplied
with an NWT reference, and approved like every core entry. It may not be
created by scraping or bulk-extracting NWT/JW.org text. If manual curation
cannot reach the desired scale, expansion pauses until written permission or
an appropriately licensed NWT-compatible dataset is available. The million-
plus scale continues to describe generated puzzle configurations, not copied
or stored NWT words.

## 9. Visual design bar

The game must read as a modern, polished casual game, not a bare
prototype — benchmarked against contemporary word games (Wordle/NYT
Games-level visual polish, Duolingo-style warmth) — and must work cleanly
at both phone width and laptop width (responsive layout, not a fixed
desktop canvas that gets cramped on a phone). The brief's existing "juice"
list (tile animations, shuffle button, hint reveal, solve chime, streak
counter) stands as the functional requirement; this section raises the
execution bar on how those are designed and implemented. The brief's
constraint that there's no image-generation tool available still holds —
the visual quality comes from typography, color, motion, and layout, not
custom illustrated art. Concrete visual direction (palette, type, motion
style) is worked out during implementation, not in this spec.

## 10. Resilience

If `data/words.json` fails to load (network issue, bad path), the app falls
back to a small embedded emergency word list rather than showing a blank or
broken screen. The emergency entries use the same reviewed NWT-only schema.
During local development, the project is served by a lightweight local web
server because browser `fetch()` behavior is not reliable when `index.html`
is opened directly with a `file://` URL.

## 11. Remaining open item

- Exact number and labels of difficulty bands (brief suggests 3-5).

Wrong-answer cost, match length, winner handling, and the MVP timer decision
are settled in section 5.

## 12. Build order (extends brief section 9)

This design slots into the brief's existing build order without replacing
it: item 1 (MVP core loop, one band, solo, one file) still comes first.
Category blending, the randomization engine, and the growing word bank
described here are the natural next steps once the core loop is proven fun,
and should be sequenced in an implementation plan rather than built all at
once.
