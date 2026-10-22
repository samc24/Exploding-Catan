import { describe, expect, it } from "vitest";
import { applyAction, createGame, viewFor, type GameConfig, type GameState } from "@exploding-catan/engine";
import { createBot, createTable, decide, nextBotAction } from "../src";
import { TRADE_PATIENCE_MS } from "../src/agent";

const cfg = (n: number): GameConfig => ({ players: Array.from({ length: n }, (_, i) => ({ name: "Bot" + i })), mode: "normal" });

/** Bots play until some seat is in its main phase with nothing owed. */
function toMain(seed: number): { s: GameState; now: number } {
  let s = createGame(cfg(3), seed);
  const table = createTable(s.players.map((p) => p.id), seed);
  let now = 1_000_000;
  for (let i = 0; i < 2000 && !(s.phase === "main" && !s.trade && !s.select && !s.seven); i++) {
    now += 400;
    const a = nextBotAction(table, s, now);
    const r = applyAction(s, a ?? { type: "tick" }, now);
    if (r.ok) s = r.state;
  }
  expect(s.phase).toBe("main");
  return { s, now };
}

describe("a bot's open offer", () => {
  it("waits for people still thinking, then withdraws rather than hold the table", () => {
    const { s: base, now } = toMain(5);
    const me = base.cur;
    const s = structuredClone(base);
    const others = s.players.filter((p) => p.id !== me).map((p) => p.id);
    s.trade = { from: me, offer: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 }, want: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1 }, replies: Object.fromEntries(others.map((id) => [id, "wait"])), since: now };
    const bot = createBot(me, 1);
    expect(decide(bot, viewFor(s, me), now + 1000)).toBeNull();
    expect(decide(bot, viewFor(s, me), now + TRADE_PATIENCE_MS - 1)).toBeNull();
    expect(decide(bot, viewFor(s, me), now + TRADE_PATIENCE_MS)).toEqual({ type: "cancelTrade", seat: me });
  });
  it("takes the first yes at once", () => {
    const { s: base, now } = toMain(5);
    const me = base.cur;
    const s = structuredClone(base);
    const others = s.players.filter((p) => p.id !== me).map((p) => p.id);
    s.trade = { from: me, offer: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 }, want: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1 }, replies: { [others[0]]: "yes", [others[1]]: "wait" }, since: now };
    expect(decide(createBot(me, 1), viewFor(s, me), now + 1)).toEqual({ type: "acceptTrade", seat: me, with: others[0] });
  });
});
