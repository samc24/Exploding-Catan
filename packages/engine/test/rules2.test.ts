/* The rules the reviewers found untested: robbery Defuse and its counter-Nope,
   Reverse under a Nope, bonus cards lost to a Noped turn, trades under a
   Nope, and the journal never losing a snapshot it may still need. */
import { describe, expect, it } from "vitest";
import {
  applyAction, canPlaceRoad, createGame, geometry, isSnapshot, totalRes, totalVP, NOPE_REACH, type GameState,
} from "../src";
import { T0, bundle, card, cfg, dealTo, giveRes, must, noKittens, playSetup, refused, setRes, settle, toMain } from "./helpers";

const nxt = (s: GameState, k = 1) => (s.cur + k) % s.players.length;
const last = (s: GameState) => s.journal[s.journal.length - 1];
function base(seed = 3): GameState { return noKittens(toMain(seed)); }

/** Plant a settlement for `pid` on a corner of a hex. */
function settleOn(s: GameState, pid: number, hid: number, corner = 0): GameState {
  const t = structuredClone(s);
  const vid = geometry(t.board).hexes[hid].verts[corner];
  t.vOwner[vid] = pid; t.vType[vid] = "settlement";
  return t;
}

describe("Defusing a robbery", () => {
  it("puts the robber and the stolen card back, hands the move to the defuser, and a Nope undoes all of that", () => {
    let s = base();
    const geo = geometry(s.board);
    const me = s.cur, victim = nxt(s), third = nxt(s, 2);
    s = dealTo(s, me, "knight"); s = dealTo(s, victim, "defuse"); s = dealTo(s, third, "nope");
    const target = geo.hexes.find((h) => h.id !== s.robber && s.terrain[h.id] !== "desert" && h.verts.every((v) => s.vOwner[v] === null))!;
    s = settleOn(s, victim, target.id, 0);
    s = setRes(s, victim, { ore: 3 }); s = setRes(s, me, {});
    const from = s.robber;
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "knight").id });
    s = must(s, { type: "pickHex", seat: me, hid: target.id });
    expect(s.players[me].res.ore).toBe(1);
    expect(s.players[me].knights).toBe(1);
    const robbery = last(s);
    expect(robbery.payload?.robber).toBe(true);
    expect(refused(s, { type: "defuse", seat: third, jid: robbery.id })).toMatch(/may not/);
    s = must(s, { type: "defuse", seat: victim, jid: robbery.id });
    expect(s.robber).toBe(from);
    expect(s.players[victim].res.ore).toBe(3);
    expect(s.players[me].res.ore).toBe(0);
    expect(s.players[me].knights).toBe(1); // the knight was played; the robbery is what was answered
    expect(s.select).toMatchObject({ kind: "robber", actor: victim, knight: false, noDefuse: true });
    const defuse = last(s);
    expect(defuse.unanswers).toBe(robbery.id);
    // A second Defuse from the same hex finds the robbery already answered.
    let again = settleOn(s, third, target.id, 3);
    again = dealTo(again, third, "defuse");
    expect(refused(again, { type: "defuse", seat: third, jid: robbery.id })).toBeTruthy();
    // The third player Nopes the Defuse: the robbery stands again, the robber move is withdrawn.
    s = must(s, { type: "nope", seat: third, jid: defuse.id });
    expect(s.select).toBeNull();
    expect(s.robber).toBe(target.id);
    expect(s.players[me].res.ore).toBe(1);
    expect(s.players[victim].cards.length).toBe(0); // the Defuse stays spent
    expect(s.cur).toBe(me);
  });
});

describe("Reverse under a Nope", () => {
  it("a Noped turn that played Reverse gets its direction and bonus turn taken back", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, me, "reverse"); s = dealTo(s, foe, "nope");
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "reverse").id });
    expect(s.dir).toBe(-1); expect(s.extraTurn).toBe(true);
    s = must(s, { type: "nopeTurn", seat: foe });
    expect(s.dir).toBe(1);
    expect(s.extraTurn).toBe(false);
    expect(s.cur).toBe(foe);
  });
  it("Noping the bonus turn keeps the already-reversed order", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, me, "reverse"); s = dealTo(s, foe, "nope");
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "reverse").id });
    s = must(s, { type: "endTurn", seat: me });
    expect(s.cur).toBe(me);
    s = settle(must(s, { type: "roll", seat: me }, T0 + 4000), T0 + 4000);
    s = must(s, { type: "nopeTurn", seat: foe }, T0 + 4000);
    expect(s.dir).toBe(-1);
    expect(s.cur).toBe((me + 3) % 4);
  });
});

