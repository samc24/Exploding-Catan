/* The painted portraits, and a picker for them. */
import { AVATAR_IDS, freeAvatar } from "@exploding-catan/protocol";
export { freeAvatar };
import { h } from "./dom";
import { avatarArt, has } from "../media/art";
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

