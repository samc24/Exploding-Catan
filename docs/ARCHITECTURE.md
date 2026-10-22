# Architecture

This fork is re-architecting Exploding Catan from a single 10,000-line
`index.html` into something that can be developed, tested and run as a public
service, without losing the rules that make it the game it is.

## The shape we are moving to

```
packages/
  engine/      pure TypeScript rules engine — no DOM, no network, no clock
  bots/        (next) the AI, as a client of the engine
apps/
  web/         the browser UI: Vite + TypeScript, plain DOM and SVG, built on
               the engine. Hot-seat today; the same screens will be driven by
               the server's per-seat views tomorrow.
  server/      (later) authoritative multiplayer: runs the engine, sends each
               seat its own redacted view over WebSockets
index.html, ai.js, net.js     the original game, untouched, still served by Pages
```

Published by the Pages workflow: the original at the site root, the new app
under `/new/`.

The original files stay at the repository root for now so the published site
keeps working while the new code grows beside it. When `apps/web` reaches
parity they move to `legacy/` and Pages points at the new build.

## The engine

`packages/engine` is the heart of it and the first thing built. The contract:

```ts
const state  = createGame(config, seed);
const result = applyAction(state, action, now);   // { ok, state, events } | { ok:false, error }
const view   = viewFor(result.state, seat);        // what one player may see
```

* **Pure.** `applyAction` never mutates its input. It clones, runs the rule,
  and returns the clone. A rule that refuses throws, and the caller gets the
  original state and a reason.
* **Deterministic.** All randomness comes from a seeded PRNG whose state lives
  on the `GameState`. The same seed and the same actions produce the same game,
  byte for byte. That is what makes replays, bug reports and self-play tuning
  possible.
* **Clockless.** Nothing reads `Date.now()`. The caller passes `now` with every
  action, and the host sends a `tick` action to drive the turn timer and the
  Imploding Kitten's twenty seconds. Tests run a whole game in milliseconds.
* **Plain data.** `GameState` is JSON. No object identity: cards are found by
  id, snapshots are copies. It can be stored, diffed, sent over a wire and
  reloaded.
* **Decisions are state, not dialogs.** Everything the original game asked for
  in a modal — a discard, a victim, three cards for a Favor, two tokens for an
  Alter — is a field on the state (`seven`, `attackDue`, `select`,
  `forcedNope`, `trade`) that the UI renders and the bots answer. Nothing can
  be lost by closing a window, because there are no windows.
* **Events for the UI.** Each action returns a list of what happened
  (`production`, `cards`, `kitten`, `show`, `feed`…) so a renderer can animate
  it without reverse-engineering a state diff. `eventsFor(events, seat)`
  redacts them per seat.

### What was deliberately kept

The journal-with-snapshots design that makes Nope and Defuse work is kept
whole: every answerable action records the state before it, a Nope rewinds
and re-charges the cards that were spent, a cancelled turn destroys what it
gained and hands back what it took, and a cancelled win costs every Feral
Kitten. Each of those rules has a test, mostly transcribed from the bug
post-mortems in the original README.

### What was deliberately changed

* UI gestures (arming a spot with a first click, dragging a card onto the
  pile, which answer a drop means) are not rules and are not in the engine.
  The engine exposes `answersFor(state, "nope" | "defuse", seat, now)` so a
  UI can offer the same choices.
* A Nope dropped on a log line (`nope {jid}`) strictly answers that line.
  Cancelling the turn in progress is a separate, explicit action
  (`nopeTurn`). The original silently turned one into the other.
* The forced Nope is served by the forced player sending `nopeTurn`; the
  engine will not accept anything else from the table until they do. A bot
  driver answers it immediately, as before.

## The web app

`apps/web` has no framework. One `render()` rebuilds each region of the page
from the state: the SVG board, the seat strip, the bottom bar (hand and
actions), the side feed, and the panels. Panels are the important idea: every
decision the engine says is owed (`discardOwed`, `select`, `forcedNope`,
`trade`) is drawn as a panel for the seat that owes it, and the screen follows
that seat. Nothing is modal except menus, so nothing the game needs can be
dismissed.

Clicks on the board arm a spot on the first click and act on the second, the
way the original does. Cards are clicked, not dragged: a reaction card opens
the engine's `answersFor` list when there is more than one thing it could
answer. Screen-local state (what is armed, which seat is being looked at,
which composer is open) lives in `main.ts` and never touches the rules.

`e2e/` holds headless-Chrome smoke tests that play through setup, turns, and
every kitten card flow and fail on any page error.

## Multiplayer

The original runs the whole game in one player's browser and mirrors state
through Firebase. That cannot go public: the host can read every hand, the
game dies when the host's tab closes, and the database rules let anyone with a
room code write anything.

The plan is an authoritative server that runs this same engine. Clients send
actions, the server validates them, applies them, and sends each seat its
`viewFor`. The host-in-browser code (`net.js`) keeps working against the
legacy UI until then and is not being extended.

## Working on it

```bash
npm install
npm test                 # engine tests
npm run typecheck
npm run lint
```

Rules changes go in `packages/engine` with a test. Anything that is a
faithful port of a rule from the original is also a candidate to send back
upstream as a focused PR against `index.html`.
