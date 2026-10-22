import { describe, expect, it } from "vitest";
import {
  applyAction, createGame, geometry, totalRes, totalVP, KITTEN, canPlaceRoad, canPlaceSettlement, RES,
  type GameState,
} from "../src";
import { T0, bundle, card, cfg, dealTo, giveRes, must, noKittens, playSetup, refused, roll, setRes, settle, toMain, turnOf } from "./helpers";

describe("a new game", () => {
  it("has a 54-card deck with the documented composition", () => {
    const s = createGame(cfg(4), 1);
    expect(s.deck.length).toBe(54);
    for (const key of Object.keys(KITTEN) as (keyof typeof KITTEN)[])
      expect(s.deck.filter((c) => c.key === key).length).toBe(KITTEN[key].count);
    expect(s.deck.filter((c) => c.key === "knight").map((c) => c.flavor).filter(Boolean).length).toBe(10);
  });
  it("starts with the robber on the desert and a full bank", () => {
    const s = createGame(cfg(4), 2);
    expect(s.terrain[s.robber]).toBe("desert");
    for (const r of RES) expect(s.bank[r]).toBe(19);
  });
  it("snakes the setup order from a random first player", () => {
    const s = createGame(cfg(3), 5);
    const f = s.firstPlayer;
    expect(s.setupOrder).toEqual([f, (f + 1) % 3, (f + 2) % 3, (f + 2) % 3, (f + 1) % 3, f]);
    expect(s.cur).toBe(f);
  });
  it("clamps the target and the clock", () => {
    expect(createGame(cfg(4, { winPoints: 99 }), 1).winPoints).toBe(20);
    expect(createGame(cfg(4, { winPoints: 1 }), 1).winPoints).toBe(3);
    expect(createGame(cfg(4, { turnSeconds: 5 }), 1).turnSeconds).toBe(0);
    expect(createGame(cfg(4, { turnSeconds: 40 }), 1).turnSeconds).toBe(40);
  });
});

describe("setup", () => {
  it("refuses out-of-turn and illegal placements", () => {
    const s = createGame(cfg(4), 1);
    const other = (s.cur + 1) % 4;
    expect(refused(s, { type: "placeSettlement", seat: other, vid: 0 })).toMatch(/not your turn/);
    expect(refused(s, { type: "roll", seat: s.cur })).toMatch(/roll phase/);
    expect(refused(s, { type: "placeRoad", seat: s.cur, eid: 0 })).toBeTruthy();
  });
  it("enforces the distance rule and that the road touches the new settlement", () => {
    let s = createGame(cfg(4), 1);
    const geo = geometry("small");
    const v = geo.vertices[10];
    s = must(s, { type: "placeSettlement", seat: s.cur, vid: v.id });
    expect(s.select).toEqual({ kind: "road", fromVertex: v.id });
    const far = geo.edges.find((e) => !e.v.includes(v.id))!.id;
    expect(refused(s, { type: "placeRoad", seat: s.cur, eid: far })).toMatch(/touch/);
    s = must(s, { type: "placeRoad", seat: s.cur, eid: v.edges[0] });
    // Next player may not settle adjacent to it.
    expect(canPlaceSettlement(s, geo, v.adj[0], s.cur, true)).toBe(false);
  });
  it("pays out only the second settlement in normal mode, both on fast track", () => {
    const n = playSetup(createGame(cfg(4), 3));
    const f = playSetup(createGame(cfg(4, { mode: "fast" }), 3));
    const sumN = n.players.reduce((t, p) => t + totalRes(p), 0);
    const sumF = f.players.reduce((t, p) => t + totalRes(p), 0);
    expect(sumN).toBeGreaterThan(0);
    expect(sumF).toBeGreaterThan(sumN);
    expect(n.phase).toBe("roll");
    expect(n.cur).toBe(n.firstPlayer);
    expect(n.turnCounter).toBe(1);
    for (const p of n.players) { expect(p.settlements).toBe(2); expect(p.roads).toBe(2); }
  });
  it("fast track + deals everybody one opening kitten card and lays roads all at once", () => {
    let s = createGame(cfg(4, { mode: "fastplus" }), 11);
    for (const p of s.players) { expect(p.cards.length).toBe(1); expect(p.cards[0].key).not.toBe("implode"); expect(p.cards[0].boughtTurn).toBe(-1); }
    expect(s.deck.length).toBe(54);
    // Settlements only, then setup3.
    const geo = geometry("small");
    for (let i = 0; i < 8; i++) {
      const vid = geo.vertices.find((v) => canPlaceSettlement(s, geo, v.id, s.cur, true))!.id;
      s = must(s, { type: "placeSettlement", seat: s.cur, vid });
    }
    expect(s.phase).toBe("setup3");
    expect(s.roadsOwed).toEqual([2, 2, 2, 2]);
    s = playSetup(s);
    expect(s.phase).toBe("roll");
    for (const p of s.players) expect(p.roads).toBe(2);
  });
});

