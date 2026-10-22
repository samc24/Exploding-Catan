import { describe, expect, it } from "vitest";
import { EMOJIS } from "@exploding-catan/protocol";
import { applyAction, createGame, type GameConfig } from "@exploding-catan/engine";
import { createTable, createTauntMemory, heard, nextBotAction, nextTaunts } from "../src";

const cfg = (n: number): GameConfig => ({ players: Array.from({ length: n }, (_, i) => ({ name: "B" + i })), mode: "normal" });

describe("taunts", () => {
  it("only ever throws from the tray, from bot seats, with gaps, and says nothing during setup", () => {
    let s = createGame(cfg(4), 5);
    const table = createTable([1, 2, 3], 5); // seat 0 is a person
    const mem = createTauntMemory(5);
    let now = 1_000_000;
    const thrown: { seat: number; emoji: string; at: number; phase: string }[] = [];
    for (let i = 0; i < 1500 && s.phase !== "over"; i++) {
      now += 500;
      const a = nextBotAction(table, s, now);
      if (a) { const r = applyAction(s, a, now); if (r.ok) s = r.state; }
      else { const r = applyAction(s, { type: "tick" }, now); if (r.ok) s = r.state; if (s.cur === 0 && !s.phase.startsWith("setup")) { const e = applyAction(s, { type: s.phase === "roll" ? "roll" : "endTurn", seat: 0 }, now); if (e.ok) s = e.state; } else if (s.phase.startsWith("setup") && s.cur === 0) break; }
      for (const t of nextTaunts(table, mem, s, now)) thrown.push({ ...t, at: now, phase: s.phase });
    }
    for (const t of thrown) {
      expect(EMOJIS).toContain(t.emoji);
      expect([1, 2, 3]).toContain(t.seat);
      expect(t.phase.startsWith("setup")).toBe(false);
    }
    for (let i = 1; i < thrown.length; i++) if (thrown[i].phase !== "over") expect(thrown[i].at - thrown[i - 1].at).toBeGreaterThanOrEqual(2200);
  });
  it("is deterministic for a seed and reads only the journal", () => {
    const run = () => {
      let s = createGame(cfg(3), 9);
      const table = createTable([0, 1, 2], 9);
      const mem = createTauntMemory(9);
      let now = 0;
      const out: string[] = [];
      for (let i = 0; i < 600 && s.phase !== "over"; i++) {
        now += 400;
        const a = nextBotAction(table, s, now);
        const r = a ? applyAction(s, a, now) : applyAction(s, { type: "tick" }, now);
        if (r.ok) s = r.state;
        for (const t of nextTaunts(table, mem, s, now)) out.push(`${t.seat}${t.emoji}`);
      }
      return out;
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
  it("answers a person's chat sometimes, and never a bot's", () => {
    const table = createTable([1, 2], 1);
    const mem = createTauntMemory(1);
    let answered = 0;
    for (let i = 0; i < 200; i++) { const t = heard(table, mem, 0, i * 20_000); if (t) { answered++; expect([1, 2]).toContain(t.seat); } }
    expect(answered).toBeGreaterThan(10);
    expect(heard(table, mem, 1, 9e9)).toBeNull();
  });
});
