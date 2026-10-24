/* The middle of the table: dice, the discard pile, the deck, the mode tag. */
import { KITTEN, MODES, answersFor, playableWhenDrawn, type GameState } from "@exploding-catan/engine";
import { $, clear, h } from "./dom";
import { cardArt, cardBack, has } from "../media/art";
import { motion } from "../state/settings";
import { pileRevealed } from "./showcase";

let lastRoll = -1;
let spinTimer: number | null = null;
/** How long a fresh throw shows changing faces before it settles. */
const SPIN_MS = 600;

/** A die's face as nine cells, the pips lit. */
const DIE_PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function pips(n: number): HTMLElement[] {
  const on = DIE_PIPS[n] ?? [];
  return Array.from({ length: 9 }, (_, i) => h("i", { class: on.includes(i) ? "" : "off" }));
}

/* ── the discard pile ──────────────────────────────────────────────────
   Every kitten card played, face up, newest on top. The answer to "what
   just happened" for anybody not reading the log. A card still turning
   over in the middle of the board is kept off it until its moment is over
   (pileRevealed); the wheel walks back through it: scroll up, reach the
   bottom. A cancelled card stays, greyed and stamped, because it really
   was spent; only what was rewound BEHIND an answer leaves. */
let discardIdx = 0;
let discardTop = -1;
let pileSig = "";
let shownJid: number | null = null;
/** The card the pile is showing while somebody looks back through it (null at the top). */
export function pileShownJid(): number | null { return discardIdx > 0 ? shownJid : null; }
function discardStack(s: GameState) {
  const out: GameState["pile"] = [];
  const upTo = pileRevealed();
  for (let i = s.pile.length - 1; i >= 0; i--) if (s.pile[i].jid <= upTo) out.push(s.pile[i]);
  return out;
}
export function installPileWheel(redraw: () => void): void {
  window.addEventListener("wheel", (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest("#pile") : null;
    if (!el) return;
    ev.preventDefault();
    // Scrolling UP walks towards the BOTTOM of the pile; scrolling down comes back to the top card.
    const was = discardIdx;
    discardIdx = Math.max(0, discardIdx + (ev.deltaY < 0 ? 1 : -1));
    if (discardIdx !== was) redraw();
  }, { passive: false });
}

let diceSig = "";
export function drawTable(s: GameState, view: number, now: number): void {
  const dice = $("dice");
  // Written only when the throw itself changes: a repaint for any other reason (a hold clearing, a piece
  // landing) must not replace dice that are mid-tumble with identical ones that are not.
  const rollEntry = s.rolled ? [...s.journal].reverse().find((e) => e.kind === "roll") : undefined;
  const sig = s.rolled ? `${rollEntry?.id ?? -1}:${s.rolled[0]}:${s.rolled[1]}` : "";
  if (sig !== diceSig || !sig) {
  diceSig = sig;
  clear(dice);
  if (s.rolled) {
    // A new throw tumbles in with its faces changing, then settles; a repaint of the same throw does not.
    const fresh = !!rollEntry && rollEntry.id !== lastRoll;
    if (rollEntry) lastRoll = rollEntry.id;
    const lively = fresh && motion() === "full"; // calm and off: the faces simply appear
    const cls = lively ? " tumble" : "";
    const a = h("div", { class: "die" + cls, title: String(s.rolled[0]) }, pips(s.rolled[0]));
    const b = h("div", { class: "die red" + cls, title: String(s.rolled[1]), style: { animationDelay: "60ms" } }, pips(s.rolled[1]));
    const sum = s.rolled[0] + s.rolled[1];
    dice.append(a, b, h("span", { class: "dicesum" + (sum === 7 ? " seven" : "") }, String(sum)));
    if (spinTimer !== null) { clearInterval(spinTimer); spinTimer = null; }
    if (lively) {
      const final = s.rolled;
      const start = Date.now();
      spinTimer = window.setInterval(() => {
        if (!a.isConnected || Date.now() - start >= SPIN_MS) {
          if (spinTimer !== null) clearInterval(spinTimer);
          spinTimer = null;
          a.replaceChildren(...pips(final[0])); b.replaceChildren(...pips(final[1]));
          return;
        }
        a.replaceChildren(...pips(1 + Math.floor(Math.random() * 6)));
        b.replaceChildren(...pips(1 + Math.floor(Math.random() * 6)));
      }, 75);
    }
  } else lastRoll = -1;
  }

  drawPile(s, view, now);

  const deck = $("deck"); clear(deck);
  deck.append(h("div", { class: "cardface back", style: has(cardBack) ? { backgroundImage: `url(${cardBack})` } : null }, h("span", { class: "ct" }, String(s.deck.length)), h("span", { class: "cost" }, "any 3 unique")), h("div", { class: "pilelbl" }, "deck"));

  const tag = $("modeTag");
  tag.hidden = s.mode === "normal";
  tag.textContent = MODES[s.mode].name;
  tag.title = MODES[s.mode].blurb;
}

