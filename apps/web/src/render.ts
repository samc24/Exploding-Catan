/* ══════════════════════════════════════════════════════════════════════
   RENDER — one function that rebuilds every region from the state
   ══════════════════════════════════════════════════════════════════════
   Plus the two cheaper paths: events become flights and showcases, and a
   tick that moved nothing but the clocks repaints the clocks in place.
   ══════════════════════════════════════════════════════════════════════ */
import {
  canRollNow, handoverActive, implodeActive, implodeRevealing, timerEnabled, type GameEvent, type GameState,
} from "@exploding-catan/engine";
import { store } from "./store";
import { clock, isBot, net } from "./online";
import { viewSeat, waitingOn } from "./focus";
import { act, feed, hint, panelCb, setManualSeat, ui } from "./screen";
import { boardCb, onCard, onEntry } from "./input";
import { paintBubbles } from "./emotes";
import { openNewGame } from "./game";
import { $ } from "./ui/dom";
import { drawBoard } from "./ui/board";
import { drawSeats } from "./ui/seats";
import { drawBottom } from "./ui/hand";
import { drawPanels } from "./ui/panels";
import { drawFeed, drawLog } from "./ui/feed";
import { drawTable, clearTable } from "./ui/table";
import { showcase } from "./ui/showcase";
import { standings } from "./ui/standings";
import { playEvents } from "./ui/fx";

export function render(): void {
  const s = store.get();
  const now = clock();
  panelCb.now = now;
  if (!s) { clearTable(); return; }
  const view = viewSeat(s);
  if (view !== ui.seat) { ui.armed = null; panelCb.composer = null; panelCb.scratch = {}; }
  ui.seat = view;

  drawSeats($("seats"), s, view, isBot, (pid) => {
    const sel = s.select;
    if (sel && sel.kind === "seat" && sel.actor === view) { act({ type: "pickSeat", seat: view, target: pid }); return; }
    setManualSeat(pid === waitingOn(s) ? null : pid);
    render();
  });
  paintBubbles();
  ui.spectator = net.online && net.seat === null;
  drawBoard($("board") as unknown as SVGSVGElement, s, ui, boardCb);
  drawBottom($("bottom"), s, view, now, isBot, {
    roll: () => act({ type: "roll", seat: view }),
    endTurn: () => act({ type: "endTurn", seat: view }),
    buy: () => { panelCb.composer = panelCb.composer === "buy" ? null : "buy"; render(); },
    bank: () => { panelCb.composer = panelCb.composer === "bank" ? null : "bank"; render(); },
    trade: () => { panelCb.composer = panelCb.composer === "trade" ? null : "trade"; render(); },
    card: onCard,
    cancelSelect: () => act({ type: "cancelSelect", seat: view }),
  }, !!ui.spectator);
  drawPanels($("panels"), s, view, panelCb);
  drawFeed($("feed"), s, feed, now, onEntry);
  drawLog($("log"), s);
  drawTable(s);
  paintImplodeClock(s, now);
  clockGate = gateOf(s, now);
  scheduleTicks(s);
}

/** Events from one action: flights, showcases, hints, the final table. */
export function onEvents(s: GameState, events: GameEvent[]): void {
  feed.take(events);
  // Flights are measured against the screen as it is BEFORE this render moves things.
  try { playEvents(s, events, viewSeat(s)); } catch { /* decoration only */ }
  for (const ev of events) {
    if (ev.type === "show") showcase(s, ev.what, ev.pid);
    if (ev.type === "hint" && ev.seat === ui.seat) hint(ev.text);
    if (ev.type === "gameOver") setTimeout(() => { const cur = store.get(); if (cur) standings(cur, () => openNewGame(true)); }, 2200);
  }
}

/* ── just the clocks ────────────────────────────────────────────────
   A full render is only owed when something the clocks gate flips: the roll
   button waking up after the hand-over, the Imploding Kitten landing. */
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
function paintImplodeClock(s: GameState, now: number): void {
  const el = $("clock");
  if (implodeActive(s) && s.phase !== "over") {
    const waiting = implodeRevealing(s, now);
    const left = waiting ? 20 : Math.max(0, Math.ceil((s.implodeUntil - now) / 1000));
    el.hidden = false;
    el.className = !waiting && left <= 5 ? "urgent" : "";
    el.innerHTML = `💥 <b>${s.players[s.cur].name}</b> imploded — un-Nopeable<span>${waiting ? "20s begins when the card lands" : left + "s left in this turn"}</span>`;
  } else el.hidden = true;
}

/* The host clock: only while something is counting. */
let tickHandle: number | null = null;
function scheduleTicks(s: GameState): void {
  const need = (timerEnabled(s) && s.turnTimerUntil > 0) || implodeActive(s) || handoverActive(s, clock());
  if (need && tickHandle === null) {
    tickHandle = window.setInterval(() => {
      const cur = store.get();
      if (!cur) { stopTicks(); return; }
      // Online the server keeps the clocks and sends them; this screen only repaints.
      if (!net.online && ((timerEnabled(cur) && cur.turnTimerUntil > 0) || implodeActive(cur))) store.dispatch({ type: "tick", hidden: document.hidden });
      else if ((timerEnabled(cur) && cur.turnTimerUntil > 0) || implodeActive(cur) || handoverActive(cur, clock())) { if (!paintClocks(cur)) render(); }
      else { stopTicks(); render(); }
    }, 250);
  }
  if (!need) stopTicks();
}
function stopTicks(): void { if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; } }
