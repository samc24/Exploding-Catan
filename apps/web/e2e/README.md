# Browser smoke tests

These drive the real app in headless Chrome and fail on any page error.
They need the dev server running and Google Chrome installed:

```bash
npm run dev -w apps/web &      # http://localhost:5173
npm run e2e -w apps/web
```

`play-turns.mjs` starts a game, plays the opening, rolls and ends several
turns. `play-cards.mjs` injects kitten cards and walks Attack → Defuse →
discard, Favor, Nope, Alter the Future, an open trade and a purchase.
Screenshots land in `e2e/shots/` (ignored by git).
