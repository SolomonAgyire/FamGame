# Bible Word Game — Play Modes, Teams, and Online Rooms

Status: approved for the first implementation on 2026-09-17.

This document extends `2026-09-17-bible-word-game-design.md`. It defines how
one person, several people sharing one device, and several people on separate
devices enter and complete a match. It also defines the authoritative online
room lifecycle so implementation does not invent multiplayer rules ad hoc.

## 0. Non-negotiable cost constraint

The planned MVP and first online release must be buildable, deployable, and
playable for **$0**. The owner does not need to buy a domain, subscription,
database plan, asset pack, font, analytics service, or app-store account.
The deployed game must not require the owner to sign in periodically or
manually wake a paused project merely to keep ordinary free-tier service
available.

The zero-cost deployment uses:

- local files and browser APIs during development;
- a free Cloudflare-provided `pages.dev` or `workers.dev` address instead of a
  purchased custom domain;
- free static hosting for the app and word-bank files;
- the Cloudflare Workers Free plan for room creation, joining, and WebSockets;
- SQLite-backed Durable Objects on the Workers Free plan for temporary live
  room state;
- `localStorage` for solo preferences, recent-match uniqueness history, and
  optional local progress;
- original CSS, system/openly licensed fonts, and original or appropriately
  licensed assets only.

Turso, accounts, cross-device campaign saves, paid analytics, a custom domain,
native app-store distribution, email/SMS, voice/video, and third-party paid
assets are not required for the free release. Turso remains an optional future
choice only if a later feature genuinely needs cross-room persistent data.

Free services have usage limits and may change their terms. Before each public
deployment, verify the current limits. Keep paid upgrades and automatic
overages disabled. If a free limit is reached, the service may temporarily
reject new online activity; the app must show a friendly capacity message while
Solo and Play Together continue working locally. The system must never silently
incur a charge.

Under the currently documented plans, Supabase Free may pause a low-activity
project after about seven days and require the owner to restore it. Cloudflare
Workers/Pages document free usage limits but not a comparable seven-day
inactivity pause or recurring dashboard-login requirement. That maintenance
difference is one reason Cloudflare is preferred for this intermittent family
game. This must be rechecked if provider policies change.

## 1. Product decision: three clear ways to play

The home screen has exactly three primary choices:

1. **Solo** — one person on one device; no room code or network required.
2. **Play Together** — several people share one device in cooperative or team
   play; no room code required.
3. **Online Room** — people use separate devices and join the same private room
   with a short code.

These are entry paths, not separate games. They share the same word bank,
scramble generator, categories, difficulty system, match lengths, scoring
rules, hints, and results presentation.

Many online rooms may exist at the same time. Every room has isolated players,
teams, configuration, seed, puzzle index, and scores. Activity in one room can
never affect another room.

## 2. Supported play configurations

### Solo

- Exactly one player.
- Runs locally and remains playable if the online room service is unavailable.
- No code, lobby, ready check, or account.
- The player chooses categories, difficulty, and 10, 15, or a valid custom
  puzzle count.
- The player manipulates tiles, checks answers, uses hints, and advances at
  their own pace.
- Results show total score, maximum possible score, accuracy, hints used, and
  the options Play Again, Change Set, and Home.

### Play Together on one device

Two variations share the device:

- **Cooperative** — everyone solves together against the maximum possible
  score. There is one shared score and no individual winner.
- **Teams** — two to four teams compete. Each team chooses a name and color.
  A rotating builder physically controls the tiles after the team presses its
  Claim button. Teammates may discuss the puzzle freely.

For team play, a correct check awards the current puzzle value and resolves the
puzzle. An incorrect check costs the claiming team 1 match point, never below
zero, and releases control. A team may release voluntarily without submitting.
There is no puzzle timer in the MVP.

### Online Room on separate devices

An online room supports:

- **Individuals** — each player has a separate score.
- **Teams** — two to four teams share team scores.
- **Cooperative** — everyone contributes to one room score.

