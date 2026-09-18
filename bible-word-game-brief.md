# Bible Word Game — working brief

A springboard for building in VS Code. This is not a finished spec. It captures what we decided across the brainstorm, what we deliberately rejected, the open questions still to settle, and a sane build order. Argue with it as you go.

---

## 1\. Problem statement

Build an original, visually appealing game for playing with family, friends, and fellow believers, that works for as few as 2 people and scales to teams, is warm rather than cutthroat, and carries a Bible/JW theme. It must be genuinely fun and want to be replayed, not "themed chat" with no stakes.

The chosen form is a **Bible word-unscramble puzzle**: show the scrambled letters of a Bible word (book, person, place), rearrange them into the correct word. It is a puzzle you either solve or don't, not a knowledge quiz.

---

## 2\. What we're building (the decision)

A single-word unscramble game with:

- A **word bank** of Bible words, tagged by difficulty band.  
- **Tap-to-place input**: tap letters to drop them into slots, tap a slot to send a letter back. (Reuse the interaction already written for the order-the-Gospels challenge in the earlier prototype. Drag-and-drop is fiddly on phones; tap-to-place is more reliable.)  
- A **team mechanic** (the strongest idea from the brainstorm): anyone on a team may recognize and discuss the word; on a shared device, the first team to claim it gives control to its rotating builder. Points go to the team. This protects weaker/newer players from being solo-spotlighted, which fits "family and loved ones" far better than individual competition.
- A **hint system** for harder words (reveal first letter, show category), without which the obscure names become a frustrating wall rather than a puzzle.

---

## 3\. What we rejected, and why (don't re-litigate these)

- **AI-chat / "talk to a character" games** — not games; no stakes, no replay.  
- **Uno-style port** — porting a known card game is low-originality and rules-heavy; not what you wanted.  
- **Party matching / prediction / wavelength games** — either don't fit the audience or don't work at 2 players.  
- **The get-to-know-you question set** — a good fellowship *tool*, but not a game (no winner, no stakes). Keep it as a separate calm activity if you want it, not blended in.  
- **The Bible trivia board (Pilgrim Path prototype)** — a real game, but its question bank is a large, hand-written, hand-vetted dependency you have not built. Deprioritized in favour of the word game, which is cheaper to finish. Prototype still exists if you return to it.  
- **Wordle-style fixed-length deduction grid** — wrong mechanic for Bible names: they're proper nouns people can't spell, wildly variable length, and undeducible if you don't already know them. Unscramble/anagram is the right form.  
- **Forking a GitHub repo** — the game is \~200 lines; forking makes you inherit an English word list, mismatched styling, no team concept, and someone else's bugs. Most word-game repos are Wordle clones, which drag you back to the rejected mechanic. Also check LICENSE: "no license" \= all rights reserved. Build from scratch; your own earlier prototype is the thing you "fork."

---

## 4\. Core loop

1. A scrambled word appears (letters shown as tappable tiles), with its difficulty and optionally its category.  
2. Player(s) tap letters into slots to form the word.  
3. On a complete word: check against the answer. Correct → 5 points \+ happy feedback \+ next word. Wrong → lose 1 point (never below zero), shake/reset feedback, and allow retry; in team play, a wrong claim also releases control.
4. Each hint reduces the points available for that puzzle by 1, to a minimum correct-answer award of 1 point.
5. The user chooses the match length: 10 puzzles by default, 15, or a custom count no larger than the eligible no-repeat pool. Highest score after the final puzzle wins; ties use sudden death.

---

## 5\. Modes and levels

**Recommended single structure (build this first):** one **match \= a run of puzzles with difficulty rising** puzzle to puzzle (easy words first, hard words last).

- **Solo** is just a one-player match.
- **Group/teams** is the same match; teams claim the shared puzzle, a rotating builder operates the device, and the first correct answer locks it and scores for the team.

This reconciles the "individual climbs levels" vs "group plays one level, difficulty spread across" idea into one build instead of two.

**Difficulty bands:** use **3–5 bands, not 10\.** The realistic word pool (66 books \+ famous names ≈ 150–250 words) cannot fill 10 distinct, meaningfully different levels; regulars will exhaust and memorize them. Suggested bands:

- Band 1: short, famous book names (John, Ruth, Mark, Acts).  
- Band 2: longer familiar names (Genesis, Matthew, Abraham, David).  
- Band 3: less common (Habakkuk, Nehemiah, Colossians).  
- Band 4 (optional): obscure/long (Zephaniah, Melchizedek) — hints strongly recommended here.

