# WordIn — Progression, Retention & Scale Spec

**Date:** 2026-09-24
**Status:** Decisions locked, ready for phased implementation plans
**Supersedes:** difficulty-band decisions in `2026-09-17-bible-word-game-design.md` §5
**Builds on:** `bible-word-game-brief.md` (the working brief; its constraints still hold)

---

## 0. Why this exists

A full playtest on 2026-09-24 drove both solo and Time Attack to completion. Findings:

| Finding | Evidence |
|---|---|
| Difficulty does not rise within a match | `game-engine.ts:82` shuffles after selection. A "Deep Cut" match opened on `Ai` (2 letters) and ended on `Mark` (4 letters). |
| Highest band is effectively unreachable | Time Attack requires clearing all 151 lower words without missing 3 in a row before band 4 appears. |
| Highest band is unplayable on arrival | `Deuteronomy` (11 letters) with a flat 14-second timer and no hints available in that mode. |
| Nothing accumulates | Only two keys persist: an anti-repeat list and one Time Attack high score. Solo points are never saved. |
| Flat scoring | Every word is worth 5 points. `Ai` (2 letters) scores the same as `Ecclesiastes` (12). |
| Hint 1 is free information | "This answer is a Bible book" duplicates the on-screen kicker; letter count duplicates the slot count. |
| Numbered books collide | `1 Kings` and `2 Kings` produce an identical `[KINGS]` tile set. Solving one may resolve as the other. |
| Word shape destroyed | 11 slots wrap as 7 + 4, removing the silhouette cue a word game depends on. |
| Advertised feature missing | The home sample card shows "↻ Shuffle"; the play screen only has "↻ Reset". |
| Content exhausts fast | 165 words total. A perfect machine clear consumed the entire game in 186 seconds. |

The retention verdict: the results screen is a dead end. It reports a score with nothing to compare it against, then offers Play again / Change set / Home. Nothing was accumulated, so there is no reason to return.

---

## 1. Global constraints (carried from the brief — these do not change)

- **$0 to operate** at family-and-friends usage. Free tiers only, no custom domain, no paid database, no app-store account, overages disabled.
- **NWT-only naming standard.** Every player-facing answer and Scripture reference must match the English New World Translation. jw.org **may be consulted** as an official reference to confirm a spelling; it must **not** be scraped, bulk-extracted, or copied. No KJV/WEB/other-translation spellings.
- **Names are facts and need no doctrinal vetting.** Store names and references, never quoted passages. All hints written originally.
- **Mobile-first.** Runs on a five-year-old Android phone.
- **No new runtime dependencies** without explicit approval. Current runtime deps: `next`, `react`, `react-dom`, `drizzle-orm`.
- **Custom illustrated art stays out of scope.** Emotion comes from typography, motion, sound and colour.

---

## 2. The nine levels

The four bands (`Starter / Familiar / Challenge / Deep Cut`) are replaced by nine named levels, in this order:

| # | Level name | Target words | Timer | Unlock rule |
|---|---|---|---|---|
| 1 | Studying | 90 | none | open by default |
| 2 | Publisher | 90 | none | clear L1 |
| 3 | Baptized | 85 | none | clear L2 |
| 4 | Serving | 80 | none | clear L3 |
| 5 | Reaching Out | 75 | bonus only | clear L4 |
| 6 | Maturity | 70 | bonus only | clear L5 |
| 7 | Strong Faith | 65 | enforced | clear L6 |
| 8 | New World | 55 | enforced | clear L7 |
| 9 | Eternity | 50 | enforced | clear L8 |

**Total target: 660 words** (4× the current 165).

### 2.1 Locked progression

- Levels render as a vertical path on the home screen. Locked levels show a **padlock** and are not selectable.
- **Clear condition for level N:** solve 20 distinct words at level N with ≥70% accuracy. (Not the whole level — requiring all 90 would repeat the Time Attack grind mistake.)
- Clearing shows a full-screen unlock moment naming the next level.
- Progress persists in `localStorage`. A "restore progress" code is out of scope for now.
- **Solo Journey and Time Attack are gated. Online rooms are not** — the host may pick any level so one person's progress never blocks a group.

### 2.2 Level assignment rule (reproducible, not hand-waved)