The recommended MVP room capacity is 12 connected players. Competitive
individual and team matches need at least two scoring sides. Cooperative rooms
may start with one participant, although Solo is the simpler one-person path.

## 3. Important interaction difference online

Shared-device play needs Claim and Builder because only one person can touch
the screen. Online play does not use that interaction.

In an online match, every participant sees the same scrambled puzzle but has a
private, local tile arrangement. Everyone may work simultaneously without
sending every tile tap across the network. Pressing Check submits that player's
assembled answer to the room service.

- In Individuals mode, the first correct submission awards that player.
- In Teams mode, the first correct submission from any teammate awards that
  team.
- In Cooperative mode, the first correct submission awards the shared group.
- The accepted correct submission resolves the puzzle for the whole room.
- Later or duplicated submissions for that puzzle are rejected as stale.

This preserves “anyone on the team may solve” and avoids conflicting tile
movements from several devices. Players may collaborate aloud when together or
through their own call when remote. Text, voice, and video chat are not part of
the game MVP.

## 4. Online scoring and hints

Every puzzle begins with a value of 5 points.

- Correct with no hint: award 5.
- Each hint: reduce that side's available award by 1, to a minimum of 1.
- Incorrect checked answer: subtract 1 from that player's or team's match
  total, never below zero.
- Losing sides receive no correct-answer points after another side resolves
  the puzzle.

Hints are scoped to the scoring side:

- Individual hints are visible only to that player and reduce only that
  player's available award.
- Team hints are broadcast to that team and reduce only that team's available
  award, regardless of which teammate eventually solves.
- Cooperative hints are room-wide and reduce the shared available award.

The server, not the browser, owns scores, hint counts, puzzle value, and the
accepted first-correct result.

## 5. No-timer pacing and stuck puzzles

There is no answer timer, but a match must still have a way to move past an
unsolved puzzle.

- Solo and shared-device modes include **Reveal & Continue**. The puzzle gives
  no correct-answer points, shows the answer and NWT reference card, and moves
  on when the player or host is ready.
- Online rooms let every scoring side mark **We're Stuck**. The host may reveal
  once all active scoring sides are stuck, or may use an explicit Host Reveal
  control after confirming the action.
- After a solution or reveal, all devices show the same result card. The host
  controls **Next Puzzle** so families have time to discuss the Bible
  connection. In Solo, the player controls Next.
- A three-second synchronized countdown is used only when an online match
  first starts; it is not a puzzle timer.

## 6. Creating and joining an online room

### Host flow

1. Choose **Online Room**.
2. Choose **Create Room**.
3. Enter a display name.
4. Receive a random six-character room code and a copyable join link.
5. Choose Individuals, Teams, or Cooperative.
6. Configure categories, difficulty, and puzzle count.
7. For Teams, create two to four teams or select automatic balancing.
8. Wait for players to join and mark ready.
9. Lock the room and start when the minimum number of scoring sides is ready.

### Joiner flow

1. Choose **Online Room**.
2. Choose **Join Room**.
3. Enter the six-character code or open the host's join link.
4. Enter a display name.
5. Join or receive a team assignment when applicable.
6. Mark Ready.
7. Wait in the lobby until the host starts.

The lobby shows the room code, configured match, connected players, teams,
ready status, and host. Only the host may change match settings, move players
between teams, lock the room, remove a participant, or start.

## 7. Room-code rules

- Code format: six uppercase characters from an unambiguous character set;
  omit `O`, `0`, `I`, and `1`.
- Generate codes with a cryptographically secure random source.
- Reject a code if an active room already owns it, then generate another.
- Screen generated codes against a small blocked-pattern list.
- Accept codes case-insensitively and ignore spaces or a display hyphen.
- A join link may contain the code but never a player or host token.
- The code locates a room; it is not a password or authorization credential.
- Rate-limit failed joins and room creation to deter code scanning.
- Lock the room automatically when a match begins.
- Expire the room after the host closes it or after two hours without activity.

