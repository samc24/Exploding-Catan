/* A played card, or a moment, held up in the middle of the board. */
import { KITTEN, type GameState } from "@exploding-catan/engine";
import { $, clear, h } from "./dom";
import { cardArt, has } from "../art";

let timer: number | null = null;
export function showcase(s: GameState, what: string, pid: number): void {
  const el = $("showcase");
  const key = what in KITTEN ? (what as keyof typeof KITTEN) : null;
  const titles: Record<string, string> = { seven: "Seven!", win: "Victory", winnoped: "Forced Nope", timeout: "Out of time", implode: "Imploding Kitten" };
  const title = key ? KITTEN[key].name : titles[what] ?? what;
  const art = key && has(cardArt(key, null)) ? cardArt(key, null) : null;
  clear(el);
  el.append(h("div", { class: "big" + (art ? "" : " plain"), style: art ? { backgroundImage: `url(${art})` } : null }, h("b", null, title), h("i", null, s.players[pid]?.name ?? "")));
  el.hidden = false;
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(() => { el.hidden = true; }, what === "implode" ? 3000 : 2300);
}
