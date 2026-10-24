/* ══════════════════════════════════════════════════════════════════════
   CLOCKS — the turn timer and the Imploding Kitten's banner, painted in place
   ══════════════════════════════════════════════════════════════════════
   A tick that moved nothing but the clocks must not rebuild the world (it
   would eat clicks four times a second). A full render is only owed when
   something the clocks gate flips: the roll button waking up after the
   hand-over, the Imploding Kitten landing. Locally this screen is also the
   host clock and sends the tick; online the server keeps the clocks.
   ══════════════════════════════════════════════════════════════════════ */
import { canRollNow, handoverActive, implodeActive, implodeRevealing, timerEnabled, type GameState } from "@exploding-catan/engine";
import { store } from "../state/store";
import { clock, net } from "./online";
import { $ } from "../ui/dom";

let clockGate = "";
function gateOf(s: GameState, now: number): string {
  return `${!!canRollNow(s, now)}|${implodeRevealing(s, now)}|${handoverActive(s, now)}|${timerEnabled(s) && s.turnTimerUntil > 0}`;
}
/** Repaint the clocks in place. Returns false when a full render is owed instead. */
export function paintClocks(s: GameState): boolean {
  const now = clock();
  const gate = gateOf(s, now);
  if (gate !== clockGate) { clockGate = gate; return false; }
  const timer = document.querySelector<HTMLElement>("#bottom .turntimer");
  if (timer && timerEnabled(s) && s.turnTimerUntil) {
    const left = Math.max(0, (s.turnTimerUntil - now) / 1000);
    const fill = timer.querySelector<HTMLElement>(".fill"), txt = timer.querySelector<HTMLElement>(".txt");
    if (fill) fill.style.width = Math.min(100, Math.max(0, (left / s.turnSeconds) * 100)) + "%";
    if (txt) txt.textContent = `⏱ ${Math.ceil(left)}s`;
  }
  paintImplodeClock(s, now);
  return true;
}
export function paintImplodeClock(s: GameState, now: number): void {
  clockGate = gateOf(s, now);
  const el = $("clock");
  if (implodeActive(s) && s.phase !== "over") {
    const waiting = implodeRevealing(s, now);
    const left = waiting ? 20 : Math.max(0, Math.ceil((s.implodeUntil - now) / 1000));
    el.hidden = false;
    el.className = !waiting && left <= 5 ? "urgent" : "";
    el.innerHTML = `💥 <b>${s.players[s.cur].name}</b> imploded — un-Nopeable<span>${waiting ? "20s begins when the card lands" : left + "s left in this turn"}</span>`;
  } else el.hidden = true;
}

/* The host clock: only while something is counting. `repaint` is the full render, owed when a gate flips. */
let tickHandle: number | null = null;
export function scheduleTicks(s: GameState, repaint: () => void): void {
  const need = (timerEnabled(s) && s.turnTimerUntil > 0) || implodeActive(s) || handoverActive(s, clock());
  if (need && tickHandle === null) {
    tickHandle = window.setInterval(() => {
      const cur = store.get();
      if (!cur) { stopTicks(); return; }
      // Online the server keeps the clocks and sends them; this screen only repaints.
      if (!net.online && ((timerEnabled(cur) && cur.turnTimerUntil > 0) || implodeActive(cur))) store.dispatch({ type: "tick", hidden: document.hidden });
      else if ((timerEnabled(cur) && cur.turnTimerUntil > 0) || implodeActive(cur) || handoverActive(cur, clock())) { if (!paintClocks(cur)) repaint(); }
      else { stopTicks(); repaint(); }
    }, 250);
  }
  if (!need) stopTicks();
}
function stopTicks(): void { if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; } }