The server issues a separate high-entropy host token and player token. The
browser stores its token with the room's expiration time and deletes it when
the room closes. A player who refreshes presents the token and resumes the
same seat rather than creating a duplicate player.

## 8. Match lifecycle

An online room follows one authoritative state machine:

1. `LOBBY` — players join, teams are arranged, settings change, players ready.
2. `COUNTDOWN` — settings and roster are frozen; the server creates the match.
3. `PUZZLE_OPEN` — participants arrange letters and submit answers.
4. `PUZZLE_RESOLVED` — the room shows the winner/solver, answer, points, and
   NWT reference card.
5. Repeat `PUZZLE_OPEN` and `PUZZLE_RESOLVED` for the chosen puzzle count.
6. `RESULTS` — congratulate the winner or cooperative group and show scores.
7. `LOBBY` for a rematch/change of set, or `CLOSED` when the host ends the room.

The results screen offers:

- **Play Again** — same room and settings, newly generated seed and puzzles.
- **Change Set** — same room and players, return to the lobby configuration.
- **Leave Room** — remove that player.
- **Close Room** — host only.

Competitive ties use sudden-death puzzles among the tied sides. The first tied
side with an accepted correct submission wins; a wrong check applies the normal
penalty but does not end sudden death.

## 9. Authoritative room behavior

The server owns the canonical room and match state:

- room status and lock state;
- host, players, connection status, teams, and ready state;
- configuration and word-bank version;
- match ID, deterministic seed, puzzle order, and current puzzle ID;
- accepted hints, submissions, scores, and puzzle resolution;
- rematch and expiration state.

The client owns only presentation state such as its current local tile order,
animations, sound preference, and open panels.

Every client command includes room ID, player token, match ID, puzzle ID, and
an idempotency key. The server serializes commands for that room. When two
correct answers arrive close together, the first valid command processed by
the room wins. Once resolved, the room rejects all later commands for that
puzzle and broadcasts one result to every connected device.

## 10. Recommended real-time architecture

The recommended architecture is:

- Static web app for the UI and offline Solo/Play Together modes.
- A stateless HTTP edge entry point for Create, Join, and WebSocket upgrades.
- One stateful room coordinator per active room.
- One WebSocket connection from each online device to its room coordinator.
- Strongly consistent per-room storage for live roster, match, and reconnect
  state.
- No external database for the initial release. Turso is only a possible later
  option for cross-room accounts, campaign progress, or aggregate history; it
  is not the live coordination mechanism.

The first deployed Sites build uses a D1-backed room snapshot and short polling.
Optimistic version checks serialize competing writes so only one correct answer
can resolve a puzzle. This keeps the complete first release within the available
free hosting capability. The room protocol remains vendor-neutral; Durable
Objects with hibernatable WebSockets are the preferred future upgrade if room
traffic needs lower latency or larger scale.

## 11. Multiple rooms at the same time

Multiple groups can play simultaneously because each code maps to a distinct
room coordinator:

- `A7K4PQ` may contain one family playing Teams.
- `M8R2WX` may contain another group playing Cooperative.
- Solo and shared-device matches do not create rooms at all.

The edge entry point routes every room command and WebSocket to the coordinator
for that code. Coordinators cannot read or modify one another's live state.
Scaling is by rooms instead of putting all players into one global process.

## 12. Reconnects, host loss, and late joins

- Mark a disconnected player as reconnecting rather than deleting them
  immediately.
- Keep their seat and score for a 60-second grace period.
- A valid player token restores that seat and receives a complete room snapshot.
- Do not replay a Check command for an old or already resolved puzzle.
- If the host disconnects, wait 30 seconds. If they do not return, transfer host
  controls to the longest-connected active adult/participant.
- Players who enter a code after the room is locked join as spectators if the
  host permits it. They become players only when the room returns to the lobby.
- If only one competitive scoring side remains, the host may finish in practice
  mode or end the match; the game does not declare an uncontested competitive
  winner automatically.
