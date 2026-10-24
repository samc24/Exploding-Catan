/* ══════════════════════════════════════════════════════════════════════
   SHOWCASE — a played card, or a moment, held up in the middle of the board
   ══════════════════════════════════════════════════════════════════════
   Reveals QUEUE rather than overwrite: a Nope on a Nope is two cards, and
   the second must not wipe the first before anybody has read it. A card
   with something behind it shows for a shorter beat; the newest is kept
   when the queue is full, except a `must` (the win, the Imploding Kitten),
   which nobody would otherwise ever see. The discard pile waits for a
   card's moment to finish before showing it on top: `pileRevealed`.
   ══════════════════════════════════════════════════════════════════════ */
import {
  IMPLODE_SHOW_MS, KITTEN, SHOWCASE_FADE_MS, canDefuseEntry, entryById, geometry, playableWhenDrawn,
  type Card, type GameState, type JournalEntry,
} from "@exploding-catan/engine";
import { $, clear, h } from "./dom";
import { cardArt, has } from "../art";
import { tint } from "./text";

const SHOWCASE_MS = 2300;
const GAP_MS = 140; // a breath between one card and the next
const RUSH_MS = 1100; // dwell while others are waiting their turn
const WAIT = 2; // how many may queue behind the one showing

interface Item { body: HTMLElement; cap: (Node | string)[]; cls: string; ms: number; must: boolean; jid: number }
let queue: Item[] = [];
let showing: Item | null = null;
let timer: number | null = null;
let since = 0;
let revealed = 0;
let newestSeen = -1;
let release: ((jid: number) => void) | null = null;

/** The journal id the pile has caught up to: cards newer than this are still having their moment. */
export function pileRevealed(): number { return revealed; }
export function onPileRelease(fn: (jid: number) => void): void { release = fn; }
function releaseToPile(jid: number): void {
  if (!jid || jid <= revealed) return;
  revealed = jid;
  release?.(jid);
}
/** Is a card still having its moment? Capped, so a tab left in the background cannot wedge anything waiting on it. */
export function showcaseBusy(): boolean {
  if (!showing && !queue.length) return false;
  return !(since && Date.now() - since > IMPLODE_SHOW_MS + SHOWCASE_FADE_MS + 2500);
}
/** Run `fn` once the middle of the board is clear, or after `capMs` at the latest. */
export function afterShowcase(fn: () => void, capMs: number): void {
  const t0 = Date.now();
  const poll = () => { if (!showcaseBusy() || Date.now() - t0 > capMs) fn(); else setTimeout(poll, 100); };
  poll();
}
export function resetShowcase(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  queue = []; showing = null; since = 0; revealed = 0; newestSeen = -1;
  const el = $("showcase");
  el.hidden = true; el.className = ""; clear(el);
}
/* Called on every render: a screen that has not looked at this table before
   catches up silently (nothing is turned over, everything is on the pile),
   a new game starts the count again, and entries with no reveal of their
   own pass straight through to the pile. */
export function syncPile(s: GameState): void {
  const newest = s.journal.length ? s.journal[s.journal.length - 1].id : 0;
  if (newestSeen < 0 || newest < newestSeen) { resetShowcase(); newestSeen = newest; revealed = newest; return; }
  newestSeen = newest;
  const pending = new Set<number>([...queue.map((q) => q.jid), showing ? showing.jid : -1]);
  for (const p of s.pile) if (p.jid > revealed && !pending.has(p.jid)) revealed = p.jid;
}

function push(item: Item): void {
  queue.push(item);
  // Keep the newest: a stale card is worth less than an accurate board. A `must` is never dropped.
  while (queue.length > WAIT) {
    const i = queue.findIndex((x) => !x.must);
    if (i < 0) break;
    releaseToPile(queue[i].jid);
    queue.splice(i, 1);
  }
  if (!showing) run();
}
function run(): void {
  const el = $("showcase");
  const next = queue.shift();
  if (!next) { showing = null; since = 0; return; }
  showing = next;
  since = Date.now();
  if (timer) clearTimeout(timer);
  el.className = "";
  el.hidden = false;
  clear(el);
  el.append(next.body, h("div", { class: "showcap " + next.cls }, next.cap));
  const dwell = queue.length ? Math.min(next.ms, RUSH_MS) : next.ms;
  timer = window.setTimeout(() => {
    el.className = "out";
    timer = window.setTimeout(() => {
      el.hidden = true; el.className = ""; clear(el);
      timer = null;
      releaseToPile(next.jid);
      if (queue.length) timer = window.setTimeout(run, GAP_MS);
      else { showing = null; since = 0; }
    }, SHOWCASE_FADE_MS);
  }, dwell);
}

function cardBody(key: keyof typeof KITTEN, flavor: string | null, cls = ""): HTMLElement {
  const art = has(cardArt(key, flavor)) ? cardArt(key, flavor) : null;
  return h("div", { class: "showcard " + cls, style: art ? { backgroundImage: `url(${art})` } : null }, art ? null : h("span", { class: "kn" }, KITTEN[key].name));
}
const bare = (text: string) => text.replace(/\s+/g, " ").replace(/^[⏱🏆💥]️?\s*/u, "");

