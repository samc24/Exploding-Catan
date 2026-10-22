# @exploding-catan/web

The browser app: Vite, TypeScript, plain DOM and SVG, no framework. Plays
hot-seat, against bots, or online against the server.

```bash
npm run dev          # http://localhost:5173
npm run build        # dist/
npm run e2e          # headless-Chrome smoke tests (dev server running)
npm run e2e:online   # the two-browser online test (game server running too)
```

`src/render.ts` rebuilds the page from the state; `src/main.ts` boots. See
`docs/ARCHITECTURE.md` for the rest.