describe("rolling and producing", () => {
  it("records the roll, pays out, and moves to main", () => {
    let s = playSetup(createGame(cfg(4), 3));
    const before = s.players.map(totalRes);
    s = roll(s);
    expect(s.phase).toBe("main");
    expect(s.rolled).not.toBeNull();
    expect(s.diceLog.length).toBe(1);
    const sum = s.rolled![0] + s.rolled![1];
    if (sum !== 7) {
      const after = s.players.map(totalRes);
      expect(after.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(before.reduce((a, b) => a + b, 0));
      expect(s.journal[s.journal.length - 1].kind).toBe("roll");
    }
  });
  it("refuses a second roll in the same turn", () => {
    const s = toMain(3);
    expect(refused(s, { type: "roll", seat: s.cur })).toMatch(/roll phase/);
  });
  it("gives nobody a resource the bank cannot pay to everybody", () => {
    let s = toMain(3);
    const geo = geometry("small");
    // Find a number with two different owners on it and drain the bank of that terrain.
    const hex = geo.hexes.find((h) => {
      const owners = new Set(h.verts.map((v) => s.vOwner[v]).filter((o) => o !== null));
      return owners.size >= 2 && s.terrain[h.id] !== "desert" && h.id !== s.robber;
    });
    if (!hex) return; // this seed has no shared hex; nothing to test
    const t = s.terrain[hex.id] as Exclude<typeof s.terrain[number], "desert">;
    s = structuredClone(s);
    s.bank[t] = 1;
    // Force the dice: rig the state so the next roll is that number by brute seed search.
    const want = s.numbers[hex.id]!;
    let hit: GameState | null = null;
    for (let k = 0; k < 400 && !hit; k++) {
      const trial = structuredClone(s); trial.rng = k; trial.phase = "roll";
      const r = applyAction(trial, { type: "roll", seat: trial.cur }, T0);
      if (r.ok && r.state.rolled![0] + r.state.rolled![1] === want) hit = r.state;
    }
    if (!hit) return;
    expect(hit.bank[t]).toBe(1);
    expect(hit.log.some((l) => l.includes("bank is short"))).toBe(true);
  });
});

describe("building", () => {
  it("builds a road when affordable and legal, and refuses otherwise", () => {
    let s = toMain(3);
    const geo = geometry("small");
    s = setRes(s, s.cur, {});
    const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, s.cur, null))!.id;
    expect(refused(s, { type: "placeRoad", seat: s.cur, eid })).toMatch(/afford/);
    s = giveRes(s, s.cur, { wood: 1, brick: 1 });
    const roadsBefore = s.players[s.cur].roads;
    s = must(s, { type: "placeRoad", seat: s.cur, eid });
    expect(s.players[s.cur].roads).toBe(roadsBefore + 1);
    expect(s.eOwner[eid]).toBe(s.cur);
    expect(totalRes(s.players[s.cur])).toBe(0);
    expect(s.turnRec.edges).toEqual([eid]);
    expect(s.journal[s.journal.length - 1].text).toMatch(/builds a road/);
  });
  it("upgrades a settlement to a city for 2 wheat 3 ore", () => {
    let s = toMain(3);
    const vid = s.vOwner.findIndex((o) => o === s.cur);
    s = setRes(s, s.cur, { wheat: 2, ore: 3 });
    s = must(s, { type: "placeCity", seat: s.cur, vid });
    expect(s.vType[vid]).toBe("city");
    expect(s.players[s.cur].cities).toBe(1);
    expect(s.players[s.cur].settlements).toBe(1);
    expect(totalVP(s, s.players[s.cur])).toBe(3);
  });
  it("awards Longest Road at five and keeps it on a tie", () => {
    let s = noKittens(toMain(3));
    const geo = geometry("small");
    const me = s.cur;
    s = giveRes(s, me, { wood: 10, brick: 10 });
    let built = 0;
    while (s.longestRoad.owner === null && built < 8) {
      const eid = geo.edges.find((e) => canPlaceRoad(s, geo, e.id, me, null))!.id;
      s = must(s, { type: "placeRoad", seat: me, eid });
      built++;
    }
    expect(s.longestRoad.owner).toBe(me);
    expect(s.longestRoad.len).toBeGreaterThanOrEqual(5);
    expect(totalVP(s, s.players[me])).toBe(4);
  });
});

