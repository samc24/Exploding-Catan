/* ══════════════════════════════════════════════════════════════════════
   FX — things that ought to be SEEN to happen
   ══════════════════════════════════════════════════════════════════════
   The engine says what moved (a payout, cards between seats, a kitten card
   drawn, a piece built, the robber landing, two tokens swapped); this draws
   it. Pure decoration: nothing here is read back by the rules.

   Cards stand still for a second where they start and a second where they
   land, fanned a little when several leave the same place. Each resource
   lands on its own counter, and the counter does not move until the card
   gets there: a HOLD subtracts whatever is still in the air, and clears
   itself on a timer the moment the card visually lands. Nothing is held
   when nothing is going to fly.

   Pieces come down where they are placed, the shape and colour of the real
   piece; the board leaves the piece out while it falls. A hex that pays
   flashes in its own colour. The robber landing and a token swapping get a
   big slow pulse. With motion set to calm a card is shown where it left and
   where it landed without travelling; with motion off, or in a tab nobody
   is looking at, nothing here runs at all.
   ══════════════════════════════════════════════════════════════════════ */
import { RES, RES_NAME, type GameEvent, type GameState, type Res } from "@exploding-catan/engine";
import { geometry } from "@exploding-catan/engine";
import { $, h, svg } from "./dom";
import { cardArt, cardBack, has, resArt, resBack } from "../art";
import { fxWillPlay, motion } from "../settings";

export interface Point { x: number; y: number }

const MAX_PER_FLIGHT = 16; // cards in one flight
const MAX_LIVE = 60; // flying nodes on screen at once
const MAX_FLIGHTS = 8; // flights out of one action
let live = 0;