- A room snapshot includes a monotonically increasing event sequence. Clients
  ignore messages older than the latest applied sequence.

## 13. Content and answer validation online

- The room service uses the same approved NWT-only word-bank version as the
  shipped game.
- At match start it records the word-bank version and full generated recipe.
- It sends clients only the current scramble, category, difficulty, permitted
  hints, and display metadata needed for that puzzle.
- Check sends the assembled answer to the server; the server normalizes and
  validates it against the canonical answer.
- The server reveals the answer and NWT reference only after the puzzle resolves
  or the host reveals it.
- If a client is too old for the room's protocol or content version, it must
  refresh before joining rather than risk seeing different puzzles.

The full bank is present in offline-capable clients, so this is not an anti-
cheat security boundary. Server validation exists for consistent scoring and
concurrency, not for high-stakes competition.

## 14. Privacy and safety defaults

- No account is required for private-room MVP play.
- Collect only display name, temporary player/room identifiers, match events,
  and operational logs needed to run and protect the room.
- Limit display-name length and escape all user-provided text.
- Do not add open public-room discovery, direct messages, voice, or video.
- Give the host kick, room-lock, and close controls.
- Apply request-size limits, input validation, create/join rate limits, room
  capacity limits, and token checks on every server command.
- Delete ephemeral room/player state after expiration unless an authenticated
  user explicitly chooses to save allowed history in a later release.

## 15. Failure behavior

- Solo and shared-device modes continue working if online services fail.
- If the WebSocket drops, show Reconnecting and disable Check until a fresh
  snapshot arrives; local tile arrangement may remain visible.
- If reconnection fails, offer Retry or Leave Room. Do not silently convert the
  player into a new seat.
- If the room expired, explain that clearly and offer Create Room or Home.
- If the host closes a room, notify every client and return them to Online Room.
- If a deployment restarts the coordinator, restore authoritative state from
  per-room storage and require clients to reconnect and resynchronize.

## 16. Delivery phases

The architecture is planned now, but implementation remains staged:

1. Build deterministic game engine and Solo with no network dependency.
2. Build Play Together cooperative and shared-device team Claim/Builder flow.
3. Separate authoritative game state transitions from UI code and define the
   room command/event protocol.
4. Build Create/Join lobby, room codes, tokens, ready state, and reconnect.
5. Add WebSocket match synchronization and online Individuals.
6. Add online Teams and team-scoped hints/scoring.
7. Add cooperative online play, spectators, host migration, and hardening.
8. Load-test several rooms and devices, then add optional durable profiles or
   campaign history only if the product needs them.

## 17. Acceptance tests before online release

- Solo completes with the network completely unavailable.
- Two different active codes cannot resolve to the same room.
- Two simultaneous rooms never exchange players, events, puzzles, or scores.
- Twelve clients can join one room and receive the same puzzle/result state.
- Two near-simultaneous correct submissions produce exactly one winner and one
  scoring transaction.
- Duplicate Check commands cannot award points twice.
- Individual, team, and cooperative hint costs affect only the intended side.
- Refresh reconnects to the same seat without duplicating the player.
- Host transfer works after the grace period.
- Late joiners cannot affect a match already in progress.
- Play Again keeps the room and roster but produces a different match/opening.
- Expired, full, locked, and invalid codes each show a clear recovery path.
- Mobile and laptop clients remain synchronized through solution, results, and
  rematch.

## 18. Approved defaults

The user approved implementation of these recommended defaults:

- Maximum 12 players per room.
- Online players solve concurrently on private tile boards; there is no online
  Claim/Builder step.
- Room host controls Next Puzzle because there is no answer timer.
- Mid-match joiners are spectators until the next lobby.
- Competitive rooms require two scoring sides; cooperative rooms may start with
  one participant.
- Live rooms use a stateful room coordinator; Turso is reserved for optional
  cross-room persistence rather than live synchronization.
