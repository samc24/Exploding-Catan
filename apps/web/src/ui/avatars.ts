/* The painted portraits, and a picker for them. */
import { AVATAR_IDS } from "@exploding-catan/protocol";
import { h } from "./dom";
import { avatarArt, has } from "../art";
import { closeModal, openModal } from "./dialogs";

/** A round portrait with the player's colour ring; an initial when the art is missing. */
export function portrait(avatar: string | null | undefined, color: string, name: string, size = 40): HTMLElement {
  const n = Number(avatar);
  const art = avatar && AVATAR_IDS.includes(String(avatar)) && has(avatarArt(n)) ? avatarArt(n) : null;
  const style: Record<string, string> = { width: size + "px", height: size + "px", "--c": color, fontSize: Math.round(size * 0.45) + "px" };
  if (art) style.backgroundImage = `url(${art})`;
  return h("div", { class: "portrait", style }, art ? "" : (name[0] ?? "?").toUpperCase());
}
/** A grid of every portrait, and None (your initial on the seat colour); `onPick` gets the chosen id. */
export function avatarGrid(current: string | null, onPick: (avatar: string) => void): HTMLElement {
  const grid = h("div", { class: "avgrid" });
  grid.append(h("button", { class: "av none" + (!current ? " on" : ""), title: "No picture: your initial on your colour", onclick: () => onPick("") }, "None"));
  for (const id of AVATAR_IDS) {
    const n = Number(id);
    const art = has(avatarArt(n)) ? avatarArt(n) : null;
    if (!art) continue; // only portraits that are really there
    grid.append(h("button", { class: "av" + (current === id ? " on" : ""), title: `Portrait ${id}`, style: { backgroundImage: `url(${art})` }, onclick: () => onPick(id) }));
  }
  return grid;
}
/** Your picture, mid-game: the same grid in a dialog. */
export function avatarDialog(current: string | null, onPick: (avatar: string) => void): void {
  openModal("Your picture", avatarGrid(current, (a) => { closeModal(); onPick(a); }), [{ label: "Keep it", fn: closeModal }]);
}
/** A different face for each bot, never one a person at the table chose. */
export function freeAvatar(seat: number, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let k = 0; k < AVATAR_IDS.length; k++) { const id = AVATAR_IDS[((seat * 7) + k * 3) % AVATAR_IDS.length]; if (!used.has(id)) return id; }
  return AVATAR_IDS[(seat * 7) % AVATAR_IDS.length];
}
