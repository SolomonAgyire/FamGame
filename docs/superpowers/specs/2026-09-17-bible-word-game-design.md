# Bible Word Game — Design Extension: Categories, Session Variety, and Content Scale

Status: approved by user on 2026-09-17, pending spec self-review below.

This document extends `bible-word-game-brief.md` (the original working brief).
It does not re-litigate anything settled there — tap-to-place input, the team
mechanic, hint system, hotseat-first, single-lightweight-app philosophy, and
the "don't re-litigate" list in the brief's section 3 all still stand. This
doc covers three things the brief left open or under-scoped:

1. Letting players choose a category (Books / Names / Places) per session,
   including blending more than one.
2. Making every session meaningfully different from every other, even across
   thousands of plays.
3. Growing the word bank far beyond the brief's ~150-250 word starting pool,
   sourced from the New World Translation (NWT) via JW.org.

It also settles one infrastructure question (database choice for future
persistence/multiplayer) and raises the visual design bar explicitly.

---

## 1. Goals

- Players choose which category (or blend of categories) to play each
  session: Books, Names, Places.
- No two sessions should play out the same way — not the same words, not in
  the same order, not scrambled the same way, not the same difficulty shape,
  not the same team/turn order. This should hold up over hundreds or
  thousands of sessions, not just "feel" varied after a few plays.
- The word bank is large and grows over time, sourced honestly from the NWT,
  built in priority order: 66 books → places → people/names → general
  vocabulary. The scale target ("over 1M") is delivered by how the
  randomization engine combines a real, honest word list — not by storing a
  literal million records.
- The game looks and feels like a modern, polished casual word game (the bar
  set by things like Wordle or NYT Games, with Duolingo-style warmth), and
  works cleanly on both phone and laptop screens.

## 2. Non-goals (for this pass)

- Persistent saved campaigns and online (cross-device) multiplayer remain
  out of scope for this build, per the brief's section 9 build order. This
  doc settles *what database to use when that's built* (section 7) but does
  not build it now.
- No change to core mechanics already decided: tap-to-place input, hint
  system, team mechanic (anyone on a team may attempt; first correct locks
  it; points go to the team).
- Not re-opening: wrong-answer cost (free retry vs. limited attempts vs.
  timer), exact number of difficulty bands, or rounds-per-session. These
  remain open per the brief and should be settled during implementation
  using the brief's suggested defaults (3-5 bands) unless it becomes clear
  during build that this design forces a different answer.

## 3. Architecture

No server for the MVP. A static app plus a data file it loads, and an
offline script for growing that data file — keeping the brief's "no build
step to play" principle while letting content grow independently of code.

