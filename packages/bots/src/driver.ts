/* ══════════════════════════════════════════════════════════════════════════
   DRIVER — which bot acts next
   ══════════════════════════════════════════════════════════════════════════
   The host asks this after every action and on a timer. It answers with at
   most one action, or null when the table is waiting on a person (or on a
   window that has to pass: the hand-over, the Imploding Kitten landing).
   Polling rather than callbacks: it self-heals from any missed wake-up.
   ══════════════════════════════════════════════════════════════════════════ */
import { Rng, handoverActive, implodeRevealing, type Action, type GameState } from "@exploding-catan/engine";
import { decide, type Bot } from "./agent";

export interface Table {
  bots: Map<number, Bot>;
}
export function createTable(botSeats: number[], seed: number): Table {
  const bots = new Map<number, Bot>();
  botSeats.forEach((seat, i) => bots.set(seat, { seat, rng: new Rng((seed + i * 7919) >>> 0), lastTurn: -1, offered: false, aim: null }));
  return { bots };
}

export function isBot(t: Table, seat: number): boolean {
  return t.bots.has(seat);
}

/** The next bot action for the table, if any. */
export function nextBotAction(t: Table, s: GameState, now: number): Action | null {
  if (!t.bots.size || s.phase === "over") return null;
  // The three seconds after a turn belong to whoever wants to answer it.
  if (handoverActive(s, now) && s.phase === "roll") return null;
  // The Imploding Kitten is still landing; nobody acts through that.
  if (implodeRevealing(s, now)) return null;
  // Everybody with an obligation or a reaction goes before the player whose
  // turn it is, in seat order from the current player so no seat is favoured.
  const n = s.players.length;
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push((s.cur + i) % n);
  let own: Action | null = null;
  for (const seat of order) {
    const bot = t.bots.get(seat);
    if (!bot) continue;
    const a = decide(bot, s, now);
    if (!a) continue;
    if (seat === s.cur && !s.phase.startsWith("setup")) { own ??= a; continue; }
    return a;
  }
  return own;
}
