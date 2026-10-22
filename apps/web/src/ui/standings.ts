/* The final table, with every hand revealed. */
import { totalVP, vpCards, type GameState } from "@exploding-catan/engine";
import { h } from "./dom";
import { closeModal, openModal } from "./dialogs";

export function standings(s: GameState, onNewGame: () => void): void {
  if (s.phase !== "over" || s.winner === null) return;
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
    { label: "New game", cls: "primary", fn: () => { closeModal(); onNewGame(); } },
  ]);
}
