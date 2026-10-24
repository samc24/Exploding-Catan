/* Starting a local game. */
import type { GameConfig } from "@exploding-catan/engine";
import { store } from "./store";
import { setBots, scheduleBots } from "./bots-host";
import { goLocal, net } from "./online";
import { feed, panelCb, setManualSeat } from "./screen";
import { resetFeedSignature } from "./ui/feed";
import { resetShowcase } from "./ui/showcase";
import { newGameDialog, type Preset } from "./ui/newgame";
import { requestRender } from "./screen";
import { restoreBots } from "./bots-host";

export function startGame(cfg: GameConfig, botSeats: number[], seed?: number): void {
  if (net.online) { net.leave(); goLocal(); }
  feed.reset();
  resetFeedSignature();
  resetShowcase();
  setManualSeat(null);
  panelCb.scratch = {};
  panelCb.composer = null;
  const theSeed = seed ?? ((Math.random() * 2 ** 32) >>> 0);
  setBots(botSeats, theSeed);
  store.newGame(cfg, theSeed);
  scheduleBots(600);
}
export function openNewGame(canCancel: boolean, preset: Preset = null): void { newGameDialog(startGame, canCancel, preset); }
/** Pick the saved local game back up. Returns false when there is none. */
export function resumeLocal(): boolean {
  if (!store.restore()) return false;
  const s = store.get()!;
  restoreBots();
  feed.reset();
  for (const e of s.journal.slice(-30)) feed.add(e.text, e.kind, e.id, e.turn);
  requestRender();
  scheduleBots(800);
  return true;
}
/** Is there a saved local game to continue? */
export function hasSavedGame(): boolean {
  try { return !!localStorage.getItem("exploding-catan:game"); } catch { return false; }
}
