/* The record book on this screen. A local table writes its own lines and
   keeps them in this browser; an online table shows the server's lines for
   the people sitting at it. One getter, whichever is current. */
import { addRecord, recordOf, type GameRecord } from "@exploding-catan/protocol";
import type { GameState } from "@exploding-catan/engine";

const KEY = "exploding-catan:records";
let local: GameRecord[] | null = null;
let server: GameRecord[] | null = null;

function loadLocal(): GameRecord[] {
  if (local) return local;
  try { local = JSON.parse(localStorage.getItem(KEY) || "[]") as GameRecord[]; } catch { local = []; }
  return local;
}
/** A finished local game: one line, kept in this browser. */
export function noteLocalResult(s: GameState, isBot: (seat: number) => boolean): void {
  if (s.winner === null) return;
  const rec = recordOf(s.players.map((p, i) => ({ name: p.name, bot: isBot(i) })), s.winner, s.winPoints, s.mode);
  if (!rec) return;
  local = addRecord(loadLocal(), rec);
  try { localStorage.setItem(KEY, JSON.stringify(local)); } catch { /* fine */ }
}
/** The server's lines for this table (online), replacing whatever it sent before. */
export function setServerRecords(list: GameRecord[] | null): void { server = list; }
/** The lines that apply to this screen right now. */
export function records(online: boolean): GameRecord[] { return online ? server ?? [] : loadLocal(); }
