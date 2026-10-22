import { describe, expect, it } from "vitest";
import { applyAction, createGame, totalRes, totalVP, viewFor, type GameConfig, type GameState } from "@exploding-catan/engine";
import { createTable, nextBotAction, decide, createBot } from "../src";

const cfg = (n: number, extra: Partial<GameConfig> = {}): GameConfig => ({
  players: Array.from({ length: n }, (_, i) => ({ name: "Bot" + i })), mode: "normal", ...extra,
});

/** Four bots play to the end. Time advances so hand-over windows pass. */
function selfPlay(seed: number, n = 4, extra: Partial<GameConfig> = {}): { s: GameState; actions: number; refused: string[] } {
  let s = createGame(cfg(n, extra), seed);
  const table = createTable(s.players.map((p) => p.id), seed);
  let now = 1_000_000;
  const refused: string[] = [];
  let actions = 0;
  let idle = 0;
  while (s.phase !== "over" && actions < 6000) {
    now += 400;
    const a = nextBotAction(table, s, now);
    if (!a) {
      // Nothing to do: let clocks run (hand-over, implode) and try again.
      const t = applyAction(s, { type: "tick" }, now);
      if (t.ok) s = t.state;
      if (++idle > 200) throw new Error(`table wedged at turn ${s.turnCounter} phase ${s.phase} select ${JSON.stringify(s.select)} seven ${JSON.stringify(s.seven)} trade ${JSON.stringify(s.trade)} forced ${JSON.stringify(s.forcedNope)}`);
      continue;
    }
    idle = 0;
    const r = applyAction(s, a, now);
    actions++;
    if (!r.ok) {
      refused.push(`${a.type} by ${"seat" in a ? a.seat : "-"}: ${r.error}`);
      // A refused bot action must not wedge the table: fall back to ending the turn if it is theirs.
      if ("seat" in a && a.seat === s.cur && s.phase === "main") {
        const e = applyAction(s, { type: "endTurn", seat: a.seat }, now);
        if (e.ok) s = e.state;
      }
      if (refused.length > 50) throw new Error("too many refusals:\n" + refused.join("\n"));
      continue;
    }
    s = r.state;
  }
  return { s, actions, refused };
}

describe("self-play", () => {
  it("four bots finish a game, and every action they chose was legal", () => {
    const { s, actions, refused } = selfPlay(11);
    expect(refused).toEqual([]);
    expect(s.phase).toBe("over");
    expect(s.winner).not.toBeNull();
    expect(totalVP(s, s.players[s.winner!])).toBeGreaterThanOrEqual(s.winPoints);
    expect(actions).toBeGreaterThan(50);
  });
  it("finishes across many seeds, player counts and modes without a wedge", () => {
    const runs: [number, number, Partial<GameConfig>][] = [
      [1, 3, {}], [2, 4, { mode: "fast" }], [3, 5, { mode: "fastplus" }], [4, 6, { board: "large" }],
      [5, 2, {}], [6, 4, { winPoints: 8 }], [7, 4, { turnSeconds: 30 }], [8, 4, {}],
    ];
    for (const [seed, n, extra] of runs) {
      const { s, refused } = selfPlay(seed, n, extra);
      expect(refused, `seed ${seed}`).toEqual([]);
      expect(s.phase, `seed ${seed}`).toBe("over");
    }
  });
  it("is deterministic: the same seeds give the same game", () => {
    const a = selfPlay(21), b = selfPlay(21);
    expect(a.s.journal.map((e) => e.text)).toEqual(b.s.journal.map((e) => e.text));
    expect(a.s.winner).toBe(b.s.winner);
  });
  it("keeps the bank and hands consistent throughout", () => {
    const { s } = selfPlay(31);
    const perRes = s.board === "large" ? 24 : 19;
    for (const r of ["wood", "brick", "sheep", "wheat", "ore"] as const) {
      const inHands = s.players.reduce((t, p) => t + p.res[r], 0);
      expect(inHands + s.bank[r], r).toBe(perRes);
    }
    for (const p of s.players) expect(totalRes(p)).toBeGreaterThanOrEqual(0);
  });
});

describe("fairness", () => {
  it("a bot's decision does not change when other hands or the deck are permuted", () => {
    // Walk a game and, at every bot decision, check it is invariant to hidden information.
    let s = createGame(cfg(4), 77);
    const table = createTable([0, 1, 2, 3], 77);
    let now = 1_000_000;
    let checked = 0;
    for (let i = 0; i < 400 && s.phase !== "over"; i++) {
      now += 400;
      const a = nextBotAction(table, s, now);
      if (!a) { const t = applyAction(s, { type: "tick" }, now); if (t.ok) s = t.state; continue; }
      if ("seat" in a) {
        const fresh = () => createBot(a.seat, 5);
        const base = decide(fresh(), s, now);
        // The same decision from the redacted view a person at that seat would see…
        expect(decide(fresh(), viewFor(s, a.seat), now), `view: ${a.type} by ${a.seat}`).toEqual(base);
        // …and with the deck reversed and every other hand swapped for different cards.
        const scrambled = structuredClone(s);
        scrambled.deck.reverse();
        for (const p of scrambled.players) if (p.id !== a.seat) p.cards = p.cards.map((c) => ({ ...c, key: "vp" as const }));
        expect(decide(fresh(), scrambled, now), `${a.type} by ${a.seat}`).toEqual(base);
        checked++;
      }
      const r = applyAction(s, a, now);
      if (r.ok) s = r.state;
    }
    expect(checked).toBeGreaterThan(100);
  });
});
