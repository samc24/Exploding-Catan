# Exploding Catan — working notes for Codex

A fork of a friend's single-file browser game, re-architected into a tested
engine, a browser app and an authoritative server. `docs/ARCHITECTURE.md` is
the design; `WORK_NOTES.md` is the running context; `/start` and `/end`
bracket a session.

## Conventions

- **Rules live in `packages/engine` and change only with a test.** A refusal
  is a `RuleError` via `refuse()`; anything else thrown is a bug by definition.
  Rules must stay faithful to JP's original game (now only at his site,
  https://themiamest.github.io/Exploding-Catan/; `legacy/` was removed in
  PR #5) unless Sameer decides otherwise.
- **Bots decide on `viewFor(state, seat)`**, never the raw state. Keep it that
  way; the fairness test depends on it.
- **No Codex attribution** on commits or PRs. None. Ever.
- **Branches off `master`, PRs into `master`** on `samc24/Exploding-Catan`.
  Pages deploys from `master` only after CI is green.
- **Checks before pushing:** `npm run typecheck && npm run lint && npm test
  && npm run build`. Browser tests: `npm run e2e -w apps/web` with the dev
  server up (`npm run dev -w apps/web`), and `npm run e2e:online -w apps/web`
  with the game server up too (`npm run dev -w apps/server`). CI runs all of
  it, including the browser tests on the runner's Chrome.
- **Shell cwd is shared between parallel tool calls**: use absolute paths in
  scripts, or chain `cd` and the command in one call.
- Feature parity with the original came before new features (Sameer's
  rule); it is done. Known, accepted gaps: discard-pile browsing, Tips and
  Motion toggles.
- Browser tests: `E2E_PHONE=1` runs any of them as a 390×844 touch screen.
  A reload in a test must go through `reloadInto(page)` (the front door
  offers a saved game; it no longer auto-resumes).
- **License is PolyForm Noncommercial 1.0.0, on purpose.** Never switch to
  MIT: Sameer wants the option to go proprietary after a rebrand.

## Current Focus

Merged on 22/10/26: PR #1 (re-architecture + parity), #3 (soundtrack,
effects, settings), #4 (landing, warm theme, portraits, chat, emoji), #5 (web
app at the site root; `legacy/` removed), #6 (phone pass, slower pacing,
bots withdraw unanswered offers, front door with Continue/Leave), #7
(PolyForm Noncommercial 1.0.0 + NOTICE.md), #8 (second phone pass:
landscape grid layout, furniture strip + log ticker upright, seat-strip
follow fix, Add-to-Home-Screen tip), #9 (server address baked into the
Pages build; Online dialog asks for a name + room code; Render free host),
#10 (Dockerfile copy-layout fix), #11 (portrait picked on Play online,
server wake-up retries, emotes fill the portrait), #12 (landing first,
online resume behind it), #13 (deck sells cards, React tag). No branch open.
Live: https://samc24.github.io/Exploding-Catan/ — online play works there;
the server is https://exploding-catan.onrender.com (Render free plan,
sleeps when idle, wakes in ~1 min; `render.yaml`).

## Next Steps

1. Sameer tries the phone build again once Pages has deployed #8, ideally
   from the Home Screen (standalone: no browser bars). Still unchecked on
   a real phone: safe areas in landscape, the hold-to-drag feel.
2. Sameer asks JP for a one-line OK on the fork's license (his repo has none).
3. Hosting: done free on Render (22/10/26). When always-on is worth $2–4/mo,
   deploy `fly.toml` and change `VITE_SERVER_URL` in `pages.yml`.
4. New features. Later: rebrand away from Catan / Exploding Kittens names,
   art and music before any monetising; the license may tighten then.

## Known gaps / parked

- Snapshot decks as ids (another ~2x on per-action clone size; medium risk).
- Further split of `apps/server/src/room.ts` (clocks and wire formatting).
- Board rebuild skipped by signature (2 ms per render; not worth a stale board).
