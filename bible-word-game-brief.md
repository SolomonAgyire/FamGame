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
- A **team mechanic** (the strongest idea from the brainstorm): anyone on a team may attempt the word, points go to the team, everyone can try. This protects weaker/newer players from being solo-spotlighted, which fits "family and loved ones" far better than individual competition.  
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
3. On a complete word: check against the answer. Correct → score \+ happy feedback \+ next word. Wrong → shake/reset feedback, allow retry (or cost, TBD — see open questions).  
4. Optional hint spends something (a hint counter, or points) to reveal the first letter or category.  
5. Session ends after a fixed number of rounds (or a target score); highest score wins.

---

## 5\. Modes and levels

**Recommended single structure (build this first):** one **session \= a run of rounds with difficulty rising** round to round (easy words first, hard words last).

- **Solo** is just a one-player session.  
- **Group/teams** is the same session; anyone on a team may solve, first correct locks it, points go to the team.

This reconciles the "individual climbs levels" vs "group plays one level, difficulty spread across" idea into one build instead of two.

**Difficulty bands:** use **3–5 bands, not 10\.** The realistic word pool (66 books \+ famous names ≈ 150–250 words) cannot fill 10 distinct, meaningfully different levels; regulars will exhaust and memorize them. Suggested bands:

- Band 1: short, famous book names (John, Ruth, Mark, Acts).  
- Band 2: longer familiar names (Genesis, Matthew, Abraham, David).  
- Band 3: less common (Habakkuk, Nehemiah, Colossians).  
- Band 4 (optional): obscure/long (Zephaniah, Melchizedek) — hints strongly recommended here.

**Persistent campaign (unlock level 2 by clearing level 1\) is LATER scope, not MVP.** It needs saved progress (localStorage or a backend), which is extra work. Add it after the core loop is fun.

*Open: exact number of bands, rounds per session, and whether group difficulty is (a) same word for all teams each round, or (b) each team/player dealt a word matched to chosen skill.*

---

## 6\. Content

- **Word pool:** the 66 book names are the easy starter set. Expand with well-known Bible people and places to grow the pool and the difficulty range.  
- **Sources:** JW.org and the Watchtower Online Library to confirm spellings and pick words.  
- **Vetting:** book/person/place *names* are facts and need **no doctrinal vetting** — this is the word game's big advantage over the trivia board. Do NOT paste article text, published quizzes, or scripture passages (translation text is copyrighted); use the sources only to choose and spell words.  
- **Data shape (starting point):**  
  { word: "HABAKKUK", category: "book", band: 3 }  
- **Exhaustion risk:** finite pool means memorization. Mitigate with a large pool and per-session no-repeat draws. Accept that this is the word game's core long-term weakness.

---

## 7\. Technical decisions

- **Build from scratch**, starting from the earlier prototype's setup screen, player/team selection, scoring, modal, and tap-to-place interaction. Strip the board; keep those parts.  
- **Single self-contained HTML file to start** (no build step). Open in a browser, or use the VS Code Live Server extension for auto-reload.  
- **"Feels like a real one" comes from juice \+ a big word bank, not architecture:** satisfying tile animations, a shuffle button, a hint reveal, a solve chime, a streak counter.  
- **Hotseat first (one shared screen).** Prove it's fun before any networking.  
- **Online (each player on own device) is a separate, harder project** needing a server for shared state — Supabase Realtime. Not MVP.  
- **No image-generation tool available in the current setup**, so emotion/feedback is emoji \+ motion \+ color for now. Real illustrated art is a separate asset step; use original art, not copyrighted characters.

---

## 8\. Known risks and open decisions

- **Word exhaustion / memorization** — finite pool. Biggest long-term risk. Grow the pool.  
- **Spelling frustration at the hard end** — obscure names are unsolvable without hints. Hint system is required, not optional.  
- **Luck vs skill** — a word game tests spelling/pattern, not Bible knowledge. This is a deliberate trade you accepted (puzzle, not quiz), but know that it drifts from the original "get to know scripture" goal.  
- **In-room vs remote is still unresolved** and determines whether you ever need the networked build. Decide before starting multiplayer.  
- **Private-per-player words** only matter (and only work) if each player has their own device; on one shared screen it's impossible, and it kills the "everyone helps" team energy. Probably don't want it for a warm family game.  
- **Number of bands / rounds / group difficulty rule** — see section 5\.  
- **Wrong-answer cost** — free retry, limited attempts, or a timer? Affects difficulty and tension.

---

## 9\. Suggested build order

1. **MVP:** one difficulty band, tap-to-place, check answer, next word, score, solo only, one HTML file. Get the core loop *fun* first.  
2. Add difficulty bands and rising-difficulty rounds within a session.  
3. Add teams (anyone attempts, points to team) — the mechanic worth protecting.  
4. Add juice: animations, shuffle, hint reveal, solve chime, streak counter.  
5. Add persistence for a solo campaign (saved progress) — only if wanted.  
6. Only after it's proven fun hotseat: online multiplayer with Supabase (the hard part).

Do the unglamorous thing first: a small, real word bank and a core loop that's actually satisfying to solve. Everything else is polish on that.

&nbsp;