**Persistent campaign (unlock level 2 by clearing level 1\) is LATER scope, not MVP.** It needs saved progress (localStorage or a backend), which is extra work. Add it after the core loop is fun.

*Open: exact number and labels of difficulty bands. All teams see the same puzzle; match length is selected by the user.*

---

## 6\. Content

- **Word pool:** the 66 book names are the easy starter set. Expand with well-known Bible people and places to grow the pool and the difficulty range.  
- **NWT-only naming standard:** every player-facing answer and Scripture reference is manually verified against the English New World Translation. Do not use KJV, WEB, or another translation to select displayed spellings. JW.org may be consulted or linked as an official reference, but do not scrape, bulk-extract, or copy its text, definitions, images, or assets.
- **Vetting:** book/person/place *names* are facts and need **no doctrinal vetting** — this is the word game's big advantage over the trivia board. Store names and NWT Scripture references, not quoted passages. Write all hints originally. General vocabulary must also be manually NWT-verified unless written permission for bulk use is obtained.
- **Data shape:** each approved entry has a stable ID, answer/display spelling, playable letters, one or more categories, difficulty band, original hints, NWT references, verification note, and review status. See the extension spec for the canonical schema.
- **Exhaustion risk:** finite pool means memorization. Mitigate with a large pool and per-match no-repeat draws. Accept that this is the word game's core long-term weakness.

---

## 7\. Technical decisions

- **The MVP and first online release must cost $0 to operate at intended family-and-friends usage.** Use free hosting/runtime allowances and a provider-supplied address. Do not require a custom domain, paid database, paid asset, analytics subscription, or app-store account. Keep paid upgrades and automatic overages disabled.
- **Build from scratch**, starting from the earlier prototype's setup screen, player/team selection, scoring, modal, and tap-to-place interaction. Strip the board; keep those parts.  
- **Single self-contained HTML file to start** (no build step). Open in a browser, or use the VS Code Live Server extension for auto-reload.  
- **"Feels like a real one" comes from juice \+ a big word bank, not architecture:** satisfying tile animations, a shuffle button, a hint reveal, a solve chime, a streak counter.  
- **Hotseat first (one shared screen).** Prove it's fun before any networking.  
- **Online (each player on their own device) is a separate, harder project** needing an authoritative room service and live sync. The planned experience uses a random six-character private room code and one stateful coordinator per live room; Turso is reserved for optional long-term user or campaign data. Not MVP.
- **Custom illustrated art is outside the MVP.** Emotion and feedback come from typography, emoji, motion, sound, and color first. Any later artwork must be original or appropriately licensed.

---

## 8\. Known risks and open decisions

- **Word exhaustion / memorization** — finite pool. Biggest long-term risk. Grow the pool.  
- **Spelling frustration at the hard end** — obscure names are unsolvable without hints. Hint system is required, not optional.  
- **Luck vs skill** — a word game tests spelling/pattern, not Bible knowledge. This is a deliberate trade you accepted (puzzle, not quiz), but know that it drifts from the original "get to know scripture" goal.  
- **In-room comes first; remote comes later.** The MVP is shared-device hotseat. Future remote play uses host-created private rooms with random join codes and server-authoritative match state.
- **Private-per-player words** only matter (and only work) if each player has their own device; on one shared screen it's impossible, and it kills the "everyone helps" team energy. Probably don't want it for a warm family game.  
- **Number and labels of difficulty bands** — still to be settled through playtesting.
- **Timer** — no per-puzzle timer in the MVP; scoring and claim penalties provide the tension. A separate timed mode may be tested later.

---

## 9\. Suggested build order

1. **MVP:** one difficulty band, tap-to-place, check answer, next word, score, solo only, one HTML file. Get the core loop *fun* first.  
2. Add difficulty bands and rising difficulty within a match.
3. Add teams (claim button, rotating builder, points to team) — the mechanic worth protecting.
4. Add juice: animations, shuffle, hint reveal, solve chime, streak counter.  
5. Add persistence for a solo campaign (saved progress) — only if wanted.  
6. Only after it's proven fun hotseat: online private rooms with random join codes, an authoritative sync service, and durable storage (the hard part).

Do the unglamorous thing first: a small, real word bank and a core loop that's actually satisfying to solve. Everything else is polish on that.

&nbsp;
