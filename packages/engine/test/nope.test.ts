import { describe, expect, it } from "vitest";
import {
  answersFor, applyAction, canPlaceRoad, geometry, openEntries, totalRes, totalVP, type GameState,
} from "../src";
import { T0, bundle, card, cfg, dealTo, giveRes, must, noKittens, playSetup, refused, setRes, settle, tickThrough, toMain } from "./helpers";
import { createGame } from "../src";

function base(seed = 3): GameState {
  return noKittens(toMain(seed));
}
const nxt = (s: GameState, k = 1) => (s.cur + k) % s.players.length;
const last = (s: GameState) => s.journal[s.journal.length - 1];

describe("Noping a card", () => {
  it("cancels an Exploding Kitten thrown at you on your own turn: the hand comes back, both cards are spent", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, foe, "explode");
    s = dealTo(s, me, "nope");
    s = setRes(s, me, { wood: 2, ore: 2 });
    s = must(s, { type: "playCard", seat: foe, cardId: card(s, foe, "explode").id });
    s = must(s, { type: "pickSeat", seat: foe, target: me });
    expect(totalRes(s.players[me])).toBe(0);
    const e = last(s);
    expect(e.card?.key).toBe("explode");
    const answers = answersFor(s, "nope", me, T0);
    expect(answers.some((a) => "jid" in a && a.jid === e.id)).toBe(true);
    s = must(s, { type: "nope", seat: me, jid: e.id });
    expect(totalRes(s.players[me])).toBe(4);
    expect(s.players[me].cards.length).toBe(0);
    expect(s.players[foe].cards.length).toBe(0);
    expect(s.discard.filter((c) => c.key === "explode").length).toBe(1);
    expect(s.discard.filter((c) => c.key === "nope").length).toBe(1);
    expect(s.cur).toBe(me);
    expect(s.phase).toBe("main");
    expect(last(s).kind).toBe("defend");
    expect(last(s).spent).toMatchObject({ pid: me, key: "nope" });
  });
  it("you may not Nope your own card, and may not Nope what has fallen out of reach", () => {
    let s = base();
    const me = s.cur;
    s = dealTo(s, me, "skip"); s = dealTo(s, me, "nope");
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "skip").id });
    s = must(s, { type: "pickSeat", seat: me, target: nxt(s) });
    expect(refused(s, { type: "nope", seat: me, jid: last(s).id })).toBeTruthy();
  });
  it("a Noped roll is thrown again and the turn carries on", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, foe, "nope");
    const rollEntry = s.journal.find((e) => e.kind === "roll")!;
    const rollsBefore = s.diceLog.length;
    s = must(s, { type: "nope", seat: foe, jid: rollEntry.id });
    s = settle(s);
    expect(s.diceLog.length).toBe(rollsBefore + 1);
    expect(s.cur).toBe(me);
    expect(s.phase).toBe("main");
    expect(s.players[foe].cards.length).toBe(0);
  });
  it("your own roll is the one line of yours you may Nope", () => {
    let s = base();
    const me = s.cur;
    s = dealTo(s, me, "nope");
    const rollEntry = s.journal.find((e) => e.kind === "roll")!;
    expect(applyAction(s, { type: "nope", seat: me, jid: rollEntry.id }, T0).ok).toBe(true);
  });
});