```
/bible-word-game/
  index.html          — shell, styles, screens (setup, play, results)
  engine.js           — game logic: session setup, randomization, scoring, input handling
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
names later means re-running the build script and shipping a new
`words.json` — no code change.

## 4. Content pipeline & data model

Each word bank entry:

```json
{ "word": "HABAKKUK", "category": "book", "band": 3, "hint": "One of the twelve Minor Prophets" }
```

- `category`: `"book" | "name" | "place"` (room to add `"vocabulary"` later
  for the bulk tier described in section 8).
- `band`: difficulty band (see brief section 5; count TBD during
  implementation, brief suggests 3-5).
- `hint`: short text usable by the hint system already specified in the
  brief.

**Sourcing**: NWT text, referenced via JW.org, exactly as the original brief
specified — names and places are facts, need no doctrinal vetting, and raw
scripture/article text is never pasted in (copyright); sources are used only
to pick correct words and spellings.

**Build order** (matches what was decided in this brainstorm):
1. 66 book names (already scoped in the brief).
2. Bible places.
3. Bible people/names.
4. General NWT vocabulary (feeds the bulk tier in section 8, not the core
   bands).

Each category is authored as its own raw list and merged by
`build-wordbank.js`, which is also the natural place to catch duplicates,
words too short to scramble (1-2 letters), and missing hints.

## 5. Session setup & category blending

At session start (solo or group), the player(s) select one **or more**
categories (Books / Names / Places) to blend. The session's word pool for
that run is the union of the selected categories, drawn according to the
difficulty bands defined in the brief (section 5), using the `band` field
from the data model above (section 4). Bands are curated so that "Band 2" feels similarly
hard whether it's a book, a name, or a place, so blending categories doesn't
quietly bias difficulty toward whichever category has easier words at a
given band. This is a content-authoring discipline for whoever fills in
`band` values, not a runtime mechanism.

Team mechanic is unchanged from the brief: anyone on a team may attempt the
current word; first correct answer locks it and scores for the team.

## 6. Randomization engine

This is the mechanism that makes "never the same, even after 1000 sessions"
true. Every session generates a fresh random seed at start (e.g. via
`crypto.getRandomValues`), which independently drives:

- **Word selection & order** — which words are drawn from the blended pool
  for this session, and the order they're presented in.
- **Scramble pattern per word** — the letter arrangement shown is computed
  fresh each time a word is presented (a Fisher-Yates shuffle over the
  word's letters, re-rolled if it accidentally produces the original word or
  another real word already in the bank), never a single stored scramble
  per word.
- **Category mix & difficulty curve shape** — when multiple categories are
  blended, the proportion drawn from each, and the shape of the difficulty
  ramp itself (steep vs. gradual, how many words per band), vary session to
  session rather than following one fixed curve.
- **Team/turn order & round structure** — which team is considered "first"
  for that session (relevant for tie-breaks/steals, not for who's allowed to
  answer, since anyone on a team may attempt at any time), and round count
  within the brief's suggested defaults, are also randomized per session.

At the pool sizes reached even in the near term (hundreds to low thousands
of words across categories), the combination of these four independent
sources of variation already produces well over a million distinct possible
sessions. No puzzle content needs to be pre-generated or stored to make that
true — it falls out of combinatorics applied to an honestly-sized word list.

**Testing**: a simulation test runs hundreds of sessions programmatically
and checks that word selection, scrambles, and curve shape actually vary as
designed — this is what makes "never repeats" a verified property, not a
hope.

## 7. Future persistence & multiplayer database (decided now, built later)

Not built in this pass, but decided so the eventual build isn't blocked on
re-researching it: **Turso** (hosted SQLite, built on libSQL) is the chosen
database for whenever saved campaign progress or online (cross-device)
multiplayer gets built.

Why: Supabase's free tier pauses projects after about a week of inactivity,
requiring manual restoration — a bad fit for a family game played in
bursts. Turso's free tier (5GB storage, 500M row reads/month, 10M row
writes/month) stays warm without a keep-alive workaround, requires no
server to run, and is literally SQLite, matching the original instinct
behind this question.

Caveat carried forward: a database solves storage, not live real-time sync
between devices in the same match. The brief already flagged live
multiplayer sync as "the hard part" (originally scoped as Supabase
Realtime); when that's built, the sync-layer choice (e.g. Cloudflare Durable
Objects, Partykit) is a separate decision from where saved data lives, and
is not settled by this document.

## 8. Bulk vocabulary tier (explicitly later, not this build)

Once the randomization engine above exists, a second, larger tier can be
added without redesigning anything: a much larger, auto-extracted raw NWT
vocabulary list (tens of thousands of words, category `"vocabulary"`, looser
or auto-generated hints) for a bonus/stretch mode or to honestly advertise a
larger word count. This is a pure content addition on top of the same
engine and data shape — no architecture change — and is deliberately not
part of this build.

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
broken screen.

## 11. Open items carried forward (unchanged from the brief, not resolved here)

- Wrong-answer cost: free retry, limited attempts, or a timer.
- Exact number of difficulty bands (brief suggests 3-5) and rounds per
  session.

These are intentionally not decided in this document; the brief already
flagged them as open, and nothing in this design forces an answer.

## 12. Build order (extends brief section 9)

This design slots into the brief's existing build order without replacing
it: item 1 (MVP core loop, one band, solo, one file) still comes first.
Category blending, the randomization engine, and the growing word bank
described here are the natural next steps once the core loop is proven fun,
and should be sequenced in an implementation plan rather than built all at
once.