/** Is there a Defuse in this hand for this entry, right now? Asked of the seat at THIS screen only. */
function iCanDefuse(s: GameState, e: JournalEntry | undefined, view: number, now: number): boolean {
  if (!e) return false;
  const p = s.players[view];
  if (!p) return false;
  const fresh = p.cards.some((c) => c.key === "defuse" && (c.boughtTurn !== s.turnCounter || playableWhenDrawn(c)));
  return fresh && canDefuseEntry(s, geometry(s.board), e, view, now);
}
/* The card that would answer it, held up in the middle of the board: the
   two seconds after somebody moves the robber onto your wheat are the moment
   that matters, and the pile's tag in the corner is too quiet for it. */
function answerShowcase(s: GameState, text: string, jid: number): void {
  push({
    body: h("div", { class: "showcard answer", style: has(cardArt("defuse", null)) ? { backgroundImage: `url(${cardArt("defuse", null)})` } : null },
      has(cardArt("defuse", null)) ? null : h("span", { class: "kn" }, "Defuse"), h("span", { class: "answerflag" }, "answer")),
    cap: [...tint(s, bare(text)), h("br"), h("span", { class: "answerline" }, "You can Defuse this — drop the card on the pile")],
    cls: "defend", ms: 2600, must: false, jid: 0,
  });
  void jid;
}

/* A card that has been played and is waiting on its aim. Shown once, as it
   leaves the hand: an Alter the Future has to name its two hexes before it
   can be journalled, and this is the moment in between, which used to be
   silent. Held past the moment the pick clears, so the entry's own reveal
   can decline to turn a board card over a second time: that reveal would
   land exactly over the two numbers changing places, the one thing worth
   watching. A targeted card changes nothing on the board, so its second
   reveal, the one naming the victim, is kept. */
let justRevealed = -1;
export function showPlaying(s: GameState, pid: number, card: Card): void {
  justRevealed = card.id;
  const key = card.key as keyof typeof KITTEN;
  push({ body: cardBody(key, card.flavor), cap: tint(s, `${s.players[pid]?.name ?? ""} plays ${KITTEN[key].name}`), cls: "", ms: 1500, must: false, jid: 0 });
}

/** One reveal. `text` is the line the entry wrote; `view` the seat at this screen. */
export function showcase(s: GameState, what: string, pid: number, jid: number | null, text: string, view: number, now: number): void {
  const e = jid === null ? undefined : entryById(s, jid);
  const answerable = iCanDefuse(s, e, view, now);
  const id = jid ?? 0;
  const who = s.players[pid]?.name ?? "";
  switch (what) {
    case "timeout": push({ body: h("div", { class: "showglyph timeout" }, "⏱"), cap: tint(s, bare(text)), cls: "seven", ms: 2400, must: false, jid: id }); return;
    case "winnoped": push({ body: h("div", { class: "showglyph winnoped" }, "🏆"), cap: tint(s, bare(text)), cls: "big", ms: 3600, must: true, jid: id }); return;
    // The game ending gets the longest dwell in the game, and is never dropped from the queue.
    case "win": push({ body: h("div", { class: "showglyph win" }, "🏆"), cap: tint(s, bare(text)), cls: "big", ms: 4600, must: true, jid: id }); return;
    case "seven":
      push({ body: h("div", { class: "showseven" }, "7"), cap: tint(s, `${who} rolls a seven — hands over 7 are cut, and the robber moves`), cls: "seven", ms: SHOWCASE_MS, must: false, jid: id });
      if (answerable) answerShowcase(s, text, id);
      return;
    // The Imploding Kitten never reaches a hand: half again the size, spun up out of a point, left standing.
    case "implode": push({ body: cardBody("implode", null, "implode"), cap: tint(s, bare(text)), cls: "implode", ms: IMPLODE_SHOW_MS, must: true, jid: id }); return;
    // No card of its own: the most Defusable thing in the game, and it had no moment at all.
    case "robbery":
      push({ body: h("div", { class: "showglyph robbery" }, "🕵"), cap: tint(s, bare(text)), cls: "attack", ms: 2000, must: false, jid: id });
      if (answerable) answerShowcase(s, text, id);
      return;
  }
  if (what in KITTEN) {
    const key = what as keyof typeof KITTEN;
    if (e?.card && e.card.id === justRevealed) {
      justRevealed = -1;
      if (KITTEN[key].kind === "board") { releaseToPile(id); if (answerable) answerShowcase(s, text, id); return; }
    }
    push({ body: cardBody(key, e?.card?.flavor ?? null), cap: tint(s, bare(text || `${who} plays ${KITTEN[key].name}`)), cls: "", ms: SHOWCASE_MS, must: false, jid: id });
    if (answerable) answerShowcase(s, text, id);
    return;
  }
  push({ body: h("div", { class: "showglyph" }, "•"), cap: tint(s, bare(text || what)), cls: "", ms: SHOWCASE_MS, must: false, jid: id });
}
