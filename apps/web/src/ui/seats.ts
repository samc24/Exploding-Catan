import { totalRes, publicVP, totalVP, seatPickable, discardOwed, type GameState } from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { portrait } from "./avatars";

let shownCur = -1;
export function drawSeats(root: HTMLElement, s: GameState, view: number, isBot: (pid: number) => boolean, onSeat: (pid: number) => void): void {
  const left = root.scrollLeft, top = root.scrollTop;
  clear(root);
  const owed = discardOwed(s);
  for (const p of s.players) {
    const mine = p.id === view;
    const vp = s.revealed || mine ? totalVP(s, p) : publicVP(s, p);
    const pickable = seatPickable(s, p.id) && s.select?.kind === "seat" && s.select.actor === view;
    const waiting =
      (owed && owed.pid === p.id) ? "discarding" :
      (s.forcedNope && s.forcedNope.pid === p.id) ? "forced Nope" :
      (s.select && "actor" in s.select && s.select.actor === p.id && s.select.kind !== "seat") ? "deciding" :
      (s.trade && s.trade.replies[p.id] === "wait") ? "offered" : null;
    const el = h("div", {
      class: "seat" + (p.id === s.cur ? " cur" : "") + (mine ? " me" : "") + (pickable ? " pickable" : ""),
      style: { "--c": p.color } as unknown as Record<string, string>,
      onclick: () => onSeat(p.id),
      title: mine ? "Your seat" : isBot(p.id) ? `${p.name} is a bot` : `View as ${p.name}`,
    },
      portrait(p.avatar, p.color, p.name, 44),
      h("div", { class: "who" },
        h("div", { class: "name" }, isBot(p.id) ? h("span", { class: "bot", title: "a bot" }, "🤖") : null, p.name, p.id === s.cur && s.phase !== "over" ? h("span", { class: "turn" }, "playing") : null),
        h("div", { class: "stats" },
          stat("🂠", totalRes(p), "resource cards"),
          stat("🐱", p.cards.length, "kitten cards"),
          stat("⚔", p.knights, "knights played"),
          stat("🛣", s.roadLens[p.id] ?? 0, "longest road"),
        ),
        (s.longestRoad.owner === p.id || s.largestArmy.owner === p.id || p.skipTokens) ? h("div", { class: "honours" },
          s.longestRoad.owner === p.id ? h("span", { class: "honour" }, "Longest Road") : null,
          s.largestArmy.owner === p.id ? h("span", { class: "honour" }, "Largest Army") : null,
          p.skipTokens ? h("span", { class: "honour bad" }, `skip ×${p.skipTokens}`) : null,
        ) : null,
      ),
      h("div", { class: "vp", title: "victory points" }, String(vp)),
      waiting ? h("span", { class: "tag wait" }, waiting) : (s.winner === p.id ? h("span", { class: "tag" }, "winner") : null),
    );
    root.append(el);
  }
  // On a phone the seats are a strip (a column, on its side): keep the scroll, and bring the
  // current seat into view whenever it is out of it, unless a finger moved the strip a moment
  // ago. (A smooth scroll was tried; the next render, which can come at once, cut it short.)
  root.scrollLeft = left; root.scrollTop = top;
  const el = root.children[s.cur] as HTMLElement | undefined;
  const follow = s.cur !== shownCur || Date.now() - touched > TOUCH_HOLD_MS;
  if (el && follow && root.scrollWidth > root.clientWidth + 1) {
    const seen = el.offsetLeft >= root.scrollLeft && el.offsetLeft + el.offsetWidth <= root.scrollLeft + root.clientWidth;
    if (s.cur !== shownCur || !seen) root.scrollLeft = el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2;
  }
  if (el && follow && root.scrollHeight > root.clientHeight + 1) {
    const seen = el.offsetTop >= root.scrollTop && el.offsetTop + el.offsetHeight <= root.scrollTop + root.clientHeight;
    if (s.cur !== shownCur || !seen) root.scrollTop = el.offsetTop - (root.clientHeight - el.offsetHeight) / 2;
  }
  shownCur = s.cur;
}
/** When a finger last moved the strip; the follow stays out of its way for a while. */
let touched = 0;
const TOUCH_HOLD_MS = 6000;
export function installSeatStrip(root: HTMLElement): void {
  root.addEventListener("pointerdown", () => { touched = Date.now(); }, { passive: true });
  root.addEventListener("wheel", () => { touched = Date.now(); }, { passive: true });
}

function stat(icon: string, n: number, title: string): HTMLElement {
  return h("span", { class: "stat" + (n ? "" : " zero"), title }, icon, " ", h("b", null, String(n)));
}