describe("Noping a turn", () => {
  it("destroys everything the turn gained and hands back what it took, without refunding what was spent", () => {
    let s = noKittens(playSetup(createGame(cfg(4), 3)));
    const geo = geometry(s.board);
    const me = s.cur, foe = nxt(s), victim = nxt(s, 2);
    s = dealTo(s, foe, "nope");
    s = dealTo(s, me, "explode");
    s = setRes(s, me, { wood: 1, brick: 1 });
    s = setRes(s, victim, { ore: 3 });
    // Rolled with those hands in place, so the turn's own snapshot carries them.
    for (let k = 0; ; k++) { const t = structuredClone(s); t.rng = k; const r = applyAction(t, { type: "roll", seat: t.cur }, T0); if (r.ok && r.state.rolled![0] + r.state.rolled![1] !== 7 && totalRes(r.state.players[victim]) === 3 && s.players[me].res.wood + s.players[me].res.brick === totalRes(r.state.players[me])) { s = r.state; break; } }
    const bankOre = s.bank.ore;
    // Build a road (spends wood+brick), then explode the victim.
    const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
    s = must(s, { type: "placeRoad", seat: me, eid });
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "explode").id });
    s = must(s, { type: "pickSeat", seat: me, target: victim });
    expect(s.bank.ore).toBe(bankOre + 3);
    const roadsBefore = s.players[me].roads;
    s = must(s, { type: "nopeTurn", seat: foe });
    expect(s.eOwner[eid]).toBeNull();
    expect(s.players[me].roads).toBe(roadsBefore - 1);
    expect(totalRes(s.players[me])).toBe(0); // the road's cost is not refunded
    expect(s.players[victim].res.ore).toBe(3); // the explosion is undone
    expect(s.bank.ore).toBe(bankOre);
    expect(s.cur).toBe(foe); // the turn has moved on
    expect(s.phase).toBe("roll");
    expect(last(s).show).toBe("nope");
    expect(last(s).turn).toBe(s.turnCounter);
  });
  it("cannot be done by the player whose turn it is, nor while a forced Nope is pending", () => {
    const s = dealTo(base(), base().cur, "nope");
    expect(refused(s, { type: "nopeTurn", seat: s.cur })).toMatch(/own turn/);
  });
  it("a Nope can be Noped: the turn comes back exactly as it stood", () => {
    let s = base();
    const geo = geometry(s.board);
    const me = s.cur, a = nxt(s), b = nxt(s, 2);
    s = dealTo(s, a, "nope"); s = dealTo(s, b, "nope");
    s = giveRes(s, me, { wood: 1, brick: 1 });
    const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
    s = must(s, { type: "placeRoad", seat: me, eid });
    s = must(s, { type: "nopeTurn", seat: a });
    expect(s.eOwner[eid]).toBeNull();
    const nopeLine = last(s);
    s = must(s, { type: "nope", seat: b, jid: nopeLine.id });
    expect(s.eOwner[eid]).toBe(me);
    expect(s.cur).toBe(me);
    expect(s.phase).toBe("main");
    expect(s.players[a].cards.length).toBe(0); // the first Nope stays spent
    expect(s.players[b].cards.length).toBe(0);
    expect(s.discard.filter((c) => c.key === "nope").length).toBe(2);
    expect(s.log.some((l) => l.includes("gets their turn back"))).toBe(true);
  });
});

