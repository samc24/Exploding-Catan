/* ══════════════════════════════════════════════════════════════════════
   RENDER — one function that rebuilds every region from the state
   ══════════════════════════════════════════════════════════════════════
   Plus the two cheaper paths: events become flights and showcases, and a
   tick that moved nothing but the clocks repaints the clocks in place.
   ══════════════════════════════════════════════════════════════════════ */
import {
  KITTEN, canRollNow, discardOwed, handoverActive, implodeActive, implodeRevealing, timerEnabled, type GameEvent,
  type GameState,
} from "@exploding-catan/engine";
import { store } from "./store";
import { clock, isBot, net } from "./online";
import { viewSeat, waitingOn } from "./focus";
import { act, advice, feed, hint, panelCb, setManualSeat, ui } from "./screen";
import { adviceFor } from "./ui/advice";
import { boardCb, onCard, onEntry } from "./input";
import { paintBubbles } from "./emotes";
import { openNewGame } from "./game";
import { $, h } from "./ui/dom";
import { drawBoard } from "./ui/board";
import { drawSeats } from "./ui/seats";
import { canBuyCards, drawBottom } from "./ui/hand";
import { drawPanels } from "./ui/panels";
import { drawFeed, drawLog, drawTicker } from "./ui/feed";
import { drawDiceHistory } from "./ui/dice";
import { drawTable, clearTable } from "./ui/table";
import { afterShowcase, onPileRelease, showPlaying, showcase, syncPile } from "./ui/showcase";
import { standings } from "./ui/standings";
import { checkBoardChanges, dropHoldsFor, onHoldCleared, playEvents } from "./ui/fx";
import { avatarDialog } from "./ui/avatars";
import { pickAvatar } from "./online";
import { sfx } from "./sfx";

let lastPlaying = "";
onHoldCleared(() => { if (store.get()) render(); });
// A card whose moment is over takes its place on the pile.
onPileRelease(() => { const cur = store.get(); if (cur) drawTable(cur, viewSeat(cur), clock()); });

export function render(): void {
  const s = store.get();
  const now = clock();
  panelCb.now = now;
  if (!s) { clearTable(); return; }
  const view = viewSeat(s);
  if (view !== ui.seat) { ui.armed = null; panelCb.composer = null; panelCb.scratch = {}; }
  ui.seat = view;

  dropHoldsFor(s);
  drawSeats($("seats"), s, view, isBot, (pid) => {
    const sel = s.select;
    if (sel && sel.kind === "seat" && sel.actor === view) { act({ type: "pickSeat", seat: view, target: pid }); return; }
    setManualSeat(pid === waitingOn(s) ? null : pid);
    render();
  }, ui.spectator || isBot(view) ? null : () => avatarDialog(s.players[view].avatar, (a) => pickAvatar(view, a)));
  paintBubbles();
  ui.spectator = net.online && net.seat === null;
  // Everything but the faces goes dim and deaf while you choose one: the card is played, and a
  // board you can still click is a board you can still misclick. Only on the chooser's screen.
  const sel = s.select;
  document.body.classList.toggle("picking", !!sel && sel.kind === "seat" && sel.actor === view && !ui.spectator);
  advice(ui.spectator ? null : adviceFor(s, view, ui.armed, isBot));
  // A card leaves the hand the moment it is played, and turns over in the middle while it waits on its aim.
  const playing = sel && "actor" in sel && (sel.kind === "seat" || (sel.kind === "alter" && sel.purpose.kind === "play")) ? sel : null;
  const playingId = playing ? (playing.kind === "seat" ? playing.cardId : playing.kind === "alter" && playing.purpose.kind === "play" ? playing.purpose.cardId : -1) : -1;
  const tag = playing ? `${playing.actor}:${playingId}` : "";
  if (tag !== lastPlaying) {
    lastPlaying = tag;
    if (playing) { const card = s.players[playing.actor].cards.find((c) => c.id === playingId); if (card) showPlaying(s, playing.actor, card); }
  }
  checkBoardChanges(s);
  drawBoard($("board") as unknown as SVGSVGElement, s, ui, boardCb);
  drawBottom($("bottom"), s, view, now, isBot, {
    roll: () => act({ type: "roll", seat: view }),
    endTurn: () => act({ type: "endTurn", seat: view }),
    buy: () => { panelCb.composer = panelCb.composer === "buy" ? null : "buy"; render(); },
    bank: () => { panelCb.composer = panelCb.composer === "bank" ? null : "bank"; render(); },
    trade: () => { panelCb.composer = panelCb.composer === "trade" ? null : "trade"; render(); },
    card: onCard,
    cancelSelect: () => act({ type: "cancelSelect", seat: view }),
    standings: () => standings(s, () => openNewGame(true)),
  }, !!ui.spectator);
  drawPanels($("panels"), s, view, panelCb);
  drawFeed($("feed"), s, feed, view, now, onEntry);
  drawTicker($("ticker"), s, feed, fitTicker());
  $("boardArea").classList.toggle("zoomed", ui.zoom > 1);
  drawLog($("log"), s);
  drawDiceHistory($("dicepanel"), s);
  syncPile(s);
  drawTable(s, view, now);
  // The deck itself sells cards: when a buy is possible, a click on it opens the buy, like the button.
  const deck = $("deck");
  const selling = canBuyCards(s, view) && !ui.spectator;
  deck.classList.toggle("buyable", selling);
  deck.title = selling ? "Buy a kitten card: any 3 different resources" : s.cur === view ? "Buying takes 3 different resources on your turn, after the roll" : `${s.deck.length} cards left`;
  deck.onclick = selling ? () => { panelCb.composer = panelCb.composer === "buy" ? null : "buy"; render(); } : null;
  // Which way round the table, which matters once a Reverse has been played.
  // Hidden in a two-player game, where there is no other way round the table.
  const dir = $("dirTag");
  dir.hidden = s.phase.startsWith("setup") || s.players.length < 3;
  dir.replaceChildren(s.dir === 1 ? "↻" : "↺", h("span", { class: "w" }, s.dir === 1 ? " clockwise" : " reversed"));
  dir.classList.toggle("rev", s.dir === -1);
  paintImplodeClock(s, now);
  clockGate = gateOf(s, now);
  scheduleTicks(s);
}