Each word gets `difficulty = letters + (familiarity × 2)` where familiarity is 0 (household name) to 4 (obscure). Sort all 660 by difficulty, then cut into the nine buckets at the target sizes above. This is deterministic and re-runnable when the bank grows.

---

## 3. Time pressure, integrated into levels

**Your proposal:** the timer appears around level 5 and tightens as levels climb. **Adopted, with two refinements**, because a flat per-level timer is what made `Deuteronomy` in 14 seconds impossible.

### 3.1 Timer scales with word length, never flat

```
seconds = ceil(base[level] + perLetter[level] × letterCount)
```

| Level | base | perLetter | 5-letter word | 11-letter word |
|---|---|---|---|---|
| 5 Reaching Out | 12 | 3.0 | 27s | 45s |
| 6 Maturity | 10 | 2.6 | 23s | 39s |
| 7 Strong Faith | 8 | 2.2 | 19s | 32s |
| 8 New World | 6 | 1.9 | 16s | 27s |
| 9 Eternity | 5 | 1.6 | 13s | 23s |

Generous on arrival, genuinely tight at Eternity, and always fair relative to word length.

### 3.2 The timer arrives as a reward, then becomes a threat

- **Levels 5–6 — bonus window.** The timer runs but running out costs nothing. Beating it awards a speed bonus. This teaches the mechanic without punishing the player the first time they meet it.
- **Levels 7–9 — enforced.** Running out counts as a miss.

Standalone **Time Attack** remains as a separate arcade mode for pure score runs, but it now starts at the player's highest unlocked level rather than forcing a grind from level 1.

---

## 4. Word bank expansion: 165 → 660

### 4.1 Sourcing

All additions are **proper nouns**, which the brief establishes need no doctrinal vetting:

- **Books** — 66, already complete.
- **People** — expand to ~300: patriarchs, judges, all kings of Israel and Judah, major and minor prophets, the apostles, NT figures, and the many women named in scripture (Jochebed, Zipporah, Deborah, Hannah, Michal, Bathsheba, Huldah, Anna, Dorcas, Junia).
- **Places** — expand to ~220: cities, regions, rivers, mountains (Gethsemane, Golgotha, Capernaum, Beersheba, Megiddo, Shiloh, Ziklag, Patmos, Lystra, Derbe, Iconium, Philippi, Berea, Colossae, Laodicea, Smyrna, Pergamum, Thyatira, Sardis).
- **New category `tribe`** — ~15: Judah, Benjamin, Naphtali, Zebulun, Issachar, Manasseh, Ephraim, Reuben, Simeon, Levi, Dan, Gad, Asher.
- **New category `nation`** — ~40: Moabites, Edomites, Philistines, Assyrians, Babylonians, Amalekites, Hittites, Canaanites.

### 4.2 NWT verification rules (the part that matters)

Every entry carries `status: 'draft' | 'approved'`. **Only `approved` words enter play**, so the game keeps running on today's 165 while the new ones are reviewed. A review screen approves in batches.

These NWT-specific rules are baked into the generation pass and must be checked per word:

- **Greek Scriptures use the Hebrew name forms.** NWT writes *Isaiah* (not Esaias), *Elijah* (not Elias), *Elisha* (not Eliseus), *Hosea* (not Osee), *Jeremiah* (not Jeremias), *Noah* (not Noe), *Korah* (not Core). KJV-style forms are a verification failure.
- **Jehovah** is used where the divine name appears.
- **Revelation**, singular.
- Spellings follow the **2013 revision**.
- **No apocryphal names.**
- Each entry stores at least one NWT chapter:verse reference where the name appears, plus a `verification` note and `reviewedAt`.

### 4.3 The numbered-book fix

`1 Kings` / `2 Kings`, `1 Samuel` / `2 Samuel`, `1–3 John`, `1–2 Corinthians`, `1–2 Timothy`, `1–2 Peter`, `1–2 Thessalonians`, `1–2 Chronicles` all collapse to identical tile sets.

**Fix:** show the numeral as a fixed, non-draggable prefix tile on the board (`[1] K I N G S`). The player still only arranges the base word, but sees which book they are solving, and the reveal is no longer arbitrary.

---

## 5. Persistence and the streak system

Everything below lives in one versioned `localStorage` record with a migration path, not scattered keys.

### 5.1 Streaks

