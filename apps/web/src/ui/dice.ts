/* Every roll this game: a histogram of the sums and the most recent throws. */
import type { GameState } from "@exploding-catan/engine";
import { clear, h } from "./dom";

let lastCount = -1;
export function drawDiceHistory(root: HTMLElement, s: GameState): void {
  if (root.hidden && root.childElementCount) return;
  if (s.diceLog.length === lastCount && root.childElementCount) return;
  lastCount = s.diceLog.length;
  clear(root);
  const counts = Array.from({ length: 11 }, () => 0);
  for (const n of s.diceLog) counts[n - 2]++;
  const max = Math.max(1, ...counts);
  if (!s.diceLog.length) { root.append(h("p", { style: { color: "var(--dim)" } }, "No dice thrown yet.")); return; }
  root.append(
    h("div", null, h("b", null, String(s.diceLog.length)), ` roll${s.diceLog.length === 1 ? "" : "s"} this game`),
    h("div", { class: "hist" }, counts.map((c, i) => h("div", { class: "bar" + (i + 2 === 7 ? " red" : ""), style: { height: `${(c / max) * 100}%` } }, c ? h("i", null, String(c)) : null))),
    h("div", { class: "histlbl" }, counts.map((_, i) => h("span", null, String(i + 2)))),
    h("div", { style: { color: "var(--dim)", margin: "6px 0 4px" } }, "Most recent first"),
    h("div", { class: "recent" }, s.diceLog.slice(-30).reverse().map((n) => h("span", { class: n === 7 ? "seven" : "" }, String(n)))),
  );
}