/* An upright phone is wider than the board is tall, so the board hangs from
   the top of its room and the last log lines take what is left below it:
   as many as fit (see the ticker in style.css for the line height), none
   when fewer than two would. Elsewhere the ticker is not shown at all. */
const UPRIGHT_PHONE = "(max-width:800px) and (orientation:portrait)";
const TICKER_LINE_PX = 17, TICKER_MAX = 6;
function fitTicker(): number {
  const svg = $("board") as unknown as SVGSVGElement;
  const ticker = $("ticker");
  let upright = false;
  try { upright = matchMedia(UPRIGHT_PHONE).matches; } catch { /* no media queries: a test runner */ }
  svg.setAttribute("preserveAspectRatio", upright ? "xMidYMin meet" : "xMidYMid meet");
  if (!upright) { ticker.style.height = ""; return 0; }
  const vb = svg.viewBox.baseVal;
  const cw = svg.clientWidth, ch = svg.clientHeight;
  const drawn = vb.width > 0 ? Math.min(ch, cw * vb.height / vb.width) : ch;
  const lines = Math.min(TICKER_MAX, Math.floor((ch - drawn - 16) / TICKER_LINE_PX));
  const n = lines >= 2 ? lines : 0;
  ticker.style.height = n ? `${n * TICKER_LINE_PX}px` : "0px";
  return n;
}

/** Events from one action: flights, showcases, hints, sounds, the final table. */
export function onEvents(s: GameState, events: GameEvent[]): void {
  feed.take(events);
  // Flights are measured against the screen as it is BEFORE this render moves things.
  try { playEvents(s, events, viewSeat(s)); } catch { /* decoration only */ }
  const view = viewSeat(s), now = clock();
  const lineOf = (jid: number | null) => (jid === null ? "" : events.find((e): e is Extract<GameEvent, { type: "feed" }> => e.type === "feed" && e.jid === jid)?.text ?? "");
  for (const ev of events) {
    if (ev.type === "show") { showcase(s, ev.what, ev.pid, ev.jid, lineOf(ev.jid), view, now); soundFor(ev.what); }
    if (ev.type === "log") console.warn("engine:", ev.text);
    if (ev.type === "hint" && ev.seat === ui.seat) hint(ev.text);
    if (ev.type === "production" && ev.sources.length) sfx("slide");
    if (ev.type === "cards" && (ev.from !== null || ev.to !== null)) sfx("slide", { gain: 0.7 });
    if (ev.type === "kitten") sfx("draw");
    if (ev.type === "feed" && ev.kind === "buy" && /builds|upgrades/.test(ev.text)) sfx("build");
    if (ev.type === "feed" && ev.kind === "attack" && /moves the robber/.test(ev.text)) sfx("robber");
    if (ev.type === "feed" && ev.kind === "info" && / trades? /.test(ev.text)) sfx("trade");
    // The standings wait for the trophy to clear the middle of the board, ten seconds at the most.
    if (ev.type === "gameOver") { sfx("win"); afterShowcase(() => { const cur = store.get(); if (cur) standings(cur, () => openNewGame(true)); }, 10000); }
  }
  // A roll that was not a seven has no showcase; the dice still clatter.
  if (events.some((e) => e.type === "feed" && e.kind === "roll" && !/rolls 7 /.test(e.text))) sfx("dice");
  chimeIfMine(s);
}
/** The showcase kinds that have a sound of their own. */
function soundFor(what: string): void {
  switch (what) {
    case "seven": sfx("dice"); setTimeout(() => sfx("seven"), 350); break;
    case "nope": sfx("nope"); break;
    case "defuse": sfx("defuse"); break;
    case "explode": sfx("boom"); break;
    case "implode": sfx("implode"); setTimeout(() => sfx("boom", { rate: 0.8 }), 120); break;
    case "knight": sfx("knight"); break;
    case "win": break; // the gameOver event rings it
    case "winnoped": sfx("nope", { rate: 0.85 }); break;
    case "timeout": sfx("owed", { rate: 0.8 }); break;
    default: if (what in KITTEN) sfx("card"); // any other card played
  }
}
/* A chime when the table turns to the person at this screen: their turn
   begins, or an answer is owed by them. Once per such moment. */
let chimedFor = "";
function chimeIfMine(s: GameState): void {
  const view = viewSeat(s);
  if (isBot(view) || s.phase.startsWith("setup") && s.phase !== "setup3") { chimedFor = ""; return; }
  const owed = discardOwed(s);
  const waiting = (owed && owed.pid === view) || (s.forcedNope && s.forcedNope.pid === view) || (s.select && "actor" in s.select && s.select.actor === view && s.select.kind !== "seat" && s.select.kind !== "alter");
  const key = waiting ? `owed:${s.turnCounter}:${s.journal.length}` : s.cur === view && s.phase === "roll" ? `turn:${s.turnCounter}` : "";
  if (!key || key === chimedFor) { if (!key) chimedFor = ""; return; }
  chimedFor = key;
  sfx(waiting ? "owed" : "turn");
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
