/* The record book: who has beaten whom. Three views off the same lines:
   this lineup, each person overall, and head to head within the group. */
import { lineup, lineups, pairs, personal, type GameRecord } from "@exploding-catan/protocol";
import { h } from "./dom";
import { closeModal, openModal } from "./dialogs";

const pct = (w: number, g: number) => (g ? `${Math.round((w / g) * 100)}%` : "—");
const when = (at: number) => (at ? new Date(at).toLocaleDateString() : "");

/** The tables, for the standings and the dialog. `names` are the people at this table. */
export function recordsBody(all: GameRecord[], names: string[]): HTMLElement {
  const people = names.length ? names : [...new Set(all.flatMap((r) => r.players))].slice(0, 8);
  const body = h("div", { class: "records" });
  if (!all.length) { body.append(h("p", { class: "sub" }, "No finished games yet. The first one is written here when it ends.")); return body; }
  if (names.length >= 2) {
    const l = lineup(all, names);
    body.append(h("h4", null, "This lineup"), l.games
      ? h("table", { class: "rank" }, h("tr", null, h("th", null, "Player"), h("th", null, "Wins"), h("th", null, "Of")), names.map((n) => h("tr", null, h("td", null, n), h("td", null, String(l.wins[n] ?? 0)), h("td", null, String(l.games)))))
      : h("p", { class: "sub" }, "These people have not finished a game together yet."));
  }
  body.append(h("h4", null, "Overall"), h("table", { class: "rank" }, h("tr", null, h("th", null, "Player"), h("th", null, "W"), h("th", null, "L"), h("th", null, "Win rate")),
    people.map((n) => { const p = personal(all, n); return h("tr", null, h("td", null, n), h("td", null, String(p.wins)), h("td", null, String(p.losses)), h("td", null, pct(p.wins, p.games))); })));
  const hh = pairs(all, people);
  if (hh.length) body.append(h("h4", null, "Head to head"), h("table", { class: "rank" }, h("tr", null, h("th", null, "Pair"), h("th", null, "Record"), h("th", null, "Games together")),
    hh.map((p) => h("tr", null, h("td", null, `${p.a} vs ${p.b}`), h("td", null, `${p.aWins} – ${p.bWins}`), h("td", null, String(p.games))))));
  const seen = lineups(all).slice(0, 8);
  if (seen.length > 1) body.append(h("h4", null, "Lineups"), h("table", { class: "rank" }, h("tr", null, h("th", null, "Who"), h("th", null, "Games"), h("th", null, "Wins"), h("th", null, "Last")),
    seen.map((l) => h("tr", null, h("td", null, l.names.join(", ")), h("td", null, String(l.games)), h("td", null, Object.entries(l.wins).map(([n, w]) => `${n} ${w}`).join(" · ") || "bots"), h("td", null, when(l.last))))));
  return body;
}
export function recordsDialog(all: GameRecord[], names: string[]): void {
  openModal("Records", recordsBody(all, names), [{ label: "Close", cls: "primary", fn: closeModal }]);
}
