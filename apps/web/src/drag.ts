/* ══════════════════════════════════════════════════════════════════════
   DRAG — a card picked up out of the hand and dropped where it should go
   ══════════════════════════════════════════════════════════════════════
   The pile plays it (or answers with it), an open log line answers that
   line, the hand reorders. Clicking still works; a press that moves less
   than a few pixels is a click. While a card is in the air, every place it
   may legally go is outlined.

   A finger is different: a short press that moves scrolls the hand (the
   cards sit in a strip on a phone), and only a press held still for a
   moment picks the card up.
   ══════════════════════════════════════════════════════════════════════ */
import { canPlayToPile, cardIsPlayable, type Card, type GameState } from "@exploding-catan/engine";
import { store } from "./store";
import { clock } from "./online";
import { act, ui } from "./screen";
import { $, h } from "./ui/dom";
import { answerable } from "./ui/feed";
import { offerAnswers, onCardOnEntry } from "./input";
import { sfx } from "./sfx";

const THRESHOLD = 6;
/** How long a finger holds still before the card lifts. */
const HOLD_MS = 280;
interface Drag { card: Card; idx: number; from: HTMLElement; ghost: HTMLElement; targets: { nope: Set<number>; defuse: Set<number>; pile: boolean } }
interface Pend { x: number; y: number; card: Card; idx: number; el: HTMLElement; touch: boolean; scrolling: boolean; lastX: number }
let pend: Pend | null = null;
let drag: Drag | null = null;
let holdTimer: number | null = null;
let swallowClickUntil = 0;

function cardAt(el: Element | null): { card: Card; idx: number; el: HTMLElement } | null {
  const kc = el instanceof Element ? el.closest<HTMLElement>(".kc[data-card]") : null;
  if (!kc) return null;
  const s = store.get();
  if (!s) return null;
  const card = s.players[ui.seat]?.cards.find((c) => c.id === Number(kc.dataset.card));
  return card ? { card, idx: Number(kc.dataset.idx), el: kc } : null;
}
function targetsFor(s: GameState, card: Card): Drag["targets"] {
  const now = clock();
  if (card.key === "nope" || card.key === "defuse") {
    const a = answerable(s, ui.seat, now);
    const mine = card.key === "nope" ? a.nope : a.defuse;
    return { nope: card.key === "nope" ? mine : new Set(), defuse: card.key === "defuse" ? mine : new Set(), pile: mine.size > 0 || card.key === "nope" };
  }
  return { nope: new Set(), defuse: new Set(), pile: cardIsPlayable(s, card) && canPlayToPile(s, card.key, ui.seat) };
}
function mark(on: boolean, t?: Drag["targets"]): void {
  document.querySelectorAll(".droppable").forEach((el) => el.classList.remove("droppable", "dropping"));
  if (!on || !t) return;
  if (t.pile) document.querySelector("#pile .cardface")?.classList.add("droppable");
  for (const jid of [...t.nope, ...t.defuse]) document.querySelector(`#feed .fl[data-jid="${jid}"]`)?.classList.add("droppable");
  document.querySelector("#bottom .hand")?.classList.add("droppable");
}
function hot(x: number, y: number): HTMLElement | null {
  if (drag) drag.ghost.style.display = "none";
  const el = document.elementFromPoint(x, y);
  if (drag) drag.ghost.style.display = "";
  const t = el?.closest<HTMLElement>(".droppable") ?? null;
  document.querySelectorAll(".dropping").forEach((e) => e.classList.remove("dropping"));
  t?.classList.add("dropping");
  return t;
}

