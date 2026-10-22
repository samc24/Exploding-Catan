# Architecture

This fork is re-architecting Exploding Catan from a single 10,000-line
`index.html` into something that can be developed, tested and run as a public
service, without losing the rules that make it the game it is.

## The shape we are moving to

```
packages/
  engine/      pure TypeScript rules engine — no DOM, no network, no clock
  bots/        the AI, as a client of the engine: decide(bot, state) → action
apps/
  web/         the browser UI: Vite + TypeScript, plain DOM and SVG, built on
               the engine. Hot-seat today; the same screens will be driven by
               the server's per-seat views tomorrow.
  server/      authoritative multiplayer: owns every room's real state, runs
               the engine and the bots, sends each seat its own redacted view
  protocol/    (packages/) the wire contract between client and server
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

## The bots

`packages/bots` is the original `ai.js` strategy, ported to pure functions.
`decide(bot, state, now)` returns the single action a bot wants to take —
a setup placement, a discard it owes, a reply to a trade, a reaction with a
Nope or Defuse, or the next step of its own turn — and `nextBotAction(table,
state, now)` picks which bot goes first. The host (today the web app, later
the server) applies that action through the engine like any other and asks
again after a pacing delay. Nothing in the bots mutates state or touches the
page, so the same code drives a browser game, a server game and a test.

Each bot carries its own seeded RNG, so a table of bots is a pure function
of its seeds: the self-play test plays whole games across seeds, player
counts, modes and boards, checks every action it chose was legal, checks the
bank balances, and replays a seed to prove determinism.

Fairness is a tested property, not a promise: at every decision in a game
the test permutes the deck and replaces every other hand with different cards
and requires the identical decision. A bot sees piece positions, resource
counts, played knights, public VP, the journal and its own hand. Nothing else.

## Multiplayer

The original runs the whole game in one player's browser and mirrors state
through Firebase. That cannot go public: the host can read every hand, the
game dies when the host's tab closes, and the database rules let anyone with a
room code write anything.

`apps/server` replaces that with an authoritative server running this same
engine. A room owns the real `GameState`; clients send actions, the server
stamps the sender's seat on them, applies them, and sends each seat
`viewFor(state, seat)`: its own cards, face-down placeholders for everyone
else's, a deck of the right length with nothing in it, and no snapshots. The
view is still a `GameState`, so the web app renders and queries it with the
same code it uses for a local game. Bots run on the server, so a table keeps
playing with nobody's tab open, and a session token gets a reloading player
their seat back. Every server message carries the server's clock, and the
client judges time windows by it.

`packages/protocol` is the whole contract: `hello`, `create`/`join`, `sit`,
`bot`, `start`, `action`, `chat` one way; `room`, `state`, `refused`,
`chat` the other. One image (see `Dockerfile`) serves the web app and the
WebSocket on one port.

Rooms and sessions are persisted through a five-method `RoomStore`
interface: every room is written after every change (coalesced, atomic),
every session when it is made, and all of it is read back on boot, with the
bots and clocks picking up where they stopped. `FileStore` keeps JSON files
in `DATA_DIR`; `MemoryStore` is for tests. SQLite, Redis or a KV would be a
second class behind the same interface. A deploy therefore costs players a
reconnect, not the game.

The host-in-browser code (`net.js`) still works against the legacy UI and is
not being extended.

## Working on it

```bash
npm install
npm test                 # engine tests
npm run typecheck
npm run lint
```

Rules changes go in `packages/engine` with a test. Bot strategy changes go
in `packages/bots`; `npm test -w packages/bots` plays the games. Anything that is a
faithful port of a rule from the original is also a candidate to send back
upstream as a focused PR against `index.html`.
