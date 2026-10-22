/* The middle of the table: dice, the discard pile, the deck, the mode tag. */
import { KITTEN, MODES, type GameState } from "@exploding-catan/engine";
import { $, clear, h } from "./dom";
import { cardArt, cardBack, has } from "../art";

export function drawTable(s: GameState): void {
  const dice = $("dice");
  clear(dice);
  if (s.rolled) dice.append(h("div", { class: "die" }, String(s.rolled[0])), h("div", { class: "die red" }, String(s.rolled[1])));

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
  clear($("seats")); clear($("board")); clear($("bottom")); clear($("panels")); clear($("dice")); clear($("pile")); clear($("deck"));
  $("modeTag").hidden = true;
  $("clock").hidden = true;
}
