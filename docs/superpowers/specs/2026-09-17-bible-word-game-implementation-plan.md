# GatherWord — First Release Implementation Plan

Status: implemented and verified on 2026-09-17.

This plan turns the approved design and room specifications into one responsive
web game in `game/`. The release is named **GatherWord**.

## Delivered product

- Solo Journey with category blending, four difficulty bands, 10/15/custom
  match lengths, hints, reveal, scoring, results, rematch, and change-set flow.
- Play Together cooperative mode and two-to-four-team shared-device mode with
  Claim, rotating control, release, correct and incorrect scoring.
- Private online rooms for up to 12 devices with random six-character codes,
  invite links, ready state, host configuration, Individuals, two-team, and
  Cooperative play, simultaneous private boards, first-correct resolution,
  host-controlled reveal/advance, reconnection, results, and rematch.
- A deterministic seeded generator with category balancing, fresh scrambles,
  no answer repeats in a match, and browser history that rejects the last 1,000
  match signatures.
- An initial curated bank of all 66 Bible books plus people and places. Answers
  follow English NWT naming, store Scripture references rather than verse text,
  and use original hints. No JW.org scraping, copied definitions, verse text,
  branding, images, or site assets are included.
- A D1 schema and migration for ephemeral two-hour room state. Local modes do
  not depend on the room service and continue to work when it is unavailable.

## Source layout

- `game/components/GatherWordApp.tsx` — screens and client interactions.
- `game/lib/game-engine.ts` — deterministic selection, balancing, scrambling,
  answer normalization, and last-1,000 history.
- `game/data/word-bank.ts` — curated answer data and references.
- `game/lib/room-service.ts` — room codes, authentication, authoritative state,
  scoring, hints, and optimistic concurrency.
- `game/app/api/rooms/**` — create, join, snapshot, and action endpoints.
- `game/db/schema.ts` and `game/drizzle/**` — D1 schema and migration.
- `game/tests/engine.test.ts` — word-bank and generator simulations.

## Release checks

- TypeScript: `npx tsc --noEmit`
- Lint: `npm run lint`
- Engine simulation: `npm test`
- Production bundle: `npm run build`
- Room smoke test: create a local room, authenticate the host, and start a
  synchronized puzzle through the HTTP API.

## Cost and maintenance

The application uses the free Sites runtime and D1 capability, system fonts,
original CSS, and no paid API. It requires no purchased domain and no weekly
owner login. Free-provider capacity limits still apply, and no automatic paid
overage is part of this implementation.

## Content growth

The “one million” goal refers to distinct match recipes, not one million copied
Bible words. The current curated entries already create far more than one
million possible matches when word choice, order, scramble, category mix, and
team order are combined. New NWT-verified entries can be added to the same data
model without changing game logic.
