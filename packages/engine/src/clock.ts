/* ══════════════════════════════════════════════════════════════════════
   CLOCKS — the turn timer and the Imploding Kitten's twenty seconds
   ══════════════════════════════════════════════════════════════════════
   Held, not paused: whether the turn clock may count is asked fresh on
   every tick, so nothing has to remember to resume it. The ticks that
   drive these live in turn.ts (they end turns); this file is the clocks.
   ══════════════════════════════════════════════════════════════════════ */
import { IMPLODE_MS } from "./constants";
import { totalVP, type Ctx } from "./state";
import { implodeActive, implodeRevealing } from "./journal";
import type { GameState } from "./types";

export function timerEnabled(s: GameState): boolean {
  return s.turnSeconds > 0;
}
/** A turn begins with no clock. It starts when the dice are thrown. */
export function startTurnTimer(c: Ctx): void {
  const s = c.s;
  if (!timerEnabled(s)) return;
  s.turnTickAt = c.now;
  s.turnTimerUntil = c.now + s.turnSeconds * 1000;
}
export function stopTurnTimer(c: Ctx): void {
  c.s.turnTickAt = 0;
  c.s.turnTimerUntil = 0;
}
/** Is the clock allowed to be counting right now? HELD, not paused: asked
    fresh every tick, so nothing has to remember to resume it. */
export function turnClockHeld(s: GameState, now: number, hidden = false): boolean {
  if (hidden) return true;
  if (s.winner !== null || s.phase === "over") return true;
  if (s.phase !== "main" && s.phase !== "roll") return true;
  if (s.select || s.seven) return true;
  if (s.attackDue.length) return true;
  if (implodeActive(s)) return true;
  if (implodeRevealing(s, now)) return true;
  if (s.forcedNope) return true;
  if (s.players.some((q) => totalVP(s, q) >= s.winPoints)) return true;
  return false;
}

export function startImplodeClock(c: Ctx): void {
  const s = c.s;
  s.implodeFrom = c.now + s.implodeRevealMs;
  s.implodeUntil = s.implodeFrom + IMPLODE_MS;
}
export function clearImplodeClock(c: Ctx): void {
  c.s.implodeFrom = 0;
  c.s.implodeUntil = 0;
}
