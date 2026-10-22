# @exploding-catan/engine

The rules of Exploding Catan as a pure, deterministic, clockless reducer.

```ts
import { createGame, applyAction, viewFor } from "@exploding-catan/engine";

let state = createGame({ players: [{ name: "Red" }, { name: "Blue" }], mode: "normal" }, 42);
const r = applyAction(state, { type: "placeSettlement", seat: state.cur, vid: 10 }, Date.now());
if (r.ok) state = r.state; else console.log(r.error);
const mine = viewFor(state, 0);   // Blue's cards are hidden
```

See `docs/ARCHITECTURE.md` at the repository root for the design, and
`test/` for the rules written as examples.

| file | what |
|---|---|
| `types.ts` | every type; `GameState` is plain JSON |
| `constants.ts` | resources, costs, the 54-card deck, modes, boards |
| `rng.ts` | seeded PRNG kept on the state |
| `board.ts` | hex/vertex/edge geometry, ports, terrain dealing |
| `state.ts` | `createGame`, resources, VP, Longest Road, Largest Army, legality |
| `journal.ts` | snapshots, the action journal, who may answer what |
| `turn.ts` | setup, building, dice, the seven, the robber, ending turns, victory, clocks |
| `cards.ts` | buying, playing, aiming and resolving kitten cards |
| `answers.ts` | Nope and Defuse, cancelling a turn, the forced Nope |
| `trade.ts` | bank and player trades |
| `reduce.ts` | `applyAction`: validation and dispatch |
| `view.ts` | per-seat redaction of state and events |
