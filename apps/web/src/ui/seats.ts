/* The seat cards, laid out the way Catan Universe lays its player box out:
   the portrait on the left with the score in a ring over its corner, the
   name on a banner across the top of the right column, what is on the board
   under the banner, and what is in the hand hanging off the bottom of the
   card. Compared before written: replacing the markup throws away every
   animation running inside it and restarts the portraits' images. */
import { totalRes, publicVP, totalVP, vpCards, seatPickable, discardOwed, RES, type GameState } from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { portrait } from "./avatars";
import { heldKit, heldRes } from "./fx";

let shownCur = -1;
let lastHtml = "";
export function drawSeats(root: HTMLElement, s: GameState, view: number, isBot: (pid: number) => boolean, onSeat: (pid: number) => void, onOwnPortrait: (() => void) | null): void {
  const owed = discardOwed(s);
  const built = h("div");
  for (const p of s.players) {
    const mine = p.id === view;
    const vp = s.revealed || mine ? totalVP(s, p) : publicVP(s, p);
    const ferals = mine && !s.revealed ? vpCards(p) : 0;
    const pickable = seatPickable(s, p.id) && s.select?.kind === "seat" && s.select.actor === view;
    const waiting =
      (owed && owed.pid === p.id) ? "discarding" :
      (s.forcedNope && s.forcedNope.pid === p.id) ? "forced Nope" :
      (s.select && "actor" in s.select && s.select.actor === p.id && s.select.kind !== "seat") ? "deciding" :
      (s.trade && s.trade.replies[p.id] === "wait") ? "offered" : null;
    const holdsLR = s.longestRoad.owner === p.id, holdsLA = s.largestArmy.owner === p.id;
    // Counters subtract whatever is still in the air on its way here.
    const res = Math.max(0, totalRes(p) - RES.reduce((t, r) => t + heldRes(p.id, r), 0));
    const kit = Math.max(0, p.cards.length - heldKit(p.id));
    const own = mine && onOwnPortrait && s.phase !== "over";
    const face = portrait(p.avatar, p.color, p.name, 56);
    const el = h("div", {
      class: "seat" + (p.id === s.cur ? " cur" : "") + (mine ? " me" : "") + (pickable ? " pickable" : "") + (p.skipTokens ? " done" : ""),
      style: { "--c": p.color } as unknown as Record<string, string>,
      dataset: { pid: String(p.id) },
      title: mine ? "Your seat" : isBot(p.id) ? `${p.name} is a bot` : `View as ${p.name}`,
    },
      h("div", { class: "avwrap" + (own ? " mine" : ""), title: own ? "Your picture — click to change it" : null },
        face,
        h("span", { class: "vpring" + (ferals ? " hidden" : ""), title: `Victory points${ferals ? ` — including ${ferals} Feral Kitten${ferals === 1 ? "" : "s"} only you can see` : ""}` }, String(vp)),
      ),
      h("div", { class: "pname" },
        isBot(p.id) ? h("span", { class: "bot", title: "a bot" }, "🤖") : null,
        h("span", { class: "nm" }, p.name),
        p.skipTokens ? h("span", { class: "pskip" }, `skip ×${p.skipTokens}`) : null,
      ),
      h("div", { class: "statgroup board" },
        stat("road", s.roadLens[p.id] ?? 0, `Longest unbroken road (${p.roads} built)${holdsLR ? " — holds Longest Road, +2" : ""}`, holdsLR),
        stat("knight", p.knights, `Knights played${holdsLA ? " — holds Largest Army, +2" : ""}`, holdsLA),
      ),
      h("div", { class: "statgroup hand" },
        stat("res", res, "Resource cards", false),
        stat("kit", kit, "Kitten cards in hand", false),
      ),
      waiting ? h("span", { class: "tag wait" }, waiting) : (s.winner === p.id ? h("span", { class: "tag" }, "winner") : null),
    );
    built.append(el);
  }
  const html = built.innerHTML;
  if (html === lastHtml && root.childElementCount === s.players.length) { follow(root, s); return; }
  lastHtml = html;
  const left = root.scrollLeft, top = root.scrollTop;
  clear(root);
  for (const el of [...built.children]) {
    const pid = Number((el as HTMLElement).dataset.pid);
    el.addEventListener("click", () => onSeat(pid));
    const av = el.querySelector<HTMLElement>(".avwrap.mine");
    if (av && onOwnPortrait) av.addEventListener("click", (ev) => { ev.stopPropagation(); onOwnPortrait(); });
    // The turn ring's phase rides on the element, so a repaint resumes it rather than restarting it.
    if (el.classList.contains("cur")) (el as HTMLElement).style.setProperty("--spin", `-${Date.now() % 1100}ms`);
    root.append(el);
  }
  root.scrollLeft = left; root.scrollTop = top;
  follow(root, s);
}
/* On a phone the seats are a strip (a column, on its side): keep the scroll, and bring the
   current seat into view whenever it is out of it, unless a finger moved the strip a moment
   ago. (A smooth scroll was tried; the next render, which can come at once, cut it short.) */
function follow(root: HTMLElement, s: GameState): void {
  const el = root.children[s.cur] as HTMLElement | undefined;
  const go = s.cur !== shownCur || Date.now() - touched > TOUCH_HOLD_MS;
  if (el && go && root.scrollWidth > root.clientWidth + 1) {
    const seen = el.offsetLeft >= root.scrollLeft && el.offsetLeft + el.offsetWidth <= root.scrollLeft + root.clientWidth;
    if (s.cur !== shownCur || !seen) root.scrollLeft = el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2;
  }
  if (el && go && root.scrollHeight > root.clientHeight + 1) {
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
export function resetSeats(): void { lastHtml = ""; }

const ICON: Record<string, string> = { res: "🂠", kit: "🐱", knight: "⚔", road: "🛣" };
/** One figure with its glyph. Lit gold when it holds the bonus card. */
function stat(which: string, n: number, title: string, holds: boolean): HTMLElement {
  return h("span", { class: "stat " + which + (holds ? " holds" : "") + (n ? "" : " zero"), title, dataset: { stat: which } }, h("b", null, String(n)), h("i", null, ICON[which]));
}
