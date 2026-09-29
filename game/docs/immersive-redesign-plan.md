# WordIn immersive game redesign

This document is the implementation contract for the visual redesign. It protects the existing solo, cooperative, teams, Time Attack, Daily Word, and online-room behavior while replacing the web-page presentation with one continuous game world.

## Art direction

- The world is a warm, sunlit ancient Mediterranean adventure rendered with turquoise water, olive foliage, limestone, coral cloth, sun-gold rewards, and grape-purple accents.
- The interface is made from objects that belong in the world: carved stone tablets, medallions, scrolls, compass-like controls, fabric banners, and glassy letter cubes.
- The background remains visible during play. Controls occupy the edges and the puzzle occupies the center.
- Copy stays brief. Icons, spatial grouping, character reactions, and animation explain the controls.
- The mobile portrait layout at 390 × 844 is the primary composition. Larger screens frame the portrait scene rather than stretching its controls.

Design references created for this pass:

- `docs/design/wordin-ui-direction.png`
- `docs/design/wordin-character-cast.png`

## Character cast

| Character | Role | Main color | Gameplay use |
| --- | --- | --- | --- |
| Nuri the camel | Journey guide | Turquoise | Solo, tutorial, map progression |
| Tali the hoopoe | Fast scout | Coral orange | Time Attack and online play |
| Boaz the lion cub | Team captain | Olive green | Cooperative and teams |
| Mira the fennec fox | Clever clue keeper | Grape purple | Hints and Daily Word |

Every character supports `idle`, `think`, `cheer`, `oops`, and `urgent`. Reactions must change the eyes, brows, mouth, pose, and timing—not merely translate the whole drawing.

## Eleven actions

### 1. Puzzle-first composition

- Make the active board the largest object on screen.
- Remove nested card-within-card framing.
- Place the answer altar and letter tray directly in the illustrated world.
- Keep progress, score, and timer in a thin top HUD.

Acceptance: the board occupies most of the first mobile viewport and requires no vertical scroll for ordinary words.

### 2. Compact game HUD

- Show mission progress, score, timer/moves, and pause/home in compact capsules.
- Replace sentence-length status text with icons and numbers.
- Preserve accessible labels for icon-only controls.

Acceptance: the player can read the current mission in one glance without the HUD competing with the puzzle.

### 3. Signature letter controller

- Present loose letters in a carved semicircular tray.
- Give tiles glossy colored faces, thick lower edges, and tactile press/lift/snap motion.
- Animate placed letters into carved answer sockets.

Acceptance: letter selection feels physical and the same `TileBoard` API continues to serve local, Time Attack, online, and Daily modes.

### 4. Compact controls

- Convert shuffle, undo, clear, hint, pause, and settings to round or square icon controls.
- Keep only Play, Next, Start, and Continue as wider actions.
- Remove all mode information “i” controls from the home map.

Acceptance: no routine gameplay action appears as a long toolbar button.

### 5. Strong reactions

- Correct: illuminate sockets in sequence, bounce the board, play a score flight, trigger a full cheer pose, and add a controlled sparkle/confetti burst.
- Wrong: shake answer sockets, return tiles with a soft bounce, show a sympathetic pose, and pulse the altar coral.
- Urgent: let the timer, companion, and scene react during the final seconds.

Acceptance: success and failure remain readable with audio muted.

### 6. Completion ceremony

- Show one focused result tablet over the world.
- Fill three stars sequentially from accuracy, hints, and completion.
- Show points, accuracy, best score or winning side, and a scripture/reward scroll.
- Provide one dominant Next/Play again action.

Acceptance: solo, Time Attack, teams, cooperative, and online results all use the same visual grammar while preserving their distinct data.

### 7. Meaningful journey progression

- Place nine level medallions directly along the painted path.
- Show completed stars, the pulsing current destination, locks, and milestone treasure.
- Animate the newly unlocked destination when returning from results.
- Keep mode selection in a compact world dock instead of four equal page cards.

Acceptance: choosing a level and choosing a mode both happen on the map without navigating to a separate page.

### 8. Player-centered online room

- Stage the lobby as a camp gathering with circular player seats around the room code.
- Show host crowns, team colors, ready rings, spectators, and empty seats visually.
- Keep Create, Join, Ready, and Start compact.

Acceptance: player presence is the visual focus and host settings remain fully usable.

### 9. Environmental movement

- Retain looping bird flocks and add drifting cloud, firefly, leaf, water-shimmer, and foreground-parallax layers.
- Keep movement subtle around controls and stronger in unused scenic areas.
- Respect `prefers-reduced-motion`.

Acceptance: the scene never appears frozen, but the puzzle remains easy to read.

### 10. Less written instruction

- Remove explanatory paragraphs from primary play flows.
- Use short labels, icon controls, title attributes, and accessible names.
- Keep help text only for validation, unavailable word sets, and network errors.

Acceptance: setup and lobby screens fit comfortably on common phones with no instructional wall of text.

### 11. Unified production character system

- Render all four mascots with the same proportions, dimensional lighting, costume language, brows, and reaction anatomy.
- Use transparent idle, cheer, and encouraging pose assets with CSS motion and accessible descriptions.
- Place a companion in the map, setup, active board, online room, and results.

Acceptance: every mode has a recognizable guide whose pose changes with the actual game state.

## Audio and haptics

- Keep the licensed music playlist and synthesized effects already in the project.
- Add distinct tile lift, socket snap, shuffle, star-fill, reward, timer-warning, and result-fanfare cues with the Web Audio API.
- Use `navigator.vibrate` only when available: a light tap for placement, a short double pulse for correct, and a soft pulse for wrong.
- No external voice service is required for this pass. Character reactions remain expressive, nonverbal, and fast.

## Functional safeguards

- Do not change game-engine scoring, word selection, timers, progress storage, room actions, WebSocket behavior, or Durable Object rules unless the new UI requires a bug fix.
- Keep keyboard/button semantics, visible focus, accessible names, reduced-motion handling, and disabled states.
- Run the full automated test suite, lint, production build, and mobile visual/interaction review before considering the pass complete.