- **Day streak** — consecutive days with ≥1 puzzle solved. Shown prominently on home.
- **Day rolls at 3am local**, not midnight, so late-night play does not lose a streak.
- **Streak freeze** — auto-consumed on a missed day. Earn 1 per 5-day streak, hold a maximum of 2.
- **Streak repair** — within 48h of a break, solve 3 puzzles to restore it.
- **Milestones** at 3, 7, 30, 100 days, each with a real reward (a freeze, a power-up), not only confetti.
- **Perfect-week row** — seven dots on home, filled for days played.

### 5.2 Points that accumulate

- **Lifetime points** — never resets. The anchor the results screen currently lacks.
- **Personal best per level and per mode**, shown next to today's result so the number means something.
- **XP and player level**, separate from the nine content levels.
- **Weekly points**, resetting Monday.
- **Words mastered — `x / 660`.** Turns a finite bank from a liability into a completion goal. This is the single best answer to the brief's "exhaustion risk".
- **Per-word mastery** — solved 3× quickly marks a word mastered; mastered words appear less often (spaced repetition).

### 5.3 Stats page

Solved count, accuracy, average solve time, best streak, current streak, distribution across the nine levels, mastery progress.

---

## 6. Scoring rework

Replaces the flat 5 points.

```
points = (2 + letterCount) × levelMultiplier × comboMultiplier + speedBonus − hintCost
```

- **Length-scaled base** — `Ai` scores 4, `Ecclesiastes` scores 14.
- **Level multiplier** — 1.0 at Studying rising to 3.0 at Eternity, so choosing harder pays.
- **Combo** — 3 correct in a row without a miss gives ×2 on the next.
- **Speed bonus** — levels 5+ only, scaled by remaining time.
- **No-hint bonus** — +2 for a clean solve.
- **Hint cost** — 1 point each, but only once hints are worth paying for (§7).

---

## 7. Hints that are actually worth buying

Current hints restate what is already on screen. Replace with a three-tier ladder:

1. **Reveal a letter in place** — places one correct letter into its slot.
2. **Reveal the category and era** — e.g. "a place in the ministry of Paul".
3. **Reveal the scripture reference** — the player can reason from the citation.

Hint 1 becomes the default offer because it is the one players actually want.

---

## 8. The scripture reveal as the emotional payoff

Every entry already carries an NWT reference, currently rendered as grey text joined by a middle dot. The brief lists as a known risk that the game "drifts from the original get-to-know-scripture goal". Design closes that drift at zero cost:

On a correct solve, the word and its reference land together as one orchestrated moment — the word settling into place, the citation arriving under it. This is the one place to spend visual boldness.

---

## 9. Daily Word

- **One shared puzzle per day**, identical for every player, seeded from the date.
- Its **own streak**, separate from free play.
- **Daily Eternity word** — one hard word a day available to everyone regardless of progression, so the hardest content is never locked behind a 151-word grind.
- **Archive** — play missed days.
- **Shareable result card** — the emoji-grid pattern that spread Wordle. `WordIn #142 · 4/4 · 🟩🟩🟨🟩`. No account, no backend, just clipboard text.

---

## 10. Online rooms at scale

### 10.1 Can it be unlimited? No — and the reason is design, not just infrastructure

Three hard limits:

1. **Game design.** Current rules give the puzzle to the first correct answer. At 30 players that is one winner and 29 losers per puzzle. The mode stops being fun well before the technology strains.
2. **Polling contention.** Every client polls every 1.8s (`GatherWordApp.tsx:447`). At 30 players that is ~17 requests/second per room against D1, with optimistic-concurrency write collisions when many players check at once.
3. **Legibility.** The live score strip is an unsorted flex row. It already overflows at 12.

### 10.2 Decisions

- **Cap: 30 players.** Raised from the current hardcoded 12 at `room-service.ts:110`.
- **Architecture: one Durable Object per room with WebSockets**, replacing D1 polling. This is what the original brief planned, and it removes both the contention and the request volume. Still free tier.
- **Scoring changes so big rooms work:** everyone who solves within the window scores, on a descending curve by finish order, instead of one winner taking all.
- **Live standings view** — a ranked, sorted, scrollable leaderboard during play, replacing the flat strip. Top 3 always pinned, the viewer's own row always visible.
- **Host controls** — kick, pause, skip puzzle, end match.
- **Reconnect handling** — rejoin without losing score.
- **Late join** — enter a match in progress as a spectator, play from the next puzzle.
- **Spectator role** — unlimited spectators on top of the 30 players, so a whole congregation can watch a screen.

