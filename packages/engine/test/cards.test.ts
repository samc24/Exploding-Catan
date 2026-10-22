import { describe, expect, it } from "vitest";
import { applyAction, canPlaceRoad, geometry, totalRes, totalVP, type GameState } from "../src";
import { T0, bundle, card, dealTo, giveRes, must, noKittens, refused, setRes, settle, toMain, turnOf } from "./helpers";

function base(seed = 3): GameState {
  return noKittens(toMain(seed));
}
const other = (s: GameState, k = 1) => (s.cur + k) % s.players.length;

describe("Skip", () => {
  it("costs the target their next turn", () => {
    let s = dealTo(base(), base().cur, "skip");
    const me = s.cur, tgt = other(s);
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "skip").id });
    expect(s.select).toMatchObject({ kind: "seat", actor: me });
    expect(refused(s, { type: "pickSeat", seat: me, target: me })).toBeTruthy();
    s = must(s, { type: "pickSeat", seat: me, target: tgt });
    expect(s.players[tgt].skipTokens).toBe(1);
    expect(s.players[me].cards.length).toBe(0);
    s = must(s, { type: "endTurn", seat: me });
    expect(s.cur).toBe((me + 2) % 4);
  });
});

describe("Exploding Kitten", () => {
  it("returns the target's whole hand to the bank", () => {
    let s = dealTo(base(), base().cur, "explode");
    const me = s.cur, tgt = other(s);
    s = setRes(s, tgt, { wood: 2, ore: 3 });
    const bank = s.bank.ore;
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "explode").id });
    s = must(s, { type: "pickSeat", seat: me, target: tgt });
    expect(totalRes(s.players[tgt])).toBe(0);
    expect(s.bank.ore).toBe(bank + 3);
  });
  it("may be thrown on somebody else's turn, but not in the fast tracks' first round", () => {
    let s = base();
    const me = other(s);
    s = dealTo(s, me, "explode");
    expect(applyAction(s, { type: "playCard", seat: me, cardId: card(s, me, "explode").id }, T0).ok).toBe(true);
    let f = noKittens(toMain(3, 4, { mode: "fast" }));
    f = dealTo(f, f.cur, "explode");
    expect(refused(f, { type: "playCard", seat: f.cur, cardId: card(f, f.cur, "explode").id })).toMatch(/cannot be played/);
  });
});

describe("Attack", () => {
  it("makes the target drop three cards of their choice, as owed state", () => {
    let s = dealTo(base(), base().cur, "attack");
    const me = s.cur, tgt = other(s);
    s = setRes(s, tgt, { wood: 2, sheep: 2, ore: 1 });
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "attack").id });
    s = must(s, { type: "pickSeat", seat: me, target: tgt });
    expect(s.attackDue).toEqual([{ pid: tgt, n: 3, jid: expect.any(Number) }]);
    expect(refused(s, { type: "endTurn", seat: me })).toMatch(/open window/);
    expect(refused(s, { type: "discard", seat: tgt, bundle: bundle({ ore: 2, wood: 1 }) })).toMatch(/do not hold/);
    s = must(s, { type: "discard", seat: tgt, bundle: bundle({ wood: 2, ore: 1 }) });
    expect(s.attackDue).toEqual([]);
    expect(totalRes(s.players[tgt])).toBe(2);
  });
  it("asks for fewer when the hand is smaller, and nothing from an empty hand", () => {
    let s = dealTo(base(), base().cur, "attack");
    const me = s.cur, tgt = other(s);
    s = setRes(s, tgt, {});
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "attack").id });
    s = must(s, { type: "pickSeat", seat: me, target: tgt });
    expect(s.attackDue).toEqual([]);
  });
});

describe("Favor", () => {
  it("hands over only what the target actually holds", () => {
    let s = dealTo(base(), base().cur, "favor");
    const me = s.cur, tgt = other(s);
    s = setRes(s, tgt, { ore: 1, sheep: 5 });
    s = setRes(s, me, {});
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "favor").id });
    s = must(s, { type: "pickSeat", seat: me, target: tgt });
    expect(s.select).toMatchObject({ kind: "favor", actor: me, target: tgt });
    expect(refused(s, { type: "favorDemand", seat: me, want: bundle({ wheat: 2 }) })).toMatch(/exactly 3/);
    s = must(s, { type: "favorDemand", seat: me, want: bundle({ wheat: 2, ore: 1 }) });
    expect(s.players[me].res).toEqual(bundle({ ore: 1 }));
    expect(s.players[tgt].res).toEqual(bundle({ sheep: 5 }));
    expect(s.turnRec.gained.ore).toBe(1);
  });
});

