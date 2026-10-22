/* The painted portraits, and a picker for them. */
import { AVATAR_IDS } from "@exploding-catan/protocol";
import { h } from "./dom";
import { avatarArt, has } from "../art";

/** A round portrait with the player's colour ring; an initial when the art is missing. */
export function portrait(avatar: string | null | undefined, color: string, name: string, size = 40): HTMLElement {
  const n = Number(avatar);
  const art = avatar && AVATAR_IDS.includes(String(avatar)) && has(avatarArt(n)) ? avatarArt(n) : null;
  const style: Record<string, string> = { width: size + "px", height: size + "px", "--c": color, fontSize: Math.round(size * 0.45) + "px" };
  if (art) style.backgroundImage = `url(${art})`;
  return h("div", { class: "portrait", style }, art ? "" : (name[0] ?? "?").toUpperCase());
}
/** A grid of every portrait; `onPick` gets the chosen id. */
export function avatarGrid(current: string | null, onPick: (avatar: string) => void): HTMLElement {
  const grid = h("div", { class: "avgrid" });
  for (const id of AVATAR_IDS) {
    const n = Number(id);
    const art = has(avatarArt(n)) ? avatarArt(n) : null;
    if (!art) continue; // only portraits that are really there
    grid.append(h("button", { class: "av" + (current === id ? " on" : ""), title: `Portrait ${id}`, style: { backgroundImage: `url(${art})` }, onclick: () => onPick(id) }));
  }
  return grid;
}
