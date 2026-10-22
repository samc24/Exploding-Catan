/* The middle of the table: dice, the discard pile, the deck, the mode tag. */
import { KITTEN, MODES, type GameState } from "@exploding-catan/engine";
import { $, clear, h } from "./dom";
import { cardArt, cardBack, has } from "../art";

function reduced(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

let lastRoll = -1;
let spinTimer: number | null = null;
/** How long a fresh throw shows changing faces before it settles. */
const SPIN_MS = 600;
export function drawTable(s: GameState): void {
  const dice = $("dice");
  clear(dice);
  if (s.rolled) {
    // A new throw tumbles in with its faces changing, then settles; a repaint of the same throw does not.
    const rollEntry = [...s.journal].reverse().find((e) => e.kind === "roll");
    const fresh = !!rollEntry && rollEntry.id !== lastRoll;
    if (rollEntry) lastRoll = rollEntry.id;
    const cls = fresh ? " tumble" : "";
    const a = h("div", { class: "die" + cls }, String(s.rolled[0]));
    const b = h("div", { class: "die red" + cls, style: { animationDelay: "60ms" } }, String(s.rolled[1]));
    dice.append(a, b);
    if (spinTimer !== null) { clearInterval(spinTimer); spinTimer = null; }
    if (fresh && !reduced()) {
      const final = s.rolled;
      const start = Date.now();
      spinTimer = window.setInterval(() => {
        if (!a.isConnected || Date.now() - start >= SPIN_MS) {
          if (spinTimer !== null) clearInterval(spinTimer);
          spinTimer = null;
          a.textContent = String(final[0]); b.textContent = String(final[1]);
          return;
        }
        a.textContent = String(1 + Math.floor(Math.random() * 6));
        b.textContent = String(1 + Math.floor(Math.random() * 6));
      }, 75);
    }
  } else lastRoll = -1;

  const pile = $("pile"); clear(pile);
  const top = [...s.pile].reverse().find((p) => !p.cancelled);
  const topArt = top && has(cardArt(top.card.key, top.card.flavor)) ? cardArt(top.card.key, top.card.flavor) : null;
  pile.append(h("div", { class: "cardface" + (top ? "" : " back"), style: topArt ? { backgroundImage: `url(${topArt})` } : null, title: top ? KITTEN[top.card.key].name : "Discard pile" }, top && !topArt ? KITTEN[top.card.key].name : ""), h("div", { class: "pilelbl" }, "discard"));
  const deck = $("deck"); clear(deck);
  deck.append(h("div", { class: "cardface back", style: has(cardBack) ? { backgroundImage: `url(${cardBack})` } : null }, h("span", { class: "ct" }, String(s.deck.length))), h("div", { class: "pilelbl" }, "deck"));

  const tag = $("modeTag");
  tag.hidden = s.mode === "normal";
  tag.textContent = MODES[s.mode].name;
}
export function clearTable(): void {
  clear($("seats")); clear($("board")); clear($("bottom")); clear($("panels")); clear($("dice")); clear($("pile")); clear($("deck")); clear($("ticker"));
  $("modeTag").hidden = true;
  $("clock").hidden = true;
}