describe("Defuse", () => {
  it("reflects an Exploding Kitten back at the thrower", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, me, "explode"); s = dealTo(s, foe, "defuse");
    s = setRes(s, me, { wheat: 2 }); s = setRes(s, foe, { ore: 4 });
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "explode").id });
    s = must(s, { type: "pickSeat", seat: me, target: foe });
    expect(totalRes(s.players[foe])).toBe(0);
    const e = last(s);
    expect(answersFor(s, "defuse", foe, T0).length).toBe(1);
    s = must(s, { type: "defuse", seat: foe, jid: e.id });
    expect(totalRes(s.players[foe])).toBe(4);
    expect(totalRes(s.players[me])).toBe(0);
    expect(s.players[me].cards.length).toBe(0);
    expect(s.players[foe].cards.length).toBe(0);
    expect(last(s).kind).toBe("defend");
    expect(last(s).redo?.card.key).toBe("explode");
    expect(s.cur).toBe(me); // the attacker's turn goes on
  });
  it("cannot answer a card not aimed at you", () => {
    let s = base();
    const me = s.cur, foe = nxt(s), bystander = nxt(s, 2);
    s = dealTo(s, me, "skip"); s = dealTo(s, bystander, "defuse");
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "skip").id });
    s = must(s, { type: "pickSeat", seat: me, target: foe });
    expect(refused(s, { type: "defuse", seat: bystander, jid: last(s).id })).toMatch(/may not/);
  });
  it("a Defused Favor lets the defuser name their own demand", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = dealTo(s, me, "favor"); s = dealTo(s, foe, "defuse");
    s = setRes(s, me, { ore: 2, wheat: 1 }); s = setRes(s, foe, { sheep: 1 });
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "favor").id });
    s = must(s, { type: "pickSeat", seat: me, target: foe });
    s = must(s, { type: "favorDemand", seat: me, want: bundle({ sheep: 1, wood: 2 }) });
    expect(s.players[me].res.sheep).toBe(1);
    s = must(s, { type: "defuse", seat: foe, jid: last(s).id });
    expect(s.select).toMatchObject({ kind: "favor", actor: foe, target: me, synthetic: true });
    expect(s.players[foe].res.sheep).toBe(1); // handed back by the rewind
    s = must(s, { type: "favorDemand", seat: foe, want: bundle({ ore: 2, wheat: 1 }) });
    expect(s.players[foe].res).toEqual(bundle({ sheep: 1, ore: 2, wheat: 1 }));
    expect(totalRes(s.players[me])).toBe(0);
  });
  it("Noping a Defuse replays the original card at its first target", () => {
    let s = base();
    const me = s.cur, foe = nxt(s), third = nxt(s, 2);
    s = dealTo(s, me, "explode"); s = dealTo(s, foe, "defuse"); s = dealTo(s, third, "nope");
    s = setRes(s, me, { wheat: 2 }); s = setRes(s, foe, { ore: 4 });
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "explode").id });
    s = must(s, { type: "pickSeat", seat: me, target: foe });
    s = must(s, { type: "defuse", seat: foe, jid: last(s).id });
    s = must(s, { type: "nope", seat: third, jid: last(s).id });
    expect(totalRes(s.players[foe])).toBe(0);
    expect(totalRes(s.players[me])).toBe(2);
    expect(s.discard.filter((c) => c.key === "defuse").length).toBe(1);
    expect(s.discard.filter((c) => c.key === "nope").length).toBe(1);
  });
  it("buys one hand out of a seven's cut", () => {
    let s = base();
    s = structuredClone(s); s.phase = "roll";
    const fat = nxt(s);
    s = setRes(s, fat, { wood: 4, brick: 4 });
    s = dealTo(s, fat, "defuse");
    let hit: GameState | null = null;
    for (let k = 0; k < 600 && !hit; k++) {
      const t = structuredClone(s); t.rng = k;
      const r = applyAction(t, { type: "roll", seat: t.cur }, T0);
      if (r.ok && r.state.rolled![0] + r.state.rolled![1] === 7) hit = r.state;
    }
    s = hit!;
    expect(s.seven!.queue).toEqual([fat]);
    const rollEntry = s.journal.find((e) => e.kind === "roll" && e.show === "seven")!;
    s = must(s, { type: "defuse", seat: fat, jid: rollEntry.id });
    expect(totalRes(s.players[fat])).toBe(8);
    expect(s.seven).toBeNull();
    expect(s.select?.kind).toBe("robber");
  });
});

describe("the forced Nope on a win", () => {
  it("makes the next Nope-holder cancel the winning turn, and strips the Feral Kittens", () => {
    let s = base();
    const geo = geometry(s.board);
    const me = s.cur, holder = nxt(s, 2);
    s = structuredClone(s); s.winPoints = 3;
    s = dealTo(s, me, "vp");
    s = dealTo(s, holder, "nope");
    s = giveRes(s, me, { wood: 1, brick: 1 });
    const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
    s = must(s, { type: "placeRoad", seat: me, eid });
    expect(s.phase).not.toBe("over");
    expect(s.forcedNope).toEqual({ pid: holder, winner: me });
    expect(refused(s, { type: "endTurn", seat: me })).toMatch(/open window/);
    expect(refused(s, { type: "nopeTurn", seat: nxt(s) })).toBeTruthy();
    s = must(s, { type: "nopeTurn", seat: holder });
    expect(s.forcedNope).toBeNull();
    expect(s.winner).toBeNull();
    expect(s.players[me].cards.filter((c) => c.key === "vp").length).toBe(0);
    expect(totalVP(s, s.players[me])).toBe(2);
    expect(s.cur).toBe(nxt({ ...s, cur: me } as GameState));
    expect(last(s).wonBy).toBe(me);
  });
  it("only the winner may Nope the Nope that took their win", () => {
    let s = base();
    const geo = geometry(s.board);
    const me = s.cur, holder = nxt(s, 2), third = nxt(s, 3);
    s = structuredClone(s); s.winPoints = 3;
    s = dealTo(s, me, "vp"); s = dealTo(s, holder, "nope"); s = dealTo(s, third, "nope"); s = dealTo(s, me, "nope");
    s = giveRes(s, me, { wood: 1, brick: 1 });
    const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
    s = must(s, { type: "placeRoad", seat: me, eid });
    s = must(s, { type: "nopeTurn", seat: holder });
    const denial = last(s);
    expect(refused(s, { type: "nope", seat: third, jid: denial.id })).toMatch(/cancel the turn instead/);
    expect(answersFor(s, "nope", third, T0).some((a) => "jid" in a && a.jid === denial.id)).toBe(false);
    // The winner Nopes it back: the win returns, and the next holder is forced in turn.
    s = must(s, { type: "nope", seat: me, jid: denial.id });
    expect(s.forcedNope).toEqual({ pid: third, winner: me });
  });
  it("declares the win outright when nobody else holds a Nope", () => {
    let s = base();
    const geo = geometry(s.board);
    const me = s.cur;
    s = structuredClone(s); s.winPoints = 3;
    s = dealTo(s, me, "vp"); s = dealTo(s, me, "nope");
    s = giveRes(s, me, { wood: 1, brick: 1 });
    const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
    s = must(s, { type: "placeRoad", seat: me, eid });
    expect(s.phase).toBe("over");
  });
});

