/* A line of the game's plain text, with the players' own colours put back
   into their names and the resources drawn as coloured chips. The engine
   speaks plain text (that is what travels); the screen colours it. */
import { RES, RES_NAME, type GameState, type Res } from "@exploding-catan/engine";
import { h } from "./dom";

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const resNames = RES.map((r) => RES_NAME[r]);
const byName: Record<string, Res> = Object.fromEntries(RES.map((r) => [RES_NAME[r], r]));

/** Tinted names and resource chips, as nodes. Longest name first, so Jo cannot eat half of Josh. */
export function tint(s: GameState | null, text: string): (Node | string)[] {
  const names = s ? s.players.map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length) : [];
  const colour = new Map(s ? s.players.map((p) => [p.name, p.color]) : []);
  const alts = [...names.map(esc), `\\d+ (?:${resNames.join("|")})\\b`];
  const re = new RegExp(`(${alts.join("|")})`, "g");
  const out: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const hit = m[0];
    if (colour.has(hit)) out.push(h("b", { class: "pn", style: { color: colour.get(hit)! } }, hit));
    else {
      const [n, name] = hit.split(" ");
      const r = byName[name];
      out.push(h("span", { class: "rchip", style: { "--rc": `var(--${r})` } }, h("span", { class: "rdot" }), `${n} ${name}`));
    }
    last = at + hit.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
