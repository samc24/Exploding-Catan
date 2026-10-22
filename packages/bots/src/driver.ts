/* ══════════════════════════════════════════════════════════════════════════
   DRIVER — which bot acts next
   ══════════════════════════════════════════════════════════════════════════
   The host asks this after every action and on a timer. It answers with at
   most one action, or null when the table is waiting on a person (or on a
   window that has to pass: the hand-over, the Imploding Kitten landing).
   Polling rather than callbacks: it self-heals from any missed wake-up.

   Every bot decides on viewFor(state, seat) — the same redacted state a
   person at that seat would be sent — so a bot cannot read another hand or
   the deck even by mistake. Fairness is structural, and the test suite
   checks it costs nothing.
   ══════════════════════════════════════════════════════════════════════════ */
import { handoverActive, implodeRevealing, viewFor, type Action, type GameState } from "@exploding-catan/engine";
import { createBot, decide, type Bot } from "./agent";

export interface Table {
  bots: Map<number, Bot>;
  seed: number;
}
/** A bot's dice are seeded by its SEAT, so adding or removing another bot does not reseed it. */
export function createTable(botSeats: number[], seed: number): Table {
  const t: Table = { bots: new Map(), seed };
  for (const seat of botSeats) addBot(t, seat);
  return t;
}
export function addBot(t: Table, seat: number): void {
  if (!t.bots.has(seat)) t.bots.set(seat, createBot(seat, (t.seed + seat * 7919) >>> 0));
}
export function removeBot(t: Table, seat: number): void {
  t.bots.delete(seat);
}
export function isBot(t: Table, seat: number): boolean {
  return t.bots.has(seat);
}
export function hasBots(t: Table): boolean {
  return t.bots.size > 0;
}

/** The next bot action for the table, if any. */
export function nextBotAction(t: Table, s: GameState, now: number): Action | null {
  if (!t.bots.size || s.phase === "over") return null;
  // The three seconds after a turn belong to whoever wants to answer it. Bots
  // sit them out, so a person can reach for a Nope before the next roll.
  if (handoverActive(s, now) && s.phase === "roll") return null;
  // The Imploding Kitten is still landing; nobody acts through that.
  if (implodeRevealing(s, now)) return null;
  // Everybody with an obligation or a reaction goes before the player whose
  // turn it is, in seat order from the current player so no seat is favoured.
  const n = s.players.length;
  let own: Action | null = null;
  for (let i = 0; i < n; i++) {
    const seat = (s.cur + i) % n;
    const bot = t.bots.get(seat);
    if (!bot) continue;
    const a = decide(bot, viewFor(s, seat), now);
    if (!a) continue;
    if (seat === s.cur && !s.phase.startsWith("setup")) { own ??= a; continue; }
    return a;
  }
  return own;
}