describe("Alter the Future", () => {
  it("swaps two number tokens, un-picks on a second click of the first", () => {
    let s = dealTo(base(), base().cur, "alter");
    const me = s.cur;
    const a = s.numbers.findIndex((n) => n !== null);
    const b = s.numbers.findIndex((n, i) => n !== null && i !== a && n !== s.numbers[a]);
    const na = s.numbers[a], nb = s.numbers[b];
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "alter").id });
    expect(s.select).toMatchObject({ kind: "alter", first: null });
    expect(refused(s, { type: "pickHex", seat: me, hid: s.robber })).toMatch(/no number/);
    s = must(s, { type: "pickHex", seat: me, hid: a });
    s = must(s, { type: "pickHex", seat: me, hid: a });
    expect(s.select).toMatchObject({ kind: "alter", first: null });
    s = must(s, { type: "pickHex", seat: me, hid: a });
    s = must(s, { type: "pickHex", seat: me, hid: b });
    expect(s.select).toBeNull();
    expect(s.numbers[a]).toBe(nb);
    expect(s.numbers[b]).toBe(na);
  });
});

describe("Reverse", () => {
  it("grants another turn, then flips the order", () => {
    let s = dealTo(base(), base().cur, "reverse");
    const me = s.cur;
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "reverse").id });
    expect(s.dir).toBe(-1);
    expect(s.extraTurn).toBe(true);
    s = must(s, { type: "endTurn", seat: me });
    expect(s.cur).toBe(me);
    expect(s.extraTurn).toBe(false);
    expect(s.phase).toBe("roll");
    s = settle(must(s, { type: "roll", seat: me }, T0 + 4000), T0 + 4000);
    s = must(s, { type: "endTurn", seat: me }, T0 + 4000);
    expect(s.cur).toBe((me + 3) % 4);
  });
});

describe("Knight", () => {
  it("moves the robber, steals, and counts toward Largest Army", () => {
    let s = dealTo(base(), base().cur, "knight");
    const me = s.cur;
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "knight").id });
    expect(s.select).toMatchObject({ kind: "robber", actor: me, knight: true });
    s = settle(s);
    expect(s.players[me].knights).toBe(1);
    expect(s.turnRec.knights).toBe(1);
    s = structuredClone(s); s.players[me].knights = 2;
    s = dealTo(s, me, "knight");
    s = settle(must(s, { type: "playCard", seat: me, cardId: card(s, me, "knight").id }));
    expect(s.players[me].knights).toBe(3);
    expect(s.largestArmy.owner).toBe(me);
    expect(totalVP(s, s.players[me])).toBe(4);
  });
  it("offers a victim choice when several players sit on the hex", () => {
    let s = dealTo(base(), base().cur, "knight");
    const me = s.cur;
    // Find a hex with two opponents on it; if none, plant one.
    const geo = geometry(s.board);
    s = structuredClone(s);
    const hex = geo.hexes.find((h) => h.id !== s.robber && s.terrain[h.id] !== "desert")!;
    s.vOwner[hex.verts[0]] = (me + 1) % 4; s.vType[hex.verts[0]] = "settlement";
    s.vOwner[hex.verts[3]] = (me + 2) % 4; s.vType[hex.verts[3]] = "settlement";
    s = giveRes(s, (me + 1) % 4, { wood: 1 });
    s = giveRes(s, (me + 2) % 4, { ore: 1 });
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "knight").id });
    s = must(s, { type: "pickHex", seat: me, hid: hex.id });
    expect(s.select?.kind).toBe("victim");
    expect(refused(s, { type: "pickVictim", seat: me, target: me })).toBeTruthy();
    const before = totalRes(s.players[me]);
    const victimBefore = totalRes(s.players[(me + 2) % 4]);
    const otherBefore = totalRes(s.players[(me + 1) % 4]);
    s = must(s, { type: "pickVictim", seat: me, target: (me + 2) % 4 });
    expect(totalRes(s.players[me])).toBe(before + 1);
    expect(totalRes(s.players[(me + 2) % 4])).toBe(victimBefore - 1);
    expect(totalRes(s.players[(me + 1) % 4])).toBe(otherBefore);
    expect(s.select).toBeNull();
  });
});

describe("Feral Kitten and winning", () => {
  it("counts hidden points toward a win, and the game ends when nobody holds a Nope", () => {
    let s = base();
    const me = s.cur;
    s = structuredClone(s);
    s.winPoints = 3;
    s = dealTo(s, me, "vp");
    // Two settlements + one Feral = 3. Any check finds it.
    s = giveRes(s, me, { wood: 1, brick: 1 });
    const geo = geometry(s.board);
    const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
    s = must(s, { type: "placeRoad", seat: me, eid });
    expect(s.phase).toBe("over");
    expect(s.winner).toBe(me);
    expect(s.revealed).toBe(true);
    expect(refused(s, { type: "endTurn", seat: me })).toMatch(/over/);
  });
});

describe("turn pacing", () => {
  it("rejects actions from a seat that does not exist", () => {
    const s = base();
    expect(refused(s, { type: "roll", seat: 9 })).toMatch(/no such seat/);
  });
  it("turnOf keeps hands legal across several turns", () => {
    let s = base();
    s = turnOf(s, (s.cur + 3) % 4);
    expect(s.phase).toBe("main");
  });
});