/** The card leaves the hand: a ghost under the pointer, the targets lit. */
function lift(x: number, y: number): void {
  const p = pend;
  pend = null;
  clearHold();
  if (!p) return;
  const s = store.get();
  if (!s) return;
  const ghost = h("div", { class: "kc ghost", style: { backgroundImage: p.el.style.backgroundImage, left: x + "px", top: y + "px" } }, p.el.style.backgroundImage ? "" : p.el.textContent);
  $("fxroot").append(ghost);
  drag = { card: p.card, idx: p.idx, from: p.el, ghost, targets: targetsFor(s, p.card) };
  p.el.classList.add("lifted");
  document.body.classList.add("dragging");
  sfx("arm", { rate: 1.2 });
  if (p.touch) try { navigator.vibrate?.(10); } catch { /* not everywhere */ }
  mark(true, drag.targets);
}
function clearHold(): void { if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; } }

export function installDrag(): void {
  document.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const c = cardAt(ev.target as Element);
    if (!c) return;
    const touch = ev.pointerType === "touch";
    pend = { x: ev.clientX, y: ev.clientY, card: c.card, idx: c.idx, el: c.el, touch, scrolling: false, lastX: ev.clientX };
    clearHold();
    if (touch) holdTimer = window.setTimeout(() => { if (pend && !pend.scrolling) lift(pend.x, pend.y); }, HOLD_MS);
  });
  document.addEventListener("pointermove", (ev) => {
    if (drag) { drag.ghost.style.left = ev.clientX + "px"; drag.ghost.style.top = ev.clientY + "px"; hot(ev.clientX, ev.clientY); ev.preventDefault(); return; }
    if (!pend) return;
    if (pend.touch) {
      // A finger that moved before the hold is scrolling the strip of cards.
      const strip = pend.el.closest<HTMLElement>(".hand");
      if (pend.scrolling) { if (strip) strip.scrollLeft += pend.lastX - ev.clientX; pend.lastX = ev.clientX; return; }
      if (Math.hypot(ev.clientX - pend.x, ev.clientY - pend.y) < THRESHOLD) return;
      pend.scrolling = true;
      pend.lastX = ev.clientX;
      clearHold();
      return;
    }
    if (Math.hypot(ev.clientX - pend.x, ev.clientY - pend.y) < THRESHOLD) return;
    lift(ev.clientX, ev.clientY);
  }, { passive: false });
  // While a card is in the air the page must not scroll under it.
  document.addEventListener("touchmove", (ev) => { if (drag) ev.preventDefault(); }, { passive: false });
  const end = (ev: PointerEvent, cancelled = false) => {
    clearHold();
    if (pend?.scrolling) swallowClickUntil = Date.now() + 300;
    pend = null;
    if (!drag) return;
    const d = drag;
    drag = null;
    const target = cancelled ? null : hot(ev.clientX, ev.clientY);
    d.ghost.remove();
    d.from.classList.remove("lifted");
    document.body.classList.remove("dragging");
    mark(false);
    swallowClickUntil = Date.now() + 300;
    if (!target) return;
    sfx("drop");
    const s = store.get();
    if (!s) return;
    if (target.matches("#pile .cardface")) {
      if (d.card.key === "nope" || d.card.key === "defuse") offerAnswers(d.card.key, ui.seat);
      else act({ type: "playCard", seat: ui.seat, cardId: d.card.id });
      return;
    }
    if (target.matches("#feed .fl")) { onCardOnEntry(d.card, Number(target.dataset.jid)); return; }
    if (target.matches(".hand")) {
      const over = cardAt(document.elementFromPoint(ev.clientX, ev.clientY));
      const to = over ? over.idx : null;
      if (to !== d.idx) act({ type: "reorderHand", seat: ui.seat, from: d.idx, to });
    }
  };
  document.addEventListener("pointerup", (ev) => end(ev));
  document.addEventListener("pointercancel", (ev) => end(ev, true));
  window.addEventListener("blur", () => { if (drag) end(new PointerEvent("pointerup"), true); });
  // The click that follows a drop lands on whatever is under the pointer; it was not meant.
  document.addEventListener("click", (ev) => { if (Date.now() < swallowClickUntil) { ev.stopPropagation(); ev.preventDefault(); } }, true);
}
export function dragging(): boolean { return !!drag; }
