import {
  applyAction, createGame, geometry, canPlaceRoad, canPlaceSettlement, discardOwed, RES,
  type Action, type Bundle, type GameConfig, type GameState, type Card, type CardKey,
} from "../src";

export const T0 = 1_000_000; // a fixed wall clock for tests

export function cfg(n = 4, extra: Partial<GameConfig> = {}): GameConfig {
  return { players: Array.from({ length: n }, (_, i) => ({ name: "P" + i })), mode: "normal", ...extra };
}

/** Apply and assert success. */
export function must(s: GameState, a: Action, now = T0): GameState {
  const r = applyAction(s, a, now);
  if (!r.ok) throw new Error(`${a.type} refused: ${r.error}`);
  return r.state;
}
/** Apply and assert refusal; returns the error. */
export function refused(s: GameState, a: Action, now = T0): string {
  const r = applyAction(s, a, now);
  if (r.ok) throw new Error(`${a.type} was accepted but should have been refused`);
  return r.error;
}

export function bundle(b: Partial<Bundle>): Bundle {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, ...b };
}

/** Play the whole opening with the first legal spot each time. */
export function playSetup(s: GameState): GameState {
  const geo = geometry(s.board);
  let guard = 0;
  while (s.phase.startsWith("setup") && guard++ < 200) {
    if (s.phase === "setup3") {
      const seat = s.roadsOwed!.findIndex((n) => n > 0);
      const eid = geo.edges.findIndex((e) => {
        const r = applyAction(s, { type: "placeRoad", seat, eid: e.id }, T0);
        return r.ok;
      });
      s = must(s, { type: "placeRoad", seat, eid });
      continue;
    }
    const sel = s.select!;
    if (sel.kind === "settlement") {
      // Spread players out so everybody has room: prefer vertices touching three hexes.
      const vid = geo.vertices.find((v) => v.hexes.length === 3 && canPlaceSettlement(s, geo, v.id, s.cur, true))!.id;
      s = must(s, { type: "placeSettlement", seat: s.cur, vid });
    } else if (sel.kind === "road") {
      const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, s.cur, sel.fromVertex))!.id;
      s = must(s, { type: "placeRoad", seat: s.cur, eid });
    } else throw new Error("unexpected setup select " + sel.kind);
  }
  if (s.phase.startsWith("setup")) throw new Error("setup did not finish");
  return s;
}

/** Answer whatever the table is owed with the dullest legal choice. */
export function settle(s: GameState, now = T0): GameState {
  const geo = geometry(s.board);
  let guard = 0;
  for (;;) {
    if (guard++ > 100) throw new Error("settle looped");
    const owed = discardOwed(s);
    if (owed) {
      const p = s.players[owed.pid];
      const b = bundle({});
      let left = owed.n;
      for (const r of RES) { const n = Math.min(left, p.res[r]); b[r] = n; left -= n; }
      s = must(s, { type: "discard", seat: owed.pid, bundle: b }, now);
      continue;
    }
    const sel = s.select;
    if (sel && sel.kind === "robber") {
      // A hex with nobody on it, if there is one, so nothing is stolen.
      const empty = geo.hexes.find((h) => h.id !== s.robber && h.verts.every((v) => s.vOwner[v] === null));
      const hid = empty ? empty.id : geo.hexes.find((h) => h.id !== s.robber)!.id;
      s = must(s, { type: "pickHex", seat: sel.actor, hid }, now);
      continue;
    }
    if (sel && sel.kind === "victim") {
      s = must(s, { type: "pickVictim", seat: sel.actor, target: sel.candidates[0] }, now);
      continue;
    }
    return s;
  }
}

/** Roll, then settle anything a seven asked for. */
export function roll(s: GameState, now = T0): GameState {
  return settle(must(s, { type: "roll", seat: s.cur }, now), now);
}

/** Get a fresh game to the start of the first main phase, with a given hand size cap avoided. */
export function toMain(seed = 1, n = 4, extra: Partial<GameConfig> = {}): GameState {
  let s = createGame(cfg(n, extra), seed);
  s = playSetup(s);
  return roll(s);
}

export function card(s: GameState, seat: number, key: CardKey): Card {
  const c = s.players[seat].cards.find((x) => x.key === key);
  if (!c) throw new Error(`seat ${seat} holds no ${key}`);
  return c;
}

let nextId = 50000;
/** Put a card straight into a hand (tests only). Bought last turn, so playable. */
export function dealTo(s: GameState, seat: number, key: CardKey, boughtTurn = -1): GameState {
  const t = structuredClone(s);
  t.players[seat].cards.push({ id: nextId++, key, flavor: key === "knight" ? "Taco Cat" : null, boughtTurn });
  return t;
}
export function giveRes(s: GameState, seat: number, b: Partial<Bundle>): GameState {
  const t = structuredClone(s);
  for (const r of RES) { const n = b[r] ?? 0; t.players[seat].res[r] += n; t.bank[r] -= n; }
  return t;
}
export function setRes(s: GameState, seat: number, b: Partial<Bundle>): GameState {
  const t = structuredClone(s);
  for (const r of RES) { t.bank[r] += t.players[seat].res[r]; t.players[seat].res[r] = b[r] ?? 0; t.bank[r] -= t.players[seat].res[r]; }
  return t;
}
/** Everybody's hand emptied of kitten cards, so nothing surprising answers. */
export function noKittens(s: GameState): GameState {
  const t = structuredClone(s);
  for (const p of t.players) p.cards = [];
  return t;
}
export function total(b: Bundle): number {
  return RES.reduce((t, r) => t + b[r], 0);
}
/** Pass turns until it is `seat`'s main phase. Hands are kept under eight so no discards arise. */
export function turnOf(s: GameState, seat: number, now = T0): GameState {
  let guard = 0;
  while (s.cur !== seat || s.phase !== "main") {
    if (guard++ > 40) throw new Error("turnOf looped");
    if (s.phase === "main") s = must(s, { type: "endTurn", seat: s.cur }, now);
    else if (s.phase === "roll") s = roll(s, now += 5000);
    else throw new Error("unexpected phase " + s.phase);
  }
  return s;
}

/** Tick the host clock every 250ms from `from` to `to`, the way a running table does. */
export function tickThrough(s: GameState, from: number, to: number, step = 250): GameState {
  for (let t = from + step; t <= to; t += step) s = must(s, { type: "tick" }, t);
  return s;
}
