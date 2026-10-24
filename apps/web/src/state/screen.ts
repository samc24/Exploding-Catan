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
import { $ } from "../ui/dom";
import type { BoardUI } from "../ui/board";
import type { PanelCallbacks } from "../ui/panels";
import { Feed } from "../ui/feed";
import { tipsOn } from "./settings";

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
  hint: (text) => hint(text),
};

/** Dispatch, and say why if it was refused. */
export function act(a: Action): string | null {
  const err = store.dispatch(a);
  if (err) hint(err, true);
  return err;
}
/* Two kinds of words in the header: a passing hint (a refusal, "Bought 2
   kitten cards."), which shows for a moment, and the standing advice for
   this phase ("Roll the dice to begin your turn."), which stays until the
   phase does. The advice is set on every render and sits under the hint.
   On a phone the header has no room, so the advice stays off there (the
   bottom bar carries the phase); the hint is a toast. */
let hintTimer: number | null = null;
let standing = "";
const PHONE = "(max-width:800px), (max-width:1000px) and (max-height:520px)";
function paintHint(text: string, isError: boolean): void {
  const el = $("hint");
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : text === standing && text ? "var(--accent)" : "var(--dim)";
}
export function hint(text: string, isError = false, ms = 3500): void {
  // Advice can be turned off (Tips); a refusal is always said.
  if (!isError && !tipsOn()) return;
  paintHint(text, isError);
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { hintTimer = null; paintHint(standing, false); }, ms);
}
export function advice(text: string | null): void {
  let phone = false;
  try { phone = matchMedia(PHONE).matches; } catch { /* no media queries */ }
  standing = text && tipsOn() && !phone ? text : "";
  if (hintTimer === null) paintHint(standing, false);
}
