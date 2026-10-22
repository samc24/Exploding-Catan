# Exploding Catan

Catan with the development deck torn out and 54 kitten cards put in its place.
Play against bots, hot-seat on one screen, or online with up to six people.

**Play it:** https://samc24.github.io/Exploding-Catan/

A fork of [JP's original](https://themiamest.github.io/Exploding-Catan/),
rebuilt as a rules engine, bots, a browser app and a multiplayer server. The deck's design notes are in
[`docs/kitten-cards.txt`](docs/kitten-cards.txt).

## What is here

| | |
|---|---|
| `packages/engine` | the rules, as a pure deterministic reducer with no DOM, network or clock |
| `packages/bots` | the AI, a client of the engine that decides on its own redacted view |
| `packages/protocol` | the wire contract between browser and server |
| `apps/web` | the browser app: Vite, TypeScript, plain DOM and SVG |
| `apps/server` | authoritative multiplayer: rooms, bots, clocks, persistence, one WebSocket per tab |

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the pieces fit and why.

## Working on it

```bash
npm install
npm test                    # engine, bots and server tests
npm run typecheck && npm run lint
npm run dev -w apps/web     # http://localhost:5173
npm run dev -w apps/server  # ws://localhost:8787 (online play)
npm run e2e -w apps/web     # headless-Chrome smoke tests (needs the dev server)
```

Rules changes go in `packages/engine` with a test. Everything is TypeScript;
Node 22 or newer.

## License

The code is under the [PolyForm Noncommercial License 1.0.0](LICENSE): free
to use, change and share for non-commercial purposes. The Catan and Exploding
Kittens names, the card art and the music are their owners' and are not
covered; see [NOTICE.md](NOTICE.md) for that and for credits.