function drawPile(s: GameState, view: number, now: number): void {
  const pile = $("pile");
  const st = discardStack(s);
  const topId = st.length ? st[0].jid : -1;
  if (topId !== discardTop) { discardTop = topId; discardIdx = 0; }
  if (discardIdx > st.length - 1) discardIdx = Math.max(0, st.length - 1);
  const rec = st.length ? st[discardIdx] : null;
  shownJid = rec ? rec.jid : null;
  const def = rec ? KITTEN[rec.card.key] : null;
  // "You can answer this", for the seat at this screen only: anything the pile could Defuse, not only the card on show.
  const p = s.players[view];
  const canD = !!p && p.cards.some((c) => c.key === "defuse" && (c.boughtTurn !== s.turnCounter || playableWhenDrawn(c))) && answersFor(s, "defuse", view, now).length > 0;
  const art = rec && has(cardArt(rec.card.key, rec.card.flavor)) ? cardArt(rec.card.key, rec.card.flavor) : null;
  const cls = "cardface" + (st.length ? "" : " empty") + (canD ? " answerable" : "") + (rec?.cancelled ? " cancelled" : "") + (discardIdx > 0 ? " back" : "");
  const title = !st.length ? "Cards played land here"
    : def ? `${def.name}${rec?.cancelled ? " — cancelled" : ""} — scroll up to look further down the pile` : "Scroll up to look further down the pile";
  // Compare before writing: this is redrawn on every repaint. And the card element itself is kept
  // across a rewrite, so a drop highlight on it survives a reveal ending mid-drag.
  const sig = `${cls}|${rec?.jid ?? ""}|${art ?? def?.name ?? ""}|${title}`;
  if (sig === pileSig && pile.childElementCount) return;
  pileSig = sig;
  let card = pile.querySelector<HTMLElement>(".cardface");
  if (!card) { clear(pile); card = h("div"); pile.append(card, h("div", { class: "pilelbl" }, "discard")); }
  const lit = ["droppable", "dropping"].filter((c) => card!.classList.contains(c));
  card.className = [cls, ...lit].join(" ");
  card.title = title;
  if (rec) card.dataset.jid = String(rec.jid); else delete card.dataset.jid;
  clear(card);
  card.append(rec ? h("div", { class: "face", style: art ? { backgroundImage: `url(${art})` } : null }, art ? null : h("span", { class: "kn" }, def!.name)) : h("div", { class: "face none" }, "nothing played yet"));
  if (rec?.cancelled) card.append(h("span", { class: "disccx" }, "cancelled"));
  if (canD) card.append(h("span", { class: "disctag" }, "answer"));
}

export function clearTable(): void {
  clear($("seats")); clear($("board")); clear($("bottom")); clear($("panels")); clear($("dice")); clear($("pile")); clear($("deck")); clear($("ticker"));
  pileSig = ""; diceSig = "";
  $("modeTag").hidden = true;
  $("clock").hidden = true;
}
