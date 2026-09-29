# Immersive redesign completion: home map, economy, results, lobby

This spec completes the visual redesign begun under `game/docs/immersive-redesign-plan.md`,
whose reference art is `game/docs/design/wordin-ui-direction.png` (the 4-panel mockup: home
map, active gameplay, level-complete, multiplayer lobby). Three prior commits
(`dc75ea7`, `02975a0`, `b0104dd`) already moved gameplay and the lobby close to that
reference. This pass finishes the job: rebuilds the home screen to match the mockup
directly (not an abstracted reinterpretation), adds a real coins/gems economy, unifies
five divergent star formulas into one, consolidates four duplicate results screens into
one component, and fills in the remaining visual gaps on gameplay and the lobby.

## Non-goals

- No shop, no spending mechanic for coins or gems (nothing in the 4 reference panels
  shows spending; a future pass can add it once a real screen calls for it).
- No backend/`RoomDO` changes. Lobby avatar colors are derived client-side.
- No change to scoring, word selection, timers, or WebSocket/Durable Object behavior,
  except where a new shared star/coin formula replaces an existing ad hoc one.
- No new binary art assets. Everything new (currency icons, scripture book, signposts,
  power-up icons) is CSS/SVG built in the existing carved-stone/parchment/glass material
  language, since no image-generation tool is available this pass.

## 1. Economy model

### Map/mastery stars (derived, no new storage)

Extract the star computation already inline in `LevelBar.tsx` (`cleared ? 3 :
min(2, floor(solved/needed*3))`) into one exported `starsForLevel(record, level): 0-3`
in `lib/levels.ts`. Both `LevelBar.tsx` and `LevelPath.tsx` (which currently shows no
stars at all) call this same function. The home screen's header star total is
`sum of starsForLevel(record, level) for level in 1..9` — fully derived from
`ProgressRecord.levelProgress`, matching the codebase's existing "derive, don't store"
convention (see the comment on `legacyClears` in `lib/progress.ts`). No migration needed.

### Post-match performance stars (unified formula)

Add `matchStars({ correct, wrong }): 0-3` (new export, `lib/progress.ts` or a small new
`lib/scoring.ts` addition — reuse whichever already imports at the 4 call sites):

- `correct === 0` → 0
- `wrong === 0 && correct > 0` → 3
- `correct / (correct + wrong) >= 0.7` → 2
- otherwise → 1

Each mode already computes its own result shape before rendering `RewardStars`; each
translates to `{correct, wrong}` at that seam instead of hand-rolling its own tiers:

- Solo/teams `Results` (`GatherWordApp.tsx:790`): already has `correct`/`wrong` directly.
- Time Attack (`GatherWordApp.tsx:739`): `correct = solved`, `wrong = misses`.
- Daily Word (`DailyWord.tsx:233`): `correct = solved ? 1 : 0`, `wrong = solved ? guesses - 1 : guesses`.
- Online (`GatherWordApp.tsx:1091`, currently hardcoded `earned={3}`): use the viewer's
  tracked `score` this room-match against `roomWordPool`/par if available; if per-player
  correct/wrong counts are not already tracked in `RoomSnapshot`, approximate with
  `correct = 1, wrong = 0` when the room's puzzle was solved by this player and
  `correct = 0, wrong = 1` otherwise, rather than a flat constant. Confirm the exact
  available fields during implementation; do not add new sync fields to `RoomDO` to get
  finer data (non-goal above).

### Coins and gems (new persisted ledger)

Add two fields to `ProgressRecord` in `lib/progress.ts`: `coins: number`, `gems: number`.
Both default to 0 in `emptyProgress()` and in `migrate()` (via `numberOr(parsed.coins, 0)`
etc.) — no backfill, they only count forward from today.

- **Coins**: awarded every completed match, inside `recordMatch()`. Formula:
  `coinsEarned = matchStars(result) * 10 + distinct.length * 2`. Add `coinsEarned` to the
  object `recordMatch` returns (alongside `isBest`/`previousBest`) so each results screen
  can display "+N coins" the way the mockup shows "+120".
- **Gems**: awarded once, the moment a level's `isLevelCleared` transitions false→true.
  Inside `recordMatch()`, compare `isLevelCleared(record, level)` before and after
  applying the match; if it flipped to true, `next.gems += 1` and return a
  `gemEarned: boolean` flag for the results screen to celebrate. Clearing is monotonic
  (a level cannot un-clear), so this is a safe one-time trigger with no extra bookkeeping.

## 2. Home screen — direct rebuild against the reference

The current `HomeScreen()` (`GatherWordApp.tsx:120-148`) composes a small text banner, a
sample-puzzle preview strip, the `LevelBar` ground path, and a 4-button `mode-orb` dock
of large circular character buttons. None of that matches the mockup, which shows: a top
currency HUD, a title plaque, one continuous painted path scene with numbered medallions,
a stack of signposts, and one large foreground mascot. This section replaces the current
composition, not just its styling.

**Remove from the home screen:** the `SamplePuzzle`/`home-puzzle-sign` scramble-letter
preview (it belongs on the gameplay screen, not here) and the large `mode-orb` circular
dock as the dominant element.

**Rebuild:**

- **Top HUD bar**: avatar/brand mark, `★{totalStars}`, `🪙{coins}`, `💎{gems}`, and a
  settings gear icon — replacing the current sound-only `header-actions`. Sound toggle
  moves into the settings affordance rather than sitting alone in the header.