### 10.3 Already working, confirmed by the playtest

- Host picks categories, level and puzzle count in the lobby. ✅
- Live running scores are visible during play. ✅ *(but unsorted and overflowing — §10.2 fixes the presentation, not the data)*
- Six-character private room codes, two-hour TTL, no account. ✅

---

## 11. Features not yet mentioned (answering "did you miss some?")

Yes — these were missing from the first pass:

**Comfort and reach**
- **PWA / offline play** — installable to the home screen, playable with no signal. Large for a $0 mobile game.
- **Localization** — the audience is international; the level names and UI should be translatable. Word data stays NWT-English for now.
- **Accessibility** — colourblind-safe states, dyslexia-friendly font option, screen-reader support for the tile board, reduced-motion respect, one-handed/left-handed layout.
- **Kid mode** — levels 1–2 only, no timer, no score penalties.

**Play feel**
- **Auto-check on last tile** — removes the Check button entirely. Every modern word game does this, and it matters twice as much under a timer.
- **Shuffle button** — currently advertised on the home card but absent in play.
- **Undo last tile.**
- **Near-miss feedback** — "one letter off" instead of a flat 😬.
- **Haptics** on place and solve.
- **Tile shape preserved** — scale tiles down rather than wrapping an 11-letter word to 7 + 4.
- **Practice / zen mode** — no scoring, no timer, no streak risk.
- **Review mistakes** at the end of a match.

**Depth**
- **Power-ups** — reveal letter, freeze timer, skip word.
- **Coin economy** — earned by play, spent on hints, freezes and power-ups.
- **Collections** — "Prophets 12/17", "Pauline letters 9/13". Set-completion is the strongest driver for a finite bank.
- **Badges and titles** — first perfect match, all 66 books, 7-day streak, no-hint clear.
- **Weekly league** — Duolingo-style promotion/relegation among friends.
- **Seasonal events** — Memorial season, convention season.
- **New puzzle mechanics** to fight exhaustion: anagram chains, verse-blank, category sort (person/place/book — the tags already exist), reverse mode (given the reference, name the word), survival, speed round.
- **Favourites** — bookmark a word to revisit.
- **Async duel** — send a friend your exact seed and compare.
- **Congregation leaderboard** built on existing room codes.
- **Print/export a set** for in-person play with no phones.

---

## 12. Phased delivery

Each phase produces working, testable software on its own, and each becomes its own implementation plan.

| Phase | Scope | Why this order |
|---|---|---|
| **A — Foundation** | Persistence record + migrations, lifetime points, personal bests, results-screen rework, stats page | Smallest change that closes the retention hole. Everything later writes to this record. |
| **B — Habit** | Daily Word, day streak, streak freeze, repair, milestones, perfect-week row, share card | The habit loop. Highest retention ROI. |
| **C — Content** | Word bank 165 → 660 as drafts, `tribe`/`nation` categories, NWT verification rules, review screen, numbered-book prefix fix | Nine levels need the words before they can exist. |
| **D — Progression** | Nine levels, re-banding, padlocks, unlock rules, journey path UI, level multipliers, length-scaled scoring | The structural change you asked for; depends on C. |
| **E — Pressure & feel** | Length-scaled timers, bonus-then-enforced model, hint ladder rework, auto-check, shuffle, undo, tile-shape fix, scripture reveal moment | Makes levels 5–9 playable and the solve moment land. |
| **F — Scale** | Durable Object rooms, 30-player cap, WebSockets, ranked live standings, descending-curve scoring, host controls, reconnect, spectators | Largest infrastructure change; independent of A–E. |

**Recommended start: Phase A.** It is small, it is the dependency for B–E, and on its own it fixes the single worst problem the playtest found.

---

## 13. Open questions

- Exact clear-condition tuning (20 words at ≥70%) needs playtesting.
- Whether XP/player level and the nine content levels are too many progress systems side by side.
- Whether the coin economy is wanted at all, or whether it cheapens a family game.
- Localization scope: UI only, or level names too?
