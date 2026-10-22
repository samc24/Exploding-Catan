# Exploding Catan — work notes

Topic-grouped. Date-stamp time-sensitive facts inline. Session sections only
for decisions and things Sameer said; reference material goes under topics.

## The fork and the upstream

- Upstream: `themiamest/Exploding-Catan` (JP). Fork: `samc24/Exploding-Catan`.
  Forked 21/10/26 at upstream commit `84da989`; upstream has not moved since.
- The original (`index.html` 10.6k lines, `ai.js`, `net.js`, `art/`, JP's
  2.1k-line README of design notes) lives in `legacy/` as a pure rename, so
  `git merge upstream/master` still applies through rename detection.
- **Sending code upstream is not realistic**: JP values "double-click
  index.html, no build step", and the rules there are entangled with the
  DOM. Two review passes found no rule bug worth a PR. What could go back:
  a headless-Chrome smoke script adapted to his page, and the fairness-test
  idea for his `AI.selfCheck`. Offer as a conversation, not a PR.
- `legacy/firebase-config.js` points at JP's Firebase project; online play
  from the legacy copy writes to his database. The new server does not use it.

## Architecture (decided 21/10/26)

- Strangler-fig re-architecture, TypeScript + Vite + plain DOM/SVG (no
  React), authoritative server. See `docs/ARCHITECTURE.md`.
- `packages/engine`: pure reducer, seeded PRNG on the state, clock passed in,
  every decision is state not a dialog, `viewFor` returns a redacted
  `GameState` the UI can render unchanged. Journal snapshots trimmed to two
  turns back; `JOURNAL_KEEP=64`.
- `packages/bots`: `ai.js` ported as pure functions; bots decide on their own
  view; seeded by seat; taunts are a pure function over the journal.
- `apps/server`: rooms over WebSockets, bots and clocks server-side, per-seat
  views, `clock` message on event-less ticks, per-message deflate, session
  tokens, `RoomStore` persistence (`FileStore` in `DATA_DIR`, `MemoryStore`
  in tests). Client-chosen seeds refused unless `allowClientSeed` (tests).
- `apps/web`: `render.ts` rebuilds the page from state; `main.ts` boots;
  `screen.ts` holds screen-local state; `online.ts`, `input.ts`, `drag.ts`,
  `focus.ts`, `bots-host.ts`, `emotes.ts`, `game.ts`.

## Deliberate divergences from the original

- A Nope dropped on a log line strictly answers that line; cancelling the
  turn is an explicit choice. The chooser explains every option and what a
  cancelled turn would lose (`describeTurnGains`).
- Bots use seeded dice, so a given game does not unfold identically.
- Under a turn clock, a bot's trade offer to a human does not expire after 3s.
- The turn clock never pauses for a hidden host tab (there is no host tab).

## Parity status (22/10/26)

Done: Nope chooser with effects + highlight, card dragging (pile, log line,
hand reorder), dice history tab, bot taunts (local + server, including
replies to chat), turn-direction tag, board zoom/pan, fullscreen, emotes,
card-flight animations, phone drawer for the log.
Accepted gaps: discard-pile browsing, Tips/Motion toggles.

## Hosting (tabled by Sameer, 22/10/26)

Recommendation when revisited: Fly.io (`ewr`, ~$2–4/mo, Dockerfile as-is,
mount a volume on `/data`), Railway second. Cloud Run and Vercel are the
wrong shape for one long-lived stateful process; Cloudflare Durable Objects
is the long-term option but rewrites the room layer. The Pages copy has no
server; its Online dialog accepts any `wss://` URL.

## Testing and CI

- Unit: engine 73, bots 8, server 12 (`npm test`).
- Browser: `apps/web/e2e/*.mjs` on `playwright-core` + installed Chrome;
  `lib.mjs` shared helpers; all fail on any page error. `play-online.mjs`
  needs the game server.
- CI (`.github/workflows/ci.yml`): typecheck, lint, test, build, then an
  `e2e` job on the runner's Chrome. Pages (`pages.yml`) runs on CI success on
  `master` only; the `github-pages` environment allows `master` and `dev`.
- Local gotcha: `npm install` once hung on the network; `--offline` works
  when nothing new is needed.

## Deploy

- Pages: root = `legacy/`, `/new/` = `apps/web/dist`. Live at
  https://samc24.github.io/Exploding-Catan/new/ (last deployed from the
  parity commit before `master` was reset for PR #1).
- Docker: one image serving web + ws on one port, non-root, `/data` volume.

## Sessions

### 21–22/10/26 — the re-architecture
- Sameer chose strangler-fig, authoritative server, TS + plain DOM.
- Three review agents (engine; bots/server/protocol; web/tooling/upstream)
  reported; all "do first" items applied except snapshot-deck-as-ids and the
  further `room.ts` split (deferred, low urgency).
- Sameer's rules: feature parity before features; no Claude attribution in
  commits or PRs (all 15 commits rewritten to remove it).
- PR #1 opened: `rearchitecture` → `master`; `master` reset to upstream so
  the PR is the full reviewable diff.
