/* Which seat this screen is acting for. Hot-seat: the seat the table is
   waiting on, else the current player, never a bot. Online: your own seat. */
import { discardOwed, type GameState } from "@exploding-catan/engine";
import { isBot, net } from "./online";
import { manualSeat } from "../state/screen";

/** The seat the table is waiting on, else the current player. */
export function waitingOn(s: GameState): number {
  const owed = discardOwed(s);
  if (owed) return owed.pid;
  if (s.forcedNope) return s.forcedNope.pid;
  if (s.select && "actor" in s.select) return s.select.actor;
  if (s.phase === "setup3" && s.roadsOwed) { const i = s.roadsOwed.findIndex((n) => n > 0); if (i >= 0) return i; }
  if (s.trade) { const w = Object.entries(s.trade.replies).find(([, r]) => r === "wait"); if (w) return Number(w[0]); return s.trade.from; }
  return s.cur;
}
function firstHuman(s: GameState): number {
  const h = s.players.find((p) => !isBot(p.id));
  return h ? h.id : s.cur;
}
export function viewSeat(s: GameState): number {
  if (net.online) return net.seat ?? s.cur;
  const w = waitingOn(s);
  // A manual look-around holds unless the table is stopped dead waiting on one seat.
  const hardWait = !!discardOwed(s) || !!s.forcedNope || (!!s.select && "actor" in s.select) || s.phase === "setup3";
  if (manualSeat !== null && !hardWait && manualSeat < s.players.length && !isBot(manualSeat)) return manualSeat;
  // Never a bot's hand: while a bot is playing or deciding, the screen stays on a person.
  if (isBot(w)) return manualSeat !== null && !isBot(manualSeat) ? manualSeat : firstHuman(s);
  return w;
}
