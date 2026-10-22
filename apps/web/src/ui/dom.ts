/* A tiny element builder. No framework: the whole UI is a handful of
   functions that rebuild their region from the state. */
type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> | null;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...kids: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props, ...kids: Child[]): HTMLElement;
export function h(tag: string, props: Props = null, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  apply(el, props);
  append(el, kids);
  return el;
}
const SVG_NS = "http://www.w3.org/2000/svg";
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, props?: Props, ...kids: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, props ?? null);
  append(el, kids);
  return el;
}
function apply(el: Element, props: Props): void {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "style" && typeof v === "object") Object.assign((el as HTMLElement).style, v);
    else if (k === "class") el.setAttribute("class", String(v));
    else if (k === "dataset") for (const [dk, dv] of Object.entries(v as Record<string, string>)) (el as HTMLElement).dataset[dk] = dv;
    else if (k === "html") el.innerHTML = String(v);
    else el.setAttribute(k, String(v));
  }
}
function append(el: Element, kids: Child[]): void {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
}
export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error("missing #" + id);
  return el;
}