describe("bonus cards on a Noped turn", () => {
  it("Largest Army taken with a third knight is lost when the turn is cancelled", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = structuredClone(s); s.players[me].knights = 2;
    s = dealTo(s, me, "knight"); s = dealTo(s, foe, "nope");
    s = settle(must(s, { type: "playCard", seat: me, cardId: card(s, me, "knight").id }));
    expect(s.largestArmy.owner).toBe(me);
    expect(totalVP(s, s.players[me])).toBe(4);
    s = must(s, { type: "nopeTurn", seat: foe });
    expect(s.players[me].knights).toBe(2);
    expect(s.largestArmy.owner).toBeNull();
    expect(totalVP(s, s.players[me])).toBe(2);
  });
  it("Longest Road taken this turn goes back when the turn is cancelled", () => {
    let s = base();
    const geo = geometry(s.board);
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, foe, "nope");
    s = giveRes(s, me, { wood: 6, brick: 6 });
    let built = 0;
    while (s.longestRoad.owner !== me && built < 6) {
      const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
      s = must(s, { type: "placeRoad", seat: me, eid });
      built++;
    }
    expect(s.longestRoad.owner).toBe(me);
    s = must(s, { type: "nopeTurn", seat: foe });
    expect(s.longestRoad.owner).toBeNull();
    expect(s.players[me].roads).toBe(2);
  });
});

describe("trades under a Nope", () => {
  it("a cancelled turn undoes an accepted trade on both sides, with the bank conserved", () => {
    let s = noKittens(playSetup(createGame(cfg(4), 3)));
    const me = s.cur, partner = nxt(s), foe = nxt(s, 2);
    s = dealTo(s, foe, "nope");
    s = setRes(s, me, { wood: 2 }); s = setRes(s, partner, { ore: 2 });
    for (let k = 0; ; k++) { const t = structuredClone(s); t.rng = k; const r = applyAction(t, { type: "roll", seat: t.cur }, T0); if (r.ok && r.state.rolled![0] + r.state.rolled![1] !== 7 && totalRes(r.state.players[me]) === 2 && totalRes(r.state.players[partner]) === 2) { s = r.state; break; } }
    s = must(s, { type: "offerTrade", seat: me, offer: bundle({ wood: 1 }), want: bundle({ ore: 1 }) });
    s = must(s, { type: "answerTrade", seat: partner, accept: true });
    s = must(s, { type: "acceptTrade", seat: me, with: partner });
    expect(s.players[me].res).toEqual(bundle({ wood: 1, ore: 1 }));
    expect(s.players[partner].res).toEqual(bundle({ wood: 1, ore: 1 }));
    s = must(s, { type: "nopeTurn", seat: foe });
    expect(s.players[me].res).toEqual(bundle({ wood: 1 }));
    expect(s.players[partner].res).toEqual(bundle({ ore: 2 }));
    for (const r of ["wood", "brick", "sheep", "wheat", "ore"] as const)
      expect(s.players.reduce((t, p) => t + p.res[r], 0) + s.bank[r], r).toBe(19);
  });
  it("a rewind withdraws an open offer", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, foe, "nope");
    s = giveRes(s, me, { wood: 1 });
    s = must(s, { type: "offerTrade", seat: me, offer: bundle({ wood: 1 }), want: bundle({ ore: 1 }) });
    expect(s.trade).not.toBeNull();
    expect(s.trade!.since).toBe(T0);
    s = must(s, { type: "nopeTurn", seat: foe });
    expect(s.trade).toBeNull();
  });
});

describe("the journal", () => {
  it("never drops a snapshot a line within reach could still need", () => {
    let s = noKittens(toMain(5));
    for (let turn = 0; turn < 40 && s.phase !== "over"; turn++) {
      const me = s.cur;
      s = giveRes(s, me, { wood: 1, brick: 1 });
      const geo = geometry(s.board);
      const e = geo.edges.find((x) => canPlaceRoad(s, geo, x.id, me, null));
      if (e) { const r = applyAction(s, { type: "placeRoad", seat: me, eid: e.id }, T0); if (r.ok) s = r.state; }
      for (const entry of s.journal.slice(-NOPE_REACH))
        if (entry.turn >= s.turnCounter - 1 && entry.nopeable && !entry.notice) expect(isSnapshot(entry.snap), `turn ${s.turnCounter}`).toBe(true);
      s = must(s, { type: "endTurn", seat: me });
      s = settle(must(s, { type: "roll", seat: s.cur }, T0 + (turn + 1) * 5000), T0 + (turn + 1) * 5000);
    }
  });
});
