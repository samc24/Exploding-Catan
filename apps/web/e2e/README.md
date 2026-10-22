# Browser smoke tests

These drive the real app in headless Chrome and fail on any page error.
They need the dev server running and Google Chrome installed:

```bash
npm run dev -w apps/web &      # http://localhost:5173
npm run e2e -w apps/web
```

`lib.mjs` holds the shared helpers (launch, start a game, play the opening,
settle what is owed, fail on any page error). `play-turns.mjs` starts a game, plays the opening, rolls and ends several
turns. `play-cards.mjs` injects kitten cards and walks Attack → Defuse →
discard, Favor, Nope, Alter the Future, an open trade and a purchase.
`play-bots.mjs` lets three bots play a table. `play-phone.mjs` is a 390×844
touch screen: it drives a bank trade and a player trade by taps and checks
the phone layout holds (one header row, the composer as a sheet, the hand a
strip, the log a drawer). Screenshots land in `e2e/shots/` (ignored by git).

`play-online.mjs` (`npm run e2e:online -w apps/web`) needs the game server
too (`npm run dev -w apps/server`). It opens two browsers, hosts and joins a
table by code, adds a bot, plays the opening from both screens, checks each
screen is on its own seat, sends a chat line across, and reloads one player
to get their seat back.