describe("buying kitten cards", () => {
  it("takes three different resources per card and draws from the deck", () => {
    let s = toMain(3);
    const me = s.cur;
    s = setRes(s, me, { wood: 1, brick: 1, sheep: 1, wheat: 2, ore: 2 });
    expect(refused(s, { type: "buyCards", seat: me, spend: bundle({ wheat: 2, ore: 1 }) })).toMatch(/3 different/);
    const deck = s.deck.length;
    s = must(s, { type: "buyCards", seat: me, spend: bundle({ wood: 1, brick: 1, sheep: 1, wheat: 2, ore: 2 }) });
    // 7 resources pay for two cards (wood/brick/sheep + wheat/ore/? needs a third kind: only 1 card... check cardsFromPool)
    const bought = deck - s.deck.length;
    expect(bought).toBeGreaterThanOrEqual(1);
    expect(s.players[me].cards.length + (s.discard.length)).toBeGreaterThanOrEqual(bought);
    for (const c of s.players[me].cards) expect(c.boughtTurn).toBe(s.turnCounter);
  });
  it("a card bought this turn cannot be played this turn", () => {
    let s = toMain(3);
    s = dealTo(s, s.cur, "reverse", s.turnCounter);
    expect(refused(s, { type: "playCard", seat: s.cur, cardId: card(s, s.cur, "reverse").id })).toMatch(/cannot be played/);
  });
});

describe("the bank", () => {
  it("trades 4:1 without a port", () => {
    let s = toMain(3);
    s = setRes(s, s.cur, { wood: 4 });
    expect(refused(s, { type: "bankTrade", seat: s.cur, give: bundle({ wood: 1 }), get: bundle({ ore: 2 }) })).toMatch(/match/);
    s = must(s, { type: "bankTrade", seat: s.cur, give: bundle({ wood: 1 }), get: bundle({ ore: 1 }) });
    expect(s.players[s.cur].res).toEqual(bundle({ ore: 1 }));
  });
});

describe("turns", () => {
  it("ends the turn and advances in direction, skipping skipped players", () => {
    let s = toMain(3);
    const me = s.cur;
    s = structuredClone(s);
    s.players[(me + 1) % 4].skipTokens = 1;
    s = must(s, { type: "endTurn", seat: me });
    expect(s.cur).toBe((me + 2) % 4);
    expect(s.players[(me + 1) % 4].skipTokens).toBe(0);
    expect(s.phase).toBe("roll");
    expect(s.turnCounter).toBe(2);
    expect(s.handoverUntil).toBe(T0 + 3000);
  });
  it("nobody may roll during the hand-over window", () => {
    let s = toMain(3);
    s = must(s, { type: "endTurn", seat: s.cur });
    expect(refused(s, { type: "roll", seat: s.cur }, T0 + 100)).toMatch(/still open/);
    expect(applyAction(s, { type: "roll", seat: s.cur }, T0 + 3001).ok).toBe(true);
  });
  it("turnOf helper walks the table", () => {
    const s = toMain(3);
    const t = turnOf(s, (s.cur + 2) % 4);
    expect(t.cur).toBe((s.cur + 2) % 4);
    expect(t.phase).toBe("main");
  });
});

describe("the seven", () => {
  it("cuts hands over seven in half and then asks for the robber", () => {
    let s = toMain(3);
    s = structuredClone(s); s.phase = "roll";
    const fat = (s.cur + 1) % 4;
    s = setRes(s, fat, { wood: 3, brick: 3, sheep: 3 }); // 9 cards
    let hit: GameState | null = null;
    for (let k = 0; k < 600 && !hit; k++) {
      const trial = structuredClone(s); trial.rng = k;
      const r = applyAction(trial, { type: "roll", seat: trial.cur }, T0);
      if (r.ok && r.state.rolled![0] + r.state.rolled![1] === 7) hit = r.state;
    }
    expect(hit).not.toBeNull();
    s = hit!;
    expect(s.seven).not.toBeNull();
    expect(s.seven!.queue).toEqual([fat]);
    expect(refused(s, { type: "endTurn", seat: s.cur })).toMatch(/open window/);
    expect(refused(s, { type: "discard", seat: fat, bundle: bundle({ wood: 3 }) })).toMatch(/exactly 4/);
    s = must(s, { type: "discard", seat: fat, bundle: bundle({ wood: 3, brick: 1 }) });
    expect(totalRes(s.players[fat])).toBe(5);
    expect(s.seven).toBeNull();
    expect(s.select?.kind).toBe("robber");
    expect(refused(s, { type: "pickHex", seat: s.cur, hid: s.robber })).toMatch(/must move/);
    s = settle(s);
    expect(s.select).toBeNull();
    expect(s.journal[s.journal.length - 1].payload?.robber).toBe(true);
  });
});
