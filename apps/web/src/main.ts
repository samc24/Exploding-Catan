/* ══════════════════════════════════════════════════════════════════════
   EXPLODING CATAN — the browser table
   ══════════════════════════════════════════════════════════════════════
   One state in the store, one render() that rebuilds every region from it.
   Hot-seat for now: the screen follows whoever the table is waiting on, and
   any seat card can be clicked to look at that hand.
   ══════════════════════════════════════════════════════════════════════ */
import {
  KITTEN, MODES, answersFor, discardOwed, implodeActive, implodeRevealing, timerEnabled, totalVP, vpCards,
  handoverActive, type Action, type Card, type GameEvent, type GameState, type JournalEntry,
} from "@exploding-catan/engine";
import { store } from "./store";
import { $, clear, h } from "./ui/dom";
import { drawBoard, type BoardUI } from "./ui/board";
import { drawSeats } from "./ui/seats";
import { drawBottom } from "./ui/hand";
import { drawPanels, type PanelCallbacks } from "./ui/panels";
import { Feed, drawFeed, drawLog } from "./ui/feed";
import { closeModal, modalOpen, openModal } from "./ui/dialogs";
import { newGameDialog } from "./ui/newgame";
import { showRules } from "./ui/rules";
import { cardArt, cardBack, has, preload } from "./art";
import { createTable, nextBotAction, isBot as tableHasBot, type Table } from "@exploding-catan/bots";

/* ── screen-local state (never rules) ─────────────────────────────── */
const ui: BoardUI = { seat: 0, armed: null };
/* The bots at this table. Which seats are bots is a table setting, not a
   rule, so it lives beside the game rather than in it. */
const BOTS_KEY = "exploding-catan:bots";
let table: Table = createTable([], 0);
/** Bots deliberately move slowly, so a Nope can be reached for before the line scrolls away. */
const BOT_PACE = 2200;
let botTimer: number | null = null;
function isBot(seat: number): boolean { return tableHasBot(table, seat); }
function setBots(seats: number[], seed: number): void {
  table = createTable(seats, seed);
  try { localStorage.setItem(BOTS_KEY, JSON.stringify({ seats, seed })); } catch { /* fine */ }
}
/** Ask the driver for the next bot move, apply it, and come back after a beat. */
function botTick(): void {
  botTimer = null;
  const s = store.get();
  if (!s || s.phase === "over" || !table.bots.size || modalOpen()) return;
  const a = nextBotAction(table, s, Date.now());
  if (a) {
    const err = store.dispatch(a);
    if (err) console.warn("bot action refused:", a, err);
  }
  scheduleBots(a ? BOT_PACE : 400);
}
function scheduleBots(ms: number): void {
  if (!table.bots.size) return;
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = window.setTimeout(botTick, ms);
}
let manualSeat: number | null = null;   // a seat the person chose to look at
const feed = new Feed();
let showcaseTimer: number | null = null;
let hintTimer: number | null = null;
let tickHandle: number | null = null;
const panelCb: PanelCallbacks = {
  dispatch: (a) => act(a),
  scratch: {},
  composer: null,
  closeComposer() { panelCb.composer = null; render(); },
  now: Date.now(),
};

/** Who this screen is acting for: the seat the table is waiting on, else the current player. */
function waitingOn(s: GameState): number {
  const owed = discardOwed(s);
  if (owed) return owed.pid;
  if (s.forcedNope) return s.forcedNope.pid;
  if (s.select && "actor" in s.select) return s.select.actor;
  if (s.phase === "setup3" && s.roadsOwed) { const i = s.roadsOwed.findIndex((n) => n > 0); if (i >= 0) return i; }
  if (s.trade) { const w = Object.entries(s.trade.replies).find(([, r]) => r === "wait"); if (w) return Number(w[0]); return s.trade.from; }
  return s.cur;
}
function firstHuman(s: GameState): number {
  const h = s.players.find((p) => !isBot(p.id));
  return h ? h.id : s.cur;
}
function viewSeat(s: GameState): number {
  const w = waitingOn(s);
  // A manual look-around holds unless the table is stopped dead waiting on one seat.
  const hardWait = !!discardOwed(s) || !!s.forcedNope || (!!s.select && "actor" in s.select) || s.phase === "setup3";
  if (manualSeat !== null && !hardWait && manualSeat < s.players.length && !isBot(manualSeat)) return manualSeat;
  // Never a bot's hand: while a bot is playing or deciding, the screen stays on a person.
  if (isBot(w)) return manualSeat !== null && !isBot(manualSeat) ? manualSeat : firstHuman(s);
  return w;
}
let lastCur = -1;

