import { $, clear, h } from "./dom";

export interface Btn { label: string; cls?: string; disabled?: boolean; fn: () => void }

/** One modal at a time. Menus only: everything the game is waiting on is a panel.
    `body.hasmodal` lets the showcase move out of the dialog's way. */
export function openModal(title: string, body: HTMLElement | HTMLElement[], btns: Btn[]): void {
  const m = $("modal");
  clear(m);
  const box = h("div", { class: "box" }, h("h2", null, title), body);
  if (btns.length) box.append(h("div", { class: "btns" }, btns.map((b) => h("button", { class: b.cls ?? "", disabled: b.disabled, onclick: b.fn }, b.label))));
  m.append(box);
  m.hidden = false;
  document.body.classList.add("hasmodal");
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
export function closeModal(): void {
  const m = $("modal");
  m.hidden = true;
  clear(m);
  document.body.classList.remove("hasmodal");
}
export function modalOpen(): boolean { return !$("modal").hidden; }
