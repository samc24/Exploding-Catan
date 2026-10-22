import { $, clear, h } from "./dom";

export interface Btn { label: string; cls?: string; disabled?: boolean; fn: () => void }

/** One modal at a time. Menus only: everything the game is waiting on is a panel. */
export function openModal(title: string, body: HTMLElement | HTMLElement[], btns: Btn[]): void {
  const m = $("modal");
  clear(m);
  const box = h("div", { class: "box" }, h("h2", null, title), body);
  if (btns.length) box.append(h("div", { class: "btns" }, btns.map((b) => h("button", { class: b.cls ?? "", disabled: b.disabled, onclick: b.fn }, b.label))));
  m.append(box);
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
export function closeModal(): void {
  const m = $("modal");
  m.hidden = true;
  clear(m);
}
export function modalOpen(): boolean { return !$("modal").hidden; }