describe("the Imploding Kitten", () => {
  it("takes every hand, seals the turn against Nopes, and ends it on the clock", () => {
    let s = base();
    const me = s.cur, foe = nxt(s);
    s = structuredClone(s);
    s.deck = [{ id: 999, key: "implode", flavor: null, boughtTurn: -2 }];
    s = dealTo(s, foe, "nope");
    s = setRes(s, me, { wood: 1, brick: 1, sheep: 1 });
    s = setRes(s, foe, { ore: 5 });
    const everybodyElse = s.players.filter((p) => p.id !== me).reduce((t, p) => t + totalRes(p), 0);
    s = must(s, { type: "buyCards", seat: me, spend: bundle({ wood: 1, brick: 1, sheep: 1 }) });
    expect(totalRes(s.players[me])).toBe(everybodyElse);
    expect(s.players[me].res.ore).toBeGreaterThanOrEqual(5);
    for (const p of s.players) if (p.id !== me) expect(totalRes(p)).toBe(0);
    expect(s.implodeTurn).toBe(s.turnCounter);
    expect(s.implodeUntil).toBe(T0 + 20000);
    expect(openEntries(s, T0).length).toBe(0);
    expect(refused(s, { type: "nopeTurn", seat: foe })).toMatch(/imploded/);
    // A card thrown at the imploded player is refused too.
    s = dealTo(s, foe, "explode");
    expect(refused(s, { type: "playCard", seat: foe, cardId: card(s, foe, "explode").id })).toBeTruthy();
    s = must(s, { type: "tick" }, T0 + 19000);
    expect(s.cur).toBe(me);
    s = must(s, { type: "tick" }, T0 + 20001);
    expect(s.cur).toBe(foe);
    expect(s.implodeTurn).toBe(-1);
  });
  it("holds the whole table while the card is landing", () => {
    let s = base();
    const me = s.cur;
    s = structuredClone(s);
    s.implodeRevealMs = 5000;
    s.deck = [{ id: 999, key: "implode", flavor: null, boughtTurn: -2 }];
    s = setRes(s, me, { wood: 1, brick: 1, sheep: 1 });
    s = must(s, { type: "buyCards", seat: me, spend: bundle({ wood: 1, brick: 1, sheep: 1 }) });
    expect(refused(s, { type: "endTurn", seat: me }, T0 + 1000)).toMatch(/landing/);
    expect(applyAction(s, { type: "endTurn", seat: me }, T0 + 5001).ok).toBe(true);
  });
});

describe("the turn clock", () => {
  it("ends a turn that runs out, slides while held, and never exceeds a full turn", () => {
    let s = noKittens(toMain(3, 4, { turnSeconds: 30 }));
    const me = s.cur;
    expect(s.turnTimerUntil).toBe(T0 + 30000);
    s = tickThrough(s, T0, T0 + 10000);
    expect(s.cur).toBe(me);
    expect(s.turnTimerUntil).toBe(T0 + 30000);
    // Held while a robber is owed: the deadline slides along in front of the hold.
    s = dealTo(s, me, "knight");
    s = must(s, { type: "playCard", seat: me, cardId: card(s, me, "knight").id }, T0 + 10000);
    s = tickThrough(s, T0 + 10000, T0 + 25000);
    expect(s.turnTimerUntil).toBe(T0 + 45000);
    s = settle(s, T0 + 25000);
    s = tickThrough(s, T0 + 25000, T0 + 44750);
    expect(s.cur).toBe(me);
    s = tickThrough(s, T0 + 44750, T0 + 45250);
    expect(s.cur).not.toBe(me);
    expect(s.journal.some((e) => e.show === "timeout")).toBe(true);
  });
});
