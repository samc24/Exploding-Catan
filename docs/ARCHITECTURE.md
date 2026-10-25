# Architecture

This fork is re-architecting Exploding Catan from a single 10,000-line
`index.html` into something that can be developed, tested and run as a public
service, without losing the rules that make it the game it is.

## The shape we are moving to

```
packages/
  engine/      pure TypeScript rules engine — no DOM, no network, no clock
  bots/        the AI, as a client of the engine: decide(bot, view) → action
  protocol/    the wire contract between client and server
apps/
  web/         the browser UI: Vite + TypeScript, plain DOM and SVG, built on
               the engine; the same screens for a local game and a server view
  server/      authoritative multiplayer: owns every room's real state, runs
               the engine and the bots, sends each seat its own redacted view
```

Published by the Pages workflow once CI is green on `master`: the web app
is the site root, and `/new/`, where it lived during the rebuild, redirects
there. The original single-file game is no longer in this repo; it is still
playable at the upstream author's site. Work happens on branches off
`master`.

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
* **Refusals are not crashes.** A rule that says no throws `RuleError`
  and `applyAction` returns it as `{ ok: false, error }`; anything else is
  a bug and is thrown, so a server never plays on past a crash it mistook
  for a refusal.
* **Decisions are state, not dialogs.** Everything the original game asked for
  in a modal — a discard, a victim, three cards for a Favor, two tokens for an
  Alter — is a field on the state (`seven`, `attackDue`, `select`,
  `forcedNope`, `trade`) that the UI renders and the bots answer. Nothing can
  be lost by closing a window, because there are no windows.
* **Events for the UI.** Each action returns a list of what happened
  (`production`, `cards`, `kitten`, `show`, `feed`…) so a renderer can animate
  it without reverse-engineering a state diff. `eventsFor(events, seat)`
  redacts them per seat.

### The files

`state.ts` creates a game and holds the small helpers; `reduce.ts` is the
one entry point, `applyAction`; `turn.ts` is the turn flow (setup,
building, dice, the seven and the robber, ending a turn, the ticks);
`clock.ts` the turn timer and the Imploding Kitten's twenty seconds;
`victory.ts` who has won and who is forced to Nope it; `cards.ts` the kitten
cards; `answers.ts` Nope and Defuse; `journal.ts` the record with its
snapshots and the discard pile; `trade.ts`; `view.ts` what one seat may
see; `answers-query.ts` what a card could answer right now, for a UI.

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

`apps/web` has no framework: plain DOM and SVG, one `render()` that rebuilds
each region of the page from the state. The source is laid out in layers,
and imports only point downwards:

```
src/
  main.ts        boot and wiring only: buttons, menus, the store subscriber
  app/           the screen's own logic
    render.ts    one function, every region, from the state
    events.ts    one action's events → flights, reveals, sounds, standings
    clocks.ts    the turn timer and the Imploding Kitten's banner, painted in
                 place; the local host clock
    screen.ts    screen-local state (armed spot, viewed seat, open composer,
                 the feed lines), the standing advice and passing hints, and
                 the one way to ask for a repaint
    focus.ts     which seat this screen is on (follows whoever owes an answer)
    online.ts    the connection's handlers, the lobby flow, chat, the
                 server's clock, portraits
    game.ts      starting and resuming a local game
    bots-host.ts the bot driver at a local table (the server's twin)
    layout.ts    phone or not: the emoji button, its tray and the direction
                 tag move between the header and the strip
  input/         gestures → actions: clicks and arming (input.ts), dragging a
                 card (drag.ts), zoom and pan (boardview.ts)
  net/           the WebSocket (net.ts) and its dialogs (lobby.ts)
  state/         the store (the one GameState, local or from the server) and
                 the remembered settings (Motion, Tips)
  media/         art paths, sound effects, music, emotes
  ui/            drawing (column.ts is the strip's toggles). Each file draws
                 one region from a GameState and the
                 callbacks it is given; nothing in ui/ imports from app/,
                 input/ or net/, so a region can be read on its own.
  styles/        one CSS file per region, imported in cascade order by
                 style.css; phone.css holds EVERY small-screen override and is
                 imported last, because an equal-specificity rule written
                 later wins and a phone rule inside a topic file would lose to
                 any desktop rule after it.
```

