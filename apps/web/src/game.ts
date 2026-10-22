/* Starting a local game. */
import type { GameConfig } from "@exploding-catan/engine";
import { store } from "./store";
import { setBots, scheduleBots } from "./bots-host";
import { goLocal, net } from "./online";
import { feed, panelCb, setManualSeat } from "./screen";
import { resetFeedSignature } from "./ui/feed";
import { newGameDialog } from "./ui/newgame";

export function startGame(cfg: GameConfig, botSeats: number[], seed?: number): void {
  if (net.online) { net.leave(); goLocal(); }
  feed.reset();
  resetFeedSignature();
  setManualSeat(null);
  panelCb.scratch = {};
  panelCb.composer = null;
  const theSeed = seed ?? ((Math.random() * 2 ** 32) >>> 0);
  setBots(botSeats, theSeed);
  store.newGame(cfg, theSeed);
  scheduleBots(600);
}
export function openNewGame(canCancel: boolean): void { newGameDialog(startGame, canCancel); }
