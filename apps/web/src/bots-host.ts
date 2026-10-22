/* The bots at a LOCAL table. Which seats are bots is a table setting, not a
   rule, so it lives beside the game rather than in it. Online, the server
   drives the bots and this does nothing. */
import { createTable, nextBotAction, isBot, type Table } from "@exploding-catan/bots";
import { store } from "./store";
import { modalOpen } from "./ui/dialogs";

const BOTS_KEY = "exploding-catan:bots";
/** Bots deliberately move slowly, so a Nope can be reached for before the line scrolls away. */
export const BOT_PACE = 2200;
let table: Table = createTable([], 0);
let timer: number | null = null;

export function localBot(seat: number): boolean { return isBot(table, seat); }
export function setBots(seats: number[], seed: number): void {
  table = createTable(seats, seed);
  try { localStorage.setItem(BOTS_KEY, JSON.stringify({ seats, seed })); } catch { /* fine */ }
}
export function restoreBots(): void {
  try {
    const b = JSON.parse(localStorage.getItem(BOTS_KEY) || "null") as { seats: number[]; seed: number } | null;
    if (b) table = createTable(b.seats, b.seed);
  } catch { /* no bots */ }
}
/** Ask the driver for the next bot move, apply it, and come back after a beat. */
function tick(): void {
  timer = null;
  if (store.remote) return; // online: the server drives the bots
  const s = store.get();
  if (!s || s.phase === "over" || !table.bots.size || modalOpen()) return;
  const a = nextBotAction(table, s, Date.now());
  if (a) {
    const err = store.dispatch(a);
    if (err) console.warn("bot action refused:", a, err);
  }
  scheduleBots(a ? BOT_PACE : 400);
}
export function scheduleBots(ms: number): void {
  if (!table.bots.size || store.remote) return;
  if (timer !== null) clearTimeout(timer);
  timer = window.setTimeout(tick, ms);
}
export function stopBots(): void { if (timer !== null) { clearTimeout(timer); timer = null; } }