export function layer(): HTMLElement {
  let el = document.getElementById("fxroot");
  if (!el) { el = h("div", { id: "fxroot" }); document.body.append(el); }
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
/** A seat card's counter: `res` or `kit`. Falls back to the card. */
function seatStat(pid: number, which: "res" | "kit"): Point | null {
  const seat = $("seats").children[pid];
  return centre(seat?.querySelector(`.stat[data-stat="${which}"]`) ?? null) ?? seatPoint(pid);
}
/** Just below a seat card: the trader's elbow, where the bank is for them. */
function elbowPoint(pid: number): Point | null {
  const p = seatPoint(pid);
  const seat = $("seats").children[pid];
  if (!p || !seat) return null;
  return { x: p.x, y: seat.getBoundingClientRect().bottom + 52 };
}
export function handPoint(): Point | null {
  return centre(document.querySelector("#bottom .hand")) ?? centre($("bottom"));
}
/** This screen's own counter for one resource. */
function chipPoint(r: Res): Point | null {
  return centre(document.querySelector(`#bottom .chip[data-res="${r}"]`)) ?? handPoint();
}
export function deckPoint(): Point | null {
  return centre(document.querySelector("#deck .cardface"));
}
export function hexPoint(s: GameState, hid: number): Point | null {
  const geo = geometry(s.board);
  const hx = geo.hexes[hid];
  return hx ? boardPoint(hx.x, hx.y) : null;
}
/** A board coordinate on the screen, and how big a board unit is there. */
function boardPoint(x: number, y: number): (Point & { scale: number }) | null {
  const el = $("board") as unknown as SVGSVGElement;
  const ctm = el.getScreenCTM();
  if (!ctm) return null;
  const p = el.createSVGPoint();
  p.x = x; p.y = y;
  const q = p.matrixTransform(ctm);
  return { x: q.x, y: q.y, scale: Math.hypot(ctm.a, ctm.b) || 1 };
}

/* ── flights ───────────────────────────────────────────────────────── */
/** Shown where it started, across, shown where it landed. */
export const FX_IN = 180, FX_HOLD = 1000, FX_FLY = 620, FX_OUT = 260;
export const FX_CARD_MS = FX_IN + FX_HOLD + FX_FLY + FX_HOLD + FX_OUT;
/** The same two moments with the journey taken out of the middle. */
const CFX_IN = 150, CFX_HOLD = 620, CFX_OUT = 190, CFX_SWAP = 50;
const CFX_CARD_MS = (CFX_IN + CFX_HOLD + CFX_OUT) * 2 + CFX_SWAP;
/** When a card visually lands, from the start of its flight. */
const LAND_MS = () => (motion() === "calm" ? CFX_IN + CFX_HOLD + CFX_OUT + CFX_SWAP + CFX_IN : FX_IN + FX_HOLD + FX_FLY);
export const STAGGER_MS = 110;
/** The dice settle before the cards they produced start moving. */
export const AFTER_ROLL_MS = 850;

function flyFrames(at: (p: Point, sc: number) => string, from: Point, to: Point): Keyframe[] {
  const t = FX_CARD_MS;
  const o1 = FX_IN / t, o2 = (FX_IN + FX_HOLD) / t, o3 = (FX_IN + FX_HOLD + FX_FLY) / t, o4 = (t - FX_OUT) / t;
  return [
    { transform: at(from, 0.45), opacity: 0, offset: 0, easing: "cubic-bezier(.2,.9,.3,1.3)" },
    { transform: at(from, 1), opacity: 1, offset: o1, easing: "linear" },
    { transform: at(from, 1), opacity: 1, offset: o2, easing: "cubic-bezier(.5,0,.3,1)" },
    { transform: at(to, 1), opacity: 1, offset: o3, easing: "linear" },
    { transform: at(to, 1), opacity: 1, offset: o4, easing: "ease-in" },
    { transform: at(to, 0.72), opacity: 0, offset: 1 },
  ];
}
function calmFrames(at: (p: Point, sc: number) => string, from: Point, to: Point): Keyframe[] {
  const t = CFX_CARD_MS, p = (ms: number) => ms / t;
  const a1 = CFX_IN, a2 = a1 + CFX_HOLD, a3 = a2 + CFX_OUT, b0 = a3 + CFX_SWAP, b1 = b0 + CFX_IN, b2 = b1 + CFX_HOLD;
  return [
    { transform: at(from, 1), opacity: 0, offset: 0, easing: "ease-out" },
    { transform: at(from, 1), opacity: 1, offset: p(a1), easing: "linear" },
    { transform: at(from, 1), opacity: 1, offset: p(a2), easing: "ease-in" },
    { transform: at(from, 1), opacity: 0, offset: p(a3), easing: "linear" },
    { transform: at(to, 1), opacity: 0, offset: p(b0), easing: "ease-out" },
    { transform: at(to, 1), opacity: 1, offset: p(b1), easing: "linear" },
    { transform: at(to, 1), opacity: 1, offset: p(b2), easing: "ease-in" },
    { transform: at(to, 1), opacity: 0, offset: 1 },
  ];
}

/** One thing flying from a to b. `idx` fans several from the same place. */
export function fly(a: Point, b: Point, face: HTMLElement, delay = 0, idx = 0): void {
  if (!fxWillPlay() || live >= MAX_LIVE) return;
  const el = h("div", { class: "flyer" }, face);
  layer().append(el);
  live++;
  const fan = { x: (idx % 4) * 9 - 13, y: Math.floor(idx / 4) * 7 - 6 };
  const at = (p: Point, sc: number) => `translate(${p.x + fan.x}px,${p.y + fan.y}px) translate(-50%,-50%) scale(${sc})`;
  const calm = motion() === "calm";
  const ms = calm ? CFX_CARD_MS : FX_CARD_MS;
  const anim = el.animate(calm ? calmFrames(at, a, b) : flyFrames(at, a, b), { duration: ms, delay, fill: "both" });
  const done = () => { if (el.isConnected) { el.remove(); live = Math.max(0, live - 1); } };
  anim.onfinish = done;
  anim.oncancel = done;
  // A tab sent to the background never runs the animation, so nothing would fire onfinish.
  setTimeout(done, ms + delay + 400);
}

export function resFace(r: Res): HTMLElement {
  const art = has(resArt(r)) ? resArt(r) : null;
  return h("div", { class: "fly-res", title: RES_NAME[r], style: art ? { backgroundImage: `url(${art})` } : { background: `var(--${r})` } });
}
/** The one resource card nobody is allowed to see: the one the robber takes. */
function resBackFace(): HTMLElement {
  return h("div", { class: "fly-res back", style: has(resBack) ? { backgroundImage: `url(${resBack})` } : null });
}
export function kittenFace(key: string | null, flavor: string | null): HTMLElement {
  const art = key && key !== "hidden" && has(cardArt(key as never, flavor)) ? cardArt(key as never, flavor) : has(cardBack) ? cardBack : null;
  return h("div", { class: "fly-kit", style: art ? { backgroundImage: `url(${art})` } : null });
}

/* ── holds: the counter does not move until the card gets there ────── */
const resHolds = new Map<string, number>();
const kitHolds = new Map<number, number>();
const cardHolds = new Set<number>();
let holdTurn = -1;
function holdRes(pid: number, r: Res, until: number): void {
  const k = `${pid}:${r}`;
  resHolds.set(k, (resHolds.get(k) ?? 0) + 1);
  setTimeout(() => { const n = (resHolds.get(k) ?? 1) - 1; if (n <= 0) resHolds.delete(k); else resHolds.set(k, n); repaint(); }, until);
}
function holdKit(pid: number, cardId: number | null, until: number): void {
  kitHolds.set(pid, (kitHolds.get(pid) ?? 0) + 1);
  if (cardId !== null) cardHolds.add(cardId);
  setTimeout(() => { const n = (kitHolds.get(pid) ?? 1) - 1; if (n <= 0) kitHolds.delete(pid); else kitHolds.set(pid, n); if (cardId !== null) cardHolds.delete(cardId); repaint(); }, until);
}
/** How many of this resource are still in the air on their way to this seat. */
export function heldRes(pid: number, r: Res): number { return resHolds.get(`${pid}:${r}`) ?? 0; }
/** How many kitten cards are still on their way to this seat. */
export function heldKit(pid: number): number { return kitHolds.get(pid) ?? 0; }
/** A drawn card that has not landed in the hand yet. */
export function heldCard(id: number): boolean { return cardHolds.has(id); }
let repaint: () => void = () => {};
/** The screen's repaint, for when a hold clears. */
export function onHoldCleared(fn: () => void): void { repaint = fn; }
/** Holds are dropped at the end of a turn: a tab nobody looks at throttles its timers to a crawl. */
export function dropHoldsFor(s: GameState): void {
  if (s.turnCounter === holdTurn) return;
  holdTurn = s.turnCounter;
  resHolds.clear(); kitHolds.clear(); cardHolds.clear();
}

/** Turn one action's events into flights. `view` is the seat at this screen. */
export function playEvents(s: GameState, events: GameEvent[], view: number): void {
  if (!fxWillPlay()) return;
  // Cards grown by a roll wait for the dice to settle.
  let delay = events.some((e) => e.type === "feed" && e.kind === "roll") ? AFTER_ROLL_MS : 0;
  let flights = 0;
  const land = LAND_MS();
  const to = (pid: number | null, r: Res | null): Point | null =>
    pid === null ? null : pid === view ? (r ? chipPoint(r) : handPoint()) : (r ? seatStat(pid, "res") : seatStat(pid, "kit"));
  for (const ev of events) {
    if (flights >= MAX_FLIGHTS) break;
    if (ev.type === "production") {
      // Each card leaves the hex that grew it, which flashes, for the counter it is about to change.
      let i = 0;
      const flashed = new Set<number>();
      for (const src of ev.sources) {
        const a = hexPoint(s, src.hid), b = to(src.pid, src.r);
        if (!a || !b) continue;
        if (!flashed.has(src.hid)) { flashed.add(src.hid); flashHex(a, s.terrain[src.hid] as Res, delay); }
        for (let k = 0; k < src.n && i < MAX_PER_FLIGHT; k++) { fly(a, b, resFace(src.r), delay + i * STAGGER_MS, i); holdRes(src.pid, src.r, delay + i * STAGGER_MS + land); i++; }
      }
      delay += 400; flights++;
    } else if (ev.type === "cards") {
      // The bank is at the trader's own elbow: there is nobody on the other side of that one.
      const who = ev.from ?? ev.to;
      const a = ev.from === null ? (who === null ? deckPoint() : elbowPoint(who)) : ev.from === view ? handPoint() : seatPoint(ev.from);
      const total = RES.reduce((t, r) => t + ev.bundle[r], 0);
      // A robbery travels face down for the table, face up for the two it was between.
      if (ev.hidden && total === 0) { const b = ev.to === null ? elbowPoint(who!) : seatStat(ev.to, "res"); if (a && b) { fly(a, b, resBackFace(), delay); delay += 350; flights++; } continue; }
      let i = 0;
      for (const r of RES) for (let k = 0; k < ev.bundle[r] && i < MAX_PER_FLIGHT; k++) {
        const b = ev.to === null ? elbowPoint(who!) : to(ev.to, r);
        if (!a || !b) continue;
        fly(a, b, resFace(r), delay + i * STAGGER_MS, i);
        if (ev.to !== null) holdRes(ev.to, r, delay + i * STAGGER_MS + land);
        i++;
      }
      delay += 400; flights++;
    } else if (ev.type === "kitten") {
      // Face up for its owner, who watches the card they drew turn up in their hand; a back for everybody else.
      const a = deckPoint(), b = to(ev.pid, null);
      if (!a || !b) continue;
      fly(a, b, kittenFace(ev.pid === view ? ev.card.key : null, ev.card.flavor), delay);
      holdKit(ev.pid, ev.pid === view ? ev.card.id : null, delay + land);
      delay += 450; flights++;
    }
  }
}

/* ── the board: hexes flashing, pulses, pieces landing ─────────────── */
function trim(area: HTMLElement, cls: string, max: number): void {
  const old = area.querySelectorAll("." + cls);
  for (let i = 0; i + max < old.length; i++) old[i].remove();
}
/** The hex that grew them, lighting up as they leave it. */
function flashHex(at: Point & { scale?: number }, r: Res, delay: number): void {
  const area = $("boardArea");
  const geo = { size: 42 };
  const d = Math.round(geo.size * (at.scale ?? boardPoint(0, 0)?.scale ?? 1) * 1.8);
  setTimeout(() => {
    if (!fxWillPlay()) return;
    const rect = area.getBoundingClientRect();
    const el = h("div", { class: "hexflash", style: { width: d + "px", height: d + "px", left: at.x - rect.left + "px", top: at.y - rect.top + "px", "--fc": `var(--${r})` } });
    trim(area, "hexflash", 24);
    area.append(el);
    setTimeout(() => el.remove(), 950);
  }, delay);
}
/** The robber landing, a number token swapped: bigger and slower than a piece, since no piece is built. */
export function pulseHex(s: GameState, hid: number, cls: "robber" | "alter", label: string): void {
  if (!fxWillPlay()) return;
  const area = $("boardArea");
  const at = hexPoint(s, hid);
  if (!at) return;
  const rect = area.getBoundingClientRect();
  const el = h("div", { class: "hexpulse " + cls, style: { left: at.x - rect.left + "px", top: at.y - rect.top + "px" } }, label);
  trim(area, "hexpulse", 6);
  area.append(el);
  setTimeout(() => el.remove(), 1800);
}

/* Pieces mid-landing: the board leaves these out, so each appears at the END
   of its fall rather than sitting there through it. Held with the time it
   started and read through landing(), which expires anything older than the
   animation: a piece is on the board, and the flourish that brings it in is
   not worth risking that. */
const PLOP_MS = 520;
const fxLanding = new Map<string, number>();
export function landing(key: string): boolean {
  const t = fxLanding.get(key);
  if (t === undefined) return false;
  if (Date.now() - t > PLOP_MS + 500) { fxLanding.delete(key); return false; }
  return true;
}
/** A piece coming down where it was placed, the shape and colour of the real one. */
export function plopBuild(s: GameState, kind: "road" | "settlement" | "city", id: number, pid: number): void {
  if (!fxWillPlay()) return;
  const key = (kind === "road" ? "e" : "v") + id;
  if (landing(key)) return;
  const colour = s.players[pid]?.color ?? "#fff";
  const geo = geometry(s.board);
  const area = $("boardArea");
  const rect = area.getBoundingClientRect();
  let left: number, top: number, w: number, hgt: number, angle = 0, ring: number;
  let body: SVGSVGElement;
  if (kind === "road") {
    const e = geo.edges[id];
    if (!e) return;
    const a = boardPoint(geo.vertices[e.v[0]].x, geo.vertices[e.v[0]].y), b = boardPoint(geo.vertices[e.v[1]].x, geo.vertices[e.v[1]].y);
    if (!a || !b) return;
    left = (a.x + b.x) / 2 - rect.left; top = (a.y + b.y) / 2 - rect.top;
    w = Math.hypot(b.x - a.x, b.y - a.y); hgt = 10 * a.scale; ring = Math.round(w * 1.3);
    angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    body = svg("svg", { viewBox: "0 0 100 24", preserveAspectRatio: "none" }, svg("rect", { x: 1, y: 1, width: 98, height: 22, rx: 9, fill: colour, stroke: "#0e1116", "stroke-width": 3 }));
  } else {
    const v = geo.vertices[id];
    const p = v ? boardPoint(v.x, v.y) : null;
    if (!p) return;
    const d = (kind === "city" ? 34 : 28) * p.scale;
    left = p.x - rect.left; top = p.y - rect.top; w = d; hgt = d; ring = Math.round(d * 2.1);
    body = kind === "city"
      ? svg("svg", { viewBox: "-14 -12 28 24" }, svg("path", { d: "M-11,8 v-10 l6,-6 l6,6 v-8 l5,-5 l5,5 v18 z", fill: colour, stroke: "#0e1116", "stroke-width": 1.4 }))
      : svg("svg", { viewBox: "-11 -11 22 22" }, svg("path", { d: "M-8,7 v-8 l8,-8 l8,8 v8 z", fill: colour, stroke: "#0e1116", "stroke-width": 1.4 }));
  }
  fxLanding.set(key, Date.now());
  const el = h("div", { class: "plop", style: { left: left + "px", top: top + "px", transform: angle ? `rotate(${angle}deg)` : "", "--pcol": colour } },
    h("span", { class: "plopbody", style: { width: Math.round(w) + "px", height: Math.round(hgt) + "px" } }, body),
    h("span", { class: "plopring", style: { width: ring + "px", height: ring + "px" } }));
  area.append(el);
  setTimeout(() => { el.remove(); fxLanding.delete(key); repaint(); }, PLOP_MS);
}

/* ── what changed on the board since the last look ─────────────────── */
let watch: { robber: number; nums: (number | null)[]; vOwner: (number | null)[]; vType: (string | null)[]; eOwner: (number | null)[]; turn: number } | null = null;
/** Point at anything that arrived on the board since the last repaint. Called before the board is drawn. */
export function checkBoardChanges(s: GameState): void {
  const now = { robber: s.robber, nums: s.numbers.slice(), vOwner: s.vOwner.slice(), vType: s.vType.slice(), eOwner: s.eOwner.slice(), turn: s.turnCounter };
  const was = watch;
  watch = now;
  if (!was || was.nums.length !== now.nums.length || s.phase === "over") return;
  if (!fxWillPlay()) return;
  // Only things ARRIVING: a rewind taking a road back off is not a landing.
  now.eOwner.forEach((o, i) => { if (o !== null && was.eOwner[i] === null) plopBuild(s, "road", i, o); });
  now.vOwner.forEach((o, i) => { if (o !== null && (was.vOwner[i] === null || was.vType[i] !== now.vType[i])) plopBuild(s, now.vType[i] === "city" ? "city" : "settlement", i, o); });
  if (now.robber !== was.robber) pulseHex(s, now.robber, "robber", "🕵");
  // A swap changes two tokens: both get the pulse, each with its new number.
  now.nums.forEach((n, i) => { if (n !== null && was.nums[i] !== n && was.nums[i] !== null) pulseHex(s, i, "alter", String(n)); });
}
/** A new game, or leaving one: nothing to compare the next board against. */
export function resetBoardWatch(): void { watch = null; fxLanding.clear(); resHolds.clear(); kitHolds.clear(); cardHolds.clear(); holdTurn = -1; }
