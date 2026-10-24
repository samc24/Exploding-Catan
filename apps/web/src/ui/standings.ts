/* The final table, with every hand revealed. */
import { KITTEN, totalVP, vpCards, type GameState } from "@exploding-catan/engine";
import type { GameRecord } from "@exploding-catan/protocol";
import { h } from "./dom";
import { closeModal, openModal } from "./dialogs";
import { lineupLine, personal } from "./records-lines";

/** `book` is the record book and `people` the names of the humans at this table, for the lines under the standings. */
export function standings(s: GameState, onNewGame: () => void, book: GameRecord[] = [], people: string[] = []): void {
  if (s.phase !== "over" || s.winner === null) return;
  const w = s.players[s.winner];
  const order = [w, ...s.players.filter((q) => q.id !== w.id).sort((a, b) => totalVP(s, b) - totalVP(s, a))];
  const name = (q: typeof w) => h("span", null, h("span", { class: "dot", style: { background: q.color } }), h("b", { class: "pn", style: { color: q.color } }, q.name));
  const table = h("table", { class: "rank" }, h("tr", null, h("th"), h("th", null, "Player"), h("th", null, "Breakdown"), h("th", null, "VP")),
    order.map((q, i) => {
      const bits: string[] = [];
      if (q.settlements) bits.push(`${q.settlements} settlement${q.settlements === 1 ? "" : "s"}`);
      if (q.cities) bits.push(`${q.cities} cit${q.cities === 1 ? "y" : "ies"} (+${q.cities * 2})`);
      if (vpCards(q)) bits.push(`${vpCards(q)} Feral`);
      if (s.longestRoad.owner === q.id) bits.push("Longest Road +2");
      if (s.largestArmy.owner === q.id) bits.push(`Largest Army +2 (${q.knights}⚔)`);
      return h("tr", { class: i === 0 ? "win" : "" }, h("td", null, String(i + 1)), h("td", null, name(q)), h("td", null, bits.join(" · ") || "—"), h("td", null, String(totalVP(s, q))));
    }));
  // Every hand is on the table now: the kitten cards each player was still holding.
  const hands = h("div", { class: "hands" },
    h("h4", null, "Kitten cards still in hand"),
    order.map((q) => h("div", { class: "handrow" }, name(q), " ",
      q.cards.length ? q.cards.map((c) => h("span", { class: "kchip" + (c.key === "vp" ? " vp" : "") }, KITTEN[c.key]?.name ?? c.key)) : h("i", { style: { color: "var(--dim)" } }, "none"))));
  // The record book, now that this game is in it.
  const record = people.length ? h("div", { class: "book" },
    lineupLine(book, people) ? h("p", { class: "sub" }, lineupLine(book, people)) : null,
    h("p", { class: "sub" }, people.map((n) => { const p = personal(book, n); return `${n} ${p.wins}–${p.losses}`; }).join(" · ") + " overall")) : null;
  openModal(`${w.name} wins`, [h("p", { class: "sub", style: { color: "var(--dim)", margin: "0 0 6px" } }, "Final standings — every hand is revealed."), table, hands, ...(record ? [record] : [])], [
    { label: "Review board", fn: closeModal },
    { label: "New game", cls: "primary", fn: () => { closeModal(); onNewGame(); } },
  ]);
}
