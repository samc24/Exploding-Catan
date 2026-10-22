# @exploding-catan/server

The authoritative game server. It owns every room's real `GameState`, applies
actions through the engine with the sender's seat stamped on, drives the
bots, keeps the clocks, and sends each seat its own redacted view. A room
keeps playing when nobody has a tab open, and a player who reloads gets
their seat back by session token.

```bash
npm run dev -w apps/server        # ws://localhost:8787, serves apps/web/dist if built
curl localhost:8787/health
```

Environment: `PORT` (default 8787), `STATIC_DIR` (default `apps/web/dist`).

## Deploying

The `Dockerfile` at the repository root builds one image that serves both
the web app and the WebSocket on a single port, so the page connects to the
host it came from. Any container host works (Fly.io, Railway, Render, a
VPS). Rooms live in memory: one instance, and a restart ends games in
progress. Persisting rooms is the next step if that matters.

The GitHub Pages copy of the web app has no server; its Online dialog asks
for a server URL (`wss://…`) and remembers it.

## Protocol

`packages/protocol` is the whole contract. A client says `hello` with a
name and optional session token, then `create` or `join`, then `action`.
The server answers every change with a `room` (the lobby) or a `state`
(the redacted game plus the events that produced it), each carrying the
server's clock.