- **Title plaque**: "WORDIN" on a carved stone/wood tablet, matching the mockup's brand
  treatment (replacing the current plain `home-brand` wordmark styling on this screen only).
- **Path scene**: reuse `bible-journey-map.webp` as the continuous background (already
  shared with the lobby via different crop). Numbered medallions restyled as ornate
  medals (embossed number, laurel/ribbon on cleared, pulsing glow on the current
  destination, desaturated lock on future levels) rather than flat gradient circles.
  Positions stay data-driven per level index (as today), but the connecting "windy path"
  is the painted background art itself — no separate CSS line/dot trail drawn on top.
- **Signposts**: four stacked carved-wood signpost labels — RIVERS, VILLAGES, HIGH
  PLACES, NEW WORLD — as chapter markers grouping the 9 real levels (approx. levels 1-2
  "Rivers", 3-4 "Villages", 5-7 "High Places", 8-9 "New World"), each jumping/scrolling
  the path to that cluster. Decorative wayfinding, not a new gameplay concept.
  ("New World" already matches `LEVEL_NAMES[7]`, confirming this reference art was made
  for this game's real progression, not generic placeholder copy.)
- **Mascot**: Nuri rendered large in the foreground, in-scene, instead of confined to a
  55px mode-orb badge.
- **Mode selection preserved, de-emphasized**: tapping a level medallion starts Solo at
  that level directly (matching the mockup's tap-node → play flow). Together/Online/Time
  Attack move to a compact secondary row of small icon+label chips below the fold —
  functionally identical to today's `startAs(item.id)` dock, just no longer large
  circular orbs competing with the map for visual weight.

## 3. Gameplay screen — polish only

Already close (letter arc, compass altar, compact `MissionHud`, icon tool row — see prior
exploration). Changes:

- Swap the tool set to match the mockup's 4 icons (hint, shuffle, hammer/clear, compass)
  instead of the current 5 (shuffle, undo, clear, hint, reveal) — fold "undo" into the
  existing clear/hammer action or drop it if redundant with hint+shuffle; confirm during
  implementation which of the current 5 map cleanly onto the mockup's 4.
- Add a pause icon at the top-left of `MissionHud`, matching the mockup.
- No change to `TileBoard`'s letter-tray/altar mechanics — those already satisfy the
  design doc's action #3.

## 4. Results screen — consolidate to one component

Replace the four near-duplicate result blocks (`Results` in `GatherWordApp.tsx:782-812`,
the Time Attack finished branch at `:735-757`, `DailyWord.tsx`'s done branch at `:231-257`,
and `OnlineResults` at `:1088-1097`) with one shared `Results` component (new file,
`components/Results.tsx`), taking props: `level`, `stars`, `coinsEarned`, `gemEarned`,
primary stat pairs (label/value, e.g. accuracy% and points, or best-score-vs-side for
online), and the primary action (label + handler, since "Next"/"Play again"/"Continue"
differ by mode). All four call sites pass their own data into the same visual shell:

- Exactly 3 `RewardStars`, "WELL DONE"-style headline, `+{coinsEarned}` coins stat, an
  accuracy or equivalent second stat, one dominant dark-green primary button (matching
  the mockup's "NEXT"), and the mascot in cheer pose.
- The scripture-reward element (mockup's illustrated book/scroll) becomes a real CSS/SVG
  book graphic replacing today's plain `.reward-scroll` text pill — shown whenever the
  match includes a scripture reference (already available via `getEntryById`/word entry
  `reference` field used elsewhere), gracefully omitted for modes without one (e.g. Time
  Attack, which currently has no reward-scroll at all).
- When `gemEarned` is true, add a small distinct gem-sparkle beat to the sequence (new
  milestone moment; first time this level was mastered).

## 5. Lobby screen — polish only

Already close (campfire, seats, ready pills, room code, host-only Start — see prior
exploration). Changes:

- Per-player ring color: hash each `RoomPlayer.id` to one of a fixed palette of distinct
  hues, client-side, in `OnlineLobby()` — no `RoomDO`/protocol change. Team color (sun/olive)
  continues to control team-mode grouping separately from this per-player ring hue, which
  displays purely as a border ring around the existing initial-letter avatar; no portrait
  art is introduced (see Non-goals: no new binary assets).
- Add a back-chevron (top-left) and an invite-person icon (top-right) to the lobby header,
  replacing/augmenting the current back button and "Copy invite" secondary button, to match
  the mockup's header layout.

## Testing and safeguards

- `lib/progress.ts` changes (new `coins`/`gems` fields, `matchStars`, `recordMatch`
  returning `coinsEarned`/`gemEarned`) need unit tests: migration of a v1 record without
  these fields defaults them to 0; `recordMatch` awards coins per the formula; gems award
  exactly once on the clear-transition match and never again after.
- `lib/levels.ts`'s new `starsForLevel` needs a unit test per boundary (0, partial, capped
  at 2 pre-clear, 3 on clear).
- Existing suites (`tests/timing.test.ts`, `tests/room-start.test.ts`, and others) must
  keep passing unchanged — this pass touches no scoring/timer/room logic other than the
  star/coin formulas above.
- Run full automated tests, lint, and production build before considering this complete,
  per the existing `immersive-redesign-plan.md` functional safeguards.
- Manual mobile-viewport check (390×844) of all 4 rebuilt/polished screens against the
  reference image, with `prefers-reduced-motion` respected on any new animation
  (medallion glow, gem sparkle, signpost interactions).
