/* ══════════════════════════════════════════════════════════════════════
   RENDER — one function that rebuilds every region from the state
   ══════════════════════════════════════════════════════════════════════
   The two cheaper paths live beside it: events.ts turns one action's
   events into flights, reveals and sounds; clocks.ts repaints a tick that
   moved nothing but the clocks in place.
   ══════════════════════════════════════════════════════════════════════ */
import { store } from "../state/store";
import { clock, isBot, net } from "./online";
import { viewSeat, waitingOn } from "./focus";
import { act, advice, feed, panelCb, setManualSeat, ui } from "../state/screen";
import { paintImplodeClock, scheduleTicks } from "./clocks";
import { adviceFor } from "../ui/advice";
import { boardCb, onCard, onEntry } from "../input/input";
import { paintBubbles } from "../media/emotes";
import { openNewGame } from "./game";
import { $, h } from "../ui/dom";
import { drawBoard } from "../ui/board";
import { drawSeats } from "../ui/seats";
import { canBuyCards, drawBottom } from "../ui/hand";
import { drawPanels } from "../ui/panels";
import { drawFeed, drawLog, drawTicker } from "../ui/feed";
import { drawDiceHistory } from "../ui/dice";
import { drawTable, clearTable } from "../ui/table";
import { onPileRelease, showPlaying, syncPile } from "../ui/showcase";
import { checkBoardChanges, dropHoldsFor, onHoldCleared } from "../ui/fx";
import { standings } from "../ui/standings";
import { avatarDialog } from "../ui/avatars";
import { pickAvatar } from "./online";

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
  scheduleTicks(s, render);
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
