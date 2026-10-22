/* ══════════════════════════════════════════════════════════════════════
   SCREEN — state that belongs to this screen and never to the rules
   ══════════════════════════════════════════════════════════════════════
   What is armed, which seat is being looked at, which composer is open,
   the feed's lines. One object, owned here, read and written by the
   modules around it. Also the one place that knows how to ask for a
   repaint, so input handlers never have to import the renderer.
   ══════════════════════════════════════════════════════════════════════ */
import type { Action } from "@exploding-catan/engine";
import { store } from "./store";
import { $ } from "./ui/dom";
import type { BoardUI } from "./ui/board";
import type { PanelCallbacks } from "./ui/panels";
import { Feed } from "./ui/feed";

export const ui: BoardUI = { seat: 0, armed: null, zoom: 1, panX: 0, panY: 0 };
export const feed = new Feed();
/** A seat the person chose to look at, or null to follow the table. */
export let manualSeat: number | null = null;
export function setManualSeat(seat: number | null): void { manualSeat = seat; }

let renderer: (() => void) | null = null;
export function setRenderer(fn: () => void): void { renderer = fn; }
export function requestRender(): void { renderer?.(); }

/** What to do when there is no game at all (open the New Game dialog). Set at boot. */
let noGame: (() => void) | null = null;
export function setNoGameHandler(fn: () => void): void { noGame = fn; }
export function onNoGame(): void { noGame?.(); }

export const panelCb: PanelCallbacks = {
  dispatch: (a) => act(a),
  scratch: {},
  composer: null,
  closeComposer() { panelCb.composer = null; requestRender(); },
  now: Date.now(),
};

/** Dispatch, and say why if it was refused. */
export function act(a: Action): string | null {
  const err = store.dispatch(a);
  if (err) hint(err, true);
  return err;
}
let hintTimer: number | null = null;
export function hint(text: string, isError = false): void {
  const el = $("hint");
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--dim)";
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { el.textContent = ""; }, 3500);
}