The table is laid out as JP's (PR #23): a strip of buttons at the board's
top-left (Game log, Dice history, Chat, Emoji, the direction tag), the log
floating under it over the board, and the dice history, the chat and the
emoji tray hanging off the strip, only one of them out at a time; the dice
top-right with the zoom buttons under them; the two piles bottom-right; the
decisions column (`#panels`) down the right, over the deck. On a phone the
same column is a drawer behind the header's Log button, and the emoji button
and direction tag move up into the header.

Three rules the screen keeps:

* **Compare before writing.** The feed, the seat strip, the bottom bar, the
  dice and the pile are rebuilt only when what they show has changed. A
  rebuild throws away every animation running inside the region, restarts
  the portraits' images, drops the card being hovered and forces a layout
  of the page. A tick that moved nothing but the clocks repaints the clocks
  in place.
* **Decisions are panels, not modals.** Everything the engine says is owed
  (`discardOwed`, `select`, `forcedNope`, `trade`) is drawn as a panel for
  the seat that owes it, and the screen follows that seat. Nothing is modal
  except menus, so nothing the game needs can be dismissed.
* **Gestures are not rules.** Arming a spot on the first click, what a drop
  on the pile answers, when the chooser opens: `input/` decides, using the
  engine's queries (`answersFor`, `canPlayToPile`, `seatPickable`). A card
  can be clicked or dragged: onto the pile to play it or answer with it,
  onto an open log line to answer that line, within the hand to reorder. A
  Nope or Defuse with more than one thing to answer opens a chooser built
  from `answersFor`, which gives each choice a label and a sentence saying
  what it does.

What you can see happen is decoration layered over the state, never read
back by the rules: reveals queue in the middle of the board (`ui/showcase`),
cards fly and rest at both ends with the counters holding until they land
(`ui/fx`), pieces come down where they are placed, hexes flash, the robber
and a swapped token pulse. All of it is driven off events and off what
changed on the board between two renders, so watching somebody else act
looks the same as acting. The Motion setting (full / calm / off) governs it.

`e2e/` holds headless-Chrome tests that play through setup, turns, every
kitten card flow, a table of bots, a phone, and two browsers at one server
table; they fail on any page error. They run with Motion set to full.

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

A seat is one of three things: a bot nobody has sat in, a person who is
here, and a person who has gone. A dropped connection starts a twelve
second clock rather than a takeover; past it, mid-game, the seat is marked
away and a bot plays it (the chair stays theirs, and coming back hands it
straight back), while in the lobby the chair simply frees. Anybody with the
code may take an empty chair, lobby or mid-game: their own first, else a
never-sat bot, else an abandoned seat; a reconnect never takes a chair that
was not already theirs. The room tells the table in `notice` messages (who
sat down, who left, why there is no chair).

`packages/protocol` is the whole contract: `hello`, `create`/`join`, `sit`,
`bot`, `start`, `action`, `chat` one way; `room`, `state`, `refused`,
`chat`, `notice` the other. One image (see `Dockerfile`) serves the web app and the
WebSocket on one port.

Rooms and sessions are persisted through a five-method `RoomStore`
interface: every room is written after every change (coalesced, atomic),
every session when it is made, and all of it is read back on boot, with the
bots and clocks picking up where they stopped. `FileStore` keeps JSON files
in `DATA_DIR`; `MemoryStore` is for tests. SQLite, Redis or a KV would be a
second class behind the same interface. A deploy therefore costs players a
reconnect, not the game.

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