/* ── dispatch with feedback ────────────────────────────────────────── */
function act(a: Action): string | null {
  const err = store.dispatch(a);
  if (err) hint(err, true);
  return err;
}
function hint(text: string, isError = false): void {
  const el = $("hint");
  el.textContent = text;
  el.style.color = isError ? "var(--danger)" : "var(--dim)";
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { el.textContent = ""; }, 3500);
}

/* ── the board's clicks: arm on the first, act on the second ─────── */
function armOr(kind: string, id: number, go: () => void): void {
  if (ui.armed && ui.armed.kind === kind && ui.armed.id === id) { ui.armed = null; go(); return; }
  ui.armed = { kind, id };
  render();
}
const boardCb = {
  vertex(vid: number) {
    const s = store.get()!, me = ui.seat;
    if (s.phase.startsWith("setup")) { armOr("free", vid, () => act({ type: "placeSettlement", seat: me, vid })); return; }
    const city = s.vOwner[vid] === me && s.vType[vid] === "settlement";
    armOr(city ? "city" : "settlement", vid, () => act({ type: city ? "placeCity" : "placeSettlement", seat: me, vid }));
  },
  edge(eid: number) {
    const s = store.get()!, me = ui.seat;
    armOr(s.phase.startsWith("setup") ? "free" : "road", eid, () => act({ type: "placeRoad", seat: me, eid }));
  },
  hex(hid: number) {
    const s = store.get()!, me = ui.seat;
    const sel = s.select;
    if (sel && sel.kind === "robber" && sel.actor === me) { armOr("robber", hid, () => act({ type: "pickHex", seat: me, hid })); return; }
    if (sel && sel.kind === "alter" && sel.actor === me) {
      // The first token can be un-picked by clicking it again, so only the second needs confirming.
      if (sel.first === null || sel.first === hid) { act({ type: "pickHex", seat: me, hid }); return; }
      armOr("alterb", hid, () => act({ type: "pickHex", seat: me, hid }));
      return;
    }
    if (ui.armed) { ui.armed = null; render(); }
  },
};

/* ── cards ─────────────────────────────────────────────────────────── */
function onCard(c: Card): void {
  const me = ui.seat;
  if (c.key === "vp") { hint("A Feral Kitten is a point, never a play."); return; }
  if (c.key === "nope" || c.key === "defuse") { offerAnswers(c.key, me); return; }
  act({ type: "playCard", seat: me, cardId: c.id });
}
function offerAnswers(key: "nope" | "defuse", me: number, onlyJid?: number): void {
  const s = store.get()!;
  let answers = answersFor(s, key, me, Date.now());
  if (onlyJid !== undefined) answers = answers.filter((a) => "jid" in a && a.jid === onlyJid);
  if (!answers.length) { hint(`Nothing your ${KITTEN[key].name} can answer right now.`); return; }
  const go = (a: (typeof answers)[number]) => {
    closeModal();
    if ("turn" in a) act({ type: "nopeTurn", seat: me });
    else act({ type: key, seat: me, jid: a.jid });
  };
  if (answers.length === 1 && !("turn" in answers[0]) && !isOwnRoll(s, answers[0].jid, me)) { go(answers[0]); return; }
  openModal(`What are you ${key === "defuse" ? "Defusing" : "Noping"}?`,
    h("p", { style: { color: "var(--dim)" } }, `Your ${KITTEN[key].name} can answer ${answers.length > 1 ? "more than one thing right now. Newest first." : "this:"}`),
    [...answers.map((a) => ({ label: a.label, cls: "turn" in a ? "warn" : "", fn: () => go(a) })), { label: "Keep the card", fn: closeModal }]);
}
function isOwnRoll(s: GameState, jid: number, me: number): boolean {
  const e = s.journal.find((x) => x.id === jid);
  return !!e && e.kind === "roll" && e.actor === me;
}
function onEntry(e: JournalEntry): void {
  const s = store.get()!, me = ui.seat;
  const p = s.players[me];
  const hasNope = p.cards.some((c) => c.key === "nope"), hasDef = p.cards.some((c) => c.key === "defuse");
  const nope = hasNope ? answersFor(s, "nope", me, Date.now()).filter((a) => "jid" in a && a.jid === e.id) : [];
  const def = hasDef ? answersFor(s, "defuse", me, Date.now()).filter((a) => "jid" in a && a.jid === e.id) : [];
  if (!nope.length && !def.length) { hint("You hold nothing that answers that line."); return; }
  openModal("Answer this?", h("p", null, e.text), [
    ...(def.length ? [{ label: "🛡 Defuse it", fn: () => { closeModal(); act({ type: "defuse", seat: me, jid: e.id }); } }] : []),
    ...(nope.length ? [{ label: "🚫 Nope it", cls: "warn", fn: () => { closeModal(); act({ type: "nope", seat: me, jid: e.id }); } }] : []),
    { label: "Leave it", fn: closeModal },
  ]);
}

