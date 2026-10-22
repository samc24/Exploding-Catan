/* ══════════════════════════════════════════════════════════════════════
   FX — cards in flight
   ══════════════════════════════════════════════════════════════════════
   The engine says what moved (a production payout, cards between seats,
   a kitten card drawn); this draws it moving. Pure decoration: nothing here
   is read back, and with reduced motion on, nothing here runs at all.
   ══════════════════════════════════════════════════════════════════════ */
import { RES, type GameEvent, type GameState, type Res } from "@exploding-catan/engine";
import { geometry } from "@exploding-catan/engine";
import { $, h } from "./dom";
import { cardArt, cardBack, has, resArt } from "../art";

export interface Point { x: number; y: number }

function reduced(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
function layer(): HTMLElement {
  let el = document.getElementById("fx");
  if (!el) { el = h("div", { id: "fx" }); document.body.append(el); }
  return el;
}
function centre(el: Element | null): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
export function seatPoint(pid: number): Point | null {
  return centre($("seats").children[pid] ?? null);
}
export function handPoint(): Point | null {
  return centre(document.querySelector("#bottom .hand")) ?? centre($("bottom"));
}
export function deckPoint(): Point | null {
  return centre(document.querySelector("#deck .cardface"));
}
export function bankPoint(): Point | null {
  return deckPoint();
}
export function hexPoint(s: GameState, hid: number): Point | null {
  const svg = $("board") as unknown as SVGSVGElement;
  const geo = geometry(s.board);
  const hx = geo.hexes[hid];
  const ctm = svg.getScreenCTM();
  if (!hx || !ctm) return null;
  const p = svg.createSVGPoint();
  p.x = hx.x; p.y = hx.y;
  const q = p.matrixTransform(ctm);
  return { x: q.x, y: q.y };
}

/** One thing flying from a to b. Arcs a little, shrinks into its landing. */
export function fly(a: Point, b: Point, face: HTMLElement, delay = 0, ms = 650): void {
  if (reduced()) return;
  const el = h("div", { class: "flyer" }, face);
  Object.assign(el.style, { left: a.x + "px", top: a.y + "px" });
  layer().append(el);
  const dx = b.x - a.x, dy = b.y - a.y;
  const lift = -Math.min(120, Math.hypot(dx, dy) * 0.25);
  const anim = el.animate([
    { transform: "translate(-50%,-50%) translate(0,0) scale(1)", opacity: 0 },
    { transform: `translate(-50%,-50%) translate(${dx * 0.08}px,${dy * 0.08 + lift * 0.4}px) scale(1.05)`, opacity: 1, offset: 0.12 },
    { transform: `translate(-50%,-50%) translate(${dx * 0.5}px,${dy * 0.5 + lift}px) scale(1.05)`, opacity: 1, offset: 0.55 },
    { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(0.6)`, opacity: 0.1 },
  ], { duration: ms, delay, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
}

export function resFace(r: Res): HTMLElement {
  const art = has(resArt(r)) ? resArt(r) : null;
  return h("div", { class: "fly-res", style: art ? { backgroundImage: `url(${art})` } : { background: `var(--${r})` } });
}
export function kittenFace(key: string | null, flavor: string | null): HTMLElement {
  const art = key && key !== "hidden" && has(cardArt(key as never, flavor)) ? cardArt(key as never, flavor) : has(cardBack) ? cardBack : null;
  return h("div", { class: "fly-kit", style: art ? { backgroundImage: `url(${art})` } : null });
}

/** Turn one action's events into flights. `view` is the seat at this screen. */
export function playEvents(s: GameState, events: GameEvent[], view: number): void {
  if (reduced()) return;
  let delay = 0;
  for (const ev of events) {
    if (ev.type === "production") {
      // Each card leaves the hex that grew it for the seat that owns it.
      let i = 0;
      for (const src of ev.sources) {
        const a = hexPoint(s, src.hid), b = src.pid === view ? handPoint() : seatPoint(src.pid);
        if (!a || !b) continue;
        for (let k = 0; k < src.n; k++) fly(a, b, resFace(src.r), delay + i++ * 70);
      }
      delay += 250;
    } else if (ev.type === "cards") {
      const a = ev.from === null ? bankPoint() : ev.from === view ? handPoint() : seatPoint(ev.from);
      const b = ev.to === null ? bankPoint() : ev.to === view ? handPoint() : seatPoint(ev.to);
      if (!a || !b) continue;
      let i = 0;
      const total = RES.reduce((t, r) => t + ev.bundle[r], 0);
      if (ev.hidden || total === 0) { fly(a, b, h("div", { class: "fly-res back" }), delay); delay += 200; continue; }
      for (const r of RES) for (let k = 0; k < ev.bundle[r]; k++) fly(a, b, resFace(r), delay + i++ * 70);
      delay += 250;
    } else if (ev.type === "kitten") {
      const a = deckPoint(), b = ev.pid === view ? handPoint() : seatPoint(ev.pid);
      if (!a || !b) continue;
      fly(a, b, kittenFace(ev.pid === view ? ev.card.key : null, ev.card.flavor), delay, 800);
      delay += 300;
    }
  }
}
