import { h } from "./dom";

/** A row of mutually exclusive buttons. Toggles the lit one in place and calls `set`. */
export function seg<T extends string>(opts: { v: T; label: string; title?: string }[], cur: () => T, set: (v: T) => void): HTMLElement {
  const row = h("div", { class: "seg" });
  for (const o of opts) {
    const b = h("button", { class: "sm" + (o.v === cur() ? " on" : ""), title: o.title ?? "", onclick: () => { set(o.v); for (const x of row.children) x.classList.toggle("on", x === b); } }, o.label);
    row.append(b);
  }
  return row;
}