/* ── events → things on screen ─────────────────────────────────────── */
function onEvents(s: GameState, events: GameEvent[]): void {
  feed.take(events);
  for (const ev of events) {
    if (ev.type === "show") showcase(s, ev.what, ev.pid);
    if (ev.type === "hint" && ev.seat === ui.seat) hint(ev.text);
    if (ev.type === "gameOver") setTimeout(() => standings(), 2200);
  }
}
function showcase(s: GameState, what: string, pid: number): void {
  const el = $("showcase");
  const isCard = what in KITTEN;
  const key = what === "nope" || what === "defuse" || isCard ? (what as keyof typeof KITTEN) : null;
  const titles: Record<string, string> = { seven: "Seven!", win: "Victory", winnoped: "Forced Nope", timeout: "Out of time", implode: "Imploding Kitten" };
  const title = key ? KITTEN[key].name : titles[what] ?? what;
  const art = key && has(cardArt(key, null)) ? cardArt(key, null) : null;
  clear(el);
  el.append(h("div", { class: "big" + (art ? "" : " plain"), style: art ? { backgroundImage: `url(${art})` } : null }, h("b", null, title), h("i", null, s.players[pid]?.name ?? "")));
  el.hidden = false;
  if (showcaseTimer) clearTimeout(showcaseTimer);
  showcaseTimer = window.setTimeout(() => { el.hidden = true; }, what === "implode" ? 2500 : 1700);
}
function standings(): void {
  const s = store.get();
  if (!s || s.phase !== "over" || s.winner === null) return;
  const w = s.players[s.winner];
  const order = [w, ...s.players.filter((q) => q.id !== w.id).sort((a, b) => totalVP(s, b) - totalVP(s, a))];
  const table = h("table", { class: "rank" }, h("tr", null, h("th"), h("th", null, "Player"), h("th", null, "Breakdown"), h("th", null, "VP")),
    order.map((q, i) => {
      const bits: string[] = [];
      if (q.settlements) bits.push(`${q.settlements} settlement${q.settlements === 1 ? "" : "s"}`);
      if (q.cities) bits.push(`${q.cities} cit${q.cities === 1 ? "y" : "ies"} (+${q.cities * 2})`);
      if (vpCards(q)) bits.push(`${vpCards(q)} Feral`);
      if (s.longestRoad.owner === q.id) bits.push("Longest Road +2");
      if (s.largestArmy.owner === q.id) bits.push(`Largest Army +2 (${q.knights}⚔)`);
      return h("tr", { class: i === 0 ? "win" : "" }, h("td", null, String(i + 1)), h("td", null, q.name), h("td", null, bits.join(" · ") || "—"), h("td", null, String(totalVP(s, q))));
    }));
  openModal(`${w.name} wins`, table, [
    { label: "Review board", fn: closeModal },
    { label: "New game", cls: "primary", fn: () => { closeModal(); newGameDialog(startGame, true); } },
  ]);
}

/* ── render ────────────────────────────────────────────────────────── */
function render(): void {
  const s = store.get();
  const now = Date.now();
  panelCb.now = now;
  if (!s) {
    clear($("seats")); clear($("board")); clear($("bottom")); clear($("panels")); clear($("dice")); clear($("pile")); clear($("deck"));
    $("modeTag").hidden = true;
    $("clock").hidden = true;
    return;
  }
  const view = viewSeat(s);
  if (view !== ui.seat) { ui.armed = null; panelCb.composer = null; }
  ui.seat = view;

  drawSeats($("seats"), s, view, isBot, (pid) => {
    const sel = s.select;
    if (sel && sel.kind === "seat" && sel.actor === view) { act({ type: "pickSeat", seat: view, target: pid }); return; }
    manualSeat = pid === waitingOn(s) ? null : pid;
    render();
  });
  drawBoard($("board") as unknown as SVGSVGElement, s, ui, boardCb);
  drawBottom($("bottom"), s, view, now, isBot, {
    roll: () => act({ type: "roll", seat: view }),
    endTurn: () => act({ type: "endTurn", seat: view }),
    buy: () => { panelCb.composer = panelCb.composer === "buy" ? null : "buy"; render(); },
    bank: () => { panelCb.composer = panelCb.composer === "bank" ? null : "bank"; render(); },
    trade: () => { panelCb.composer = panelCb.composer === "trade" ? null : "trade"; render(); },
    card: onCard,
    cancelSelect: () => act({ type: "cancelSelect", seat: view }),
  });
  drawPanels($("panels"), s, view, panelCb);
  drawFeed($("feed"), s, feed, now, onEntry);
  drawLog($("log"), s);

  // dice
  const dice = $("dice");
  clear(dice);
  if (s.rolled) dice.append(h("div", { class: "die" }, String(s.rolled[0])), h("div", { class: "die red" }, String(s.rolled[1])));

  // piles
  const pile = $("pile"); clear(pile);
  const top = [...s.pile].reverse().find((p) => !p.cancelled);
  const topArt = top && has(cardArt(top.card.key, top.card.flavor)) ? cardArt(top.card.key, top.card.flavor) : null;
  pile.append(h("div", { class: "cardface" + (top ? "" : " back"), style: topArt ? { backgroundImage: `url(${topArt})` } : null, title: top ? KITTEN[top.card.key].name : "Discard pile" }, top && !topArt ? KITTEN[top.card.key].name : ""), h("div", { class: "pilelbl" }, "discard"));
  const deck = $("deck"); clear(deck);
  deck.append(h("div", { class: "cardface back", style: has(cardBack) ? { backgroundImage: `url(${cardBack})` } : null }, h("span", { class: "ct" }, String(s.deck.length))), h("div", { class: "pilelbl" }, "deck"));

  // mode tag
  const tag = $("modeTag");
  tag.hidden = s.mode === "normal";
  tag.textContent = MODES[s.mode].name;

  // the imploding kitten's clock
  const clock = $("clock");
  if (implodeActive(s) && s.phase !== "over") {
    const waiting = implodeRevealing(s, now);
    const left = waiting ? 20 : Math.max(0, Math.ceil((s.implodeUntil - now) / 1000));
    clock.hidden = false;
    clock.className = !waiting && left <= 5 ? "urgent" : "";
    clock.innerHTML = `💥 <b>${s.players[s.cur].name}</b> imploded — un-Nopeable<span>${waiting ? "20s begins when the card lands" : left + "s left in this turn"}</span>`;
  } else clock.hidden = true;

  scheduleTicks(s);
}

