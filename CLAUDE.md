# Exploding Catan — working notes for Claude

A fork of a friend's single-file browser game, re-architected into a tested
engine, a browser app and an authoritative server. `docs/ARCHITECTURE.md` is
the design; `WORK_NOTES.md` is the running context; `/start` and `/end`
bracket a session.

## Conventions

- **Rules live in `packages/engine` and change only with a test.** A refusal
  is a `RuleError` via `refuse()`; anything else thrown is a bug by definition.
  Rules must stay faithful to the original game in `legacy/` unless Sameer
  decides otherwise.
- **Bots decide on `viewFor(state, seat)`**, never the raw state. Keep it that
  way; the fairness test depends on it.
- **No Claude attribution** on commits or PRs. None. Ever.
- **Branches off `master`, PRs into `master`** on `samc24/Exploding-Catan`.
  Pages deploys from `master` only after CI is green.
- **Checks before pushing:** `npm run typecheck && npm run lint && npm test
  && npm run build`. Browser tests: `npm run e2e -w apps/web` with the dev
  server up (`npm run dev -w apps/web`), and `npm run e2e:online -w apps/web`
  with the game server up too (`npm run dev -w apps/server`). CI runs all of
  it, including the browser tests on the runner's Chrome.
- **Shell cwd is shared between parallel tool calls**: use absolute paths in
  scripts, or chain `cd` and the command in one call.
- Feature parity with `legacy/` comes before new features (Sameer's rule).
  Known, accepted gaps: discard-pile browsing, Tips and Motion toggles.

## Current Focus

PR #1 (`rearchitecture` → `master`): the whole re-architecture plus the
review pass and the parity pass. Waiting on CI and Sameer's review/merge.
`master` is currently identical to upstream until the PR merges.

## Next Steps

1. Merge PR #1 (merge commit, not squash, to keep the history readable).
2. Hosting the server (tabled by Sameer; recommendation in memory: Fly.io, then
   point the Pages app's Online dialog at the `wss://` URL).
3. A mobile pass with a real phone in hand.
4. Any parity gaps Sameer notices while playing.

## Known gaps / parked

- Snapshot decks as ids (another ~2x on per-action clone size; medium risk).
- Further split of `apps/server/src/room.ts` (clocks and wire formatting).
- Board rebuild skipped by signature (2 ms per render; not worth a stale board).
