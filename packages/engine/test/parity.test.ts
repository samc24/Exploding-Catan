/* Details JP's game shows that the engine has to carry for the screens to show them too. */
import { describe, expect, it } from "vitest";
import { applyAction, geometry, type GameState } from "../src";
import { T0, bundle, card, dealTo, must, noKittens, setRes, toMain } from "./helpers";

function base(seed = 3): GameState { return noKittens(toMain(seed)); }
const other = (s: GameState, k = 1) => (s.cur + k) % s.players.length;

describe("what the table is told", () => {
  it("every feed line says which turn it belongs to", () => {
    const s = must(base(), { type: "endTurn", seat: base().cur });
    const r = applyAction(s, { type: "roll", seat: s.cur }, T0 + 3500);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const feed = r.events.filter((e) => e.type === "feed");
    expect(feed.length).toBeGreaterThan(0);
    for (const e of feed) if (e.type === "feed") expect(typeof e.turn).toBe("number");
  });
  it("a robbery has a moment of its own: its line carries a show, like a card does", () => {
    let s = dealTo(base(), base().cur, "knight");
    const me = s.cur;
    const geo = geometry(s.board);
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "knight").id });
    expect(s.select).toMatchObject({ kind: "robber", actor: me });
    const hid = geo.hexes.find((hx) => hx.id !== s.robber && s.terrain[hx.id] !== "desert")!.id;
    const r = applyAction(s, { type: "pickHex", seat: me, hid }, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    if (s.select && s.select.kind === "victim") {
      const r2 = applyAction(s, { type: "pickVictim", seat: me, target: s.select.candidates[0] }, T0);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;
      s = r2.state;
      expect(r2.events.some((e) => e.type === "show" && e.what === "robbery")).toBe(true);
    } else {
      expect(r.events.some((e) => e.type === "show" && e.what === "robbery")).toBe(true);
    }
    const robbery = [...s.journal].reverse().find((e) => e.payload?.robber);
    expect(robbery?.show).toBe("robbery");
  });
  it("a rewind under a live offer takes the offer off the table, and says so", () => {
    let s = dealTo(base(), base().cur, "nope");
    const me = s.cur, foe = other(s);
    s = setRes(s, me, { wood: 2 });
    s = setRes(s, foe, { ore: 2 });
    s = must(s, { type: "offerTrade", seat: me, offer: bundle({ wood: 1 }), want: bundle({ ore: 1 }) });
    expect(s.trade).not.toBeNull();
    const roll = s.journal.find((e) => e.kind === "roll")!;
    const r = applyAction(s, { type: "nope", seat: me, jid: roll.id }, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.trade).toBeNull();
    expect(r.events.some((e) => e.type === "feed" && /trade on the table is off/.test(e.text))).toBe(true);
  });
  it("a settled trade is one line in the feed, not two", () => {
    let s = base();
    const me = s.cur, foe = other(s);
    s = setRes(s, me, { wood: 2 });
    s = setRes(s, foe, { ore: 2 });
    s = must(s, { type: "offerTrade", seat: me, offer: bundle({ wood: 1 }), want: bundle({ ore: 1 }) });
    s = must(s, { type: "answerTrade", seat: foe, accept: true });
    const r = applyAction(s, { type: "acceptTrade", seat: me, with: foe }, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.filter((e) => e.type === "feed" && /trade/.test(e.text)).length).toBe(1);
  });
});

describe("the portrait", () => {
  it("can be changed at any point in the game, by its owner, without touching the record", () => {
    const s = toMain(3);
    const me = s.cur, other = (me + 1) % s.players.length;
    const before = s.journal.length;
    const r = applyAction(s, { type: "setAvatar", seat: other, avatar: "9" }, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[other].avatar).toBe("9");
    expect(r.state.journal.length).toBe(before);
    expect(r.events.length).toBe(0);
  });
});