/* The host clock: only while something is counting. */
function scheduleTicks(s: GameState): void {
  const need = (timerEnabled(s) && s.turnTimerUntil > 0) || implodeActive(s) || handoverActive(s, Date.now());
  if (need && tickHandle === null) {
    tickHandle = window.setInterval(() => {
      const cur = store.get();
      if (!cur) { stopTicks(); return; }
      if ((timerEnabled(cur) && cur.turnTimerUntil > 0) || implodeActive(cur)) store.dispatch({ type: "tick", hidden: document.hidden });
      else if (handoverActive(cur, Date.now())) { /* just keep repainting until it ends */ render(); }
      else { stopTicks(); render(); }
    }, 250);
  }
  if (!need) stopTicks();
}
function stopTicks(): void { if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; } }

/* ── boot ──────────────────────────────────────────────────────────── */
function startGame(cfg: Parameters<typeof store.newGame>[0], botSeats: number[], seed?: number): void {
  feed.reset();
  manualSeat = null;
  panelCb.scratch = {};
  panelCb.composer = null;
  const theSeed = seed ?? ((Math.random() * 2 ** 32) >>> 0);
  setBots(botSeats, theSeed);
  store.newGame(cfg, theSeed);
  scheduleBots(600);
}
store.subscribe((s, events, action) => {
  if (s) onEvents(s, events);
  // A new turn starts with the screen on whoever is playing.
  if (s && (s.cur !== lastCur)) { lastCur = s.cur; manualSeat = null; }
  if (action && action.type !== "tick") { ui.armed = null; }
  render();
  // Anything a person did may have handed the bots something to do.
  if (action && action.type !== "tick") scheduleBots(BOT_PACE);
});
$("newBtn").onclick = () => newGameDialog(startGame, !!store.get());
$("rulesBtn").onclick = showRules;
for (const b of $("sidetabs").querySelectorAll("button")) b.onclick = () => {
  for (const x of $("sidetabs").querySelectorAll("button")) x.classList.toggle("on", x === b);
  $("feed").hidden = b.dataset.tab !== "feed";
  $("log").hidden = b.dataset.tab !== "log";
};
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (modalOpen()) { closeModal(); return; }
  if (ui.armed) { ui.armed = null; render(); return; }
  if (panelCb.composer) { panelCb.composer = null; render(); return; }
  const s = store.get();
  if (s && s.select && (s.select.kind === "seat" || (s.select.kind === "alter" && s.select.purpose.kind === "play"))) act({ type: "cancelSelect", seat: ui.seat });
});

preload().then(() => {
  if (store.restore()) {
    const s = store.get()!;
    try { const b = JSON.parse(localStorage.getItem(BOTS_KEY) || "null") as { seats: number[]; seed: number } | null; if (b) table = createTable(b.seats, b.seed); } catch { /* no bots */ }
    feed.lines = [];
    for (const e of s.journal.slice(-30)) feed.lines.push({ text: e.text, kind: e.kind, jid: e.id });
    render();
    scheduleBots(800);
  } else newGameDialog(startGame, false);
});
