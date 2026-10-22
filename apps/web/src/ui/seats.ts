import { totalRes, publicVP, totalVP, seatPickable, discardOwed, type GameState } from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { portrait } from "./avatars";

let shownCur = -1;
export function drawSeats(root: HTMLElement, s: GameState, view: number, isBot: (pid: number) => boolean, onSeat: (pid: number) => void): void {
  const left = root.scrollLeft;
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
  // On a phone the seats are a strip: keep the scroll, and bring a new current seat into view.
  root.scrollLeft = left;
  if (s.cur !== shownCur) {
    shownCur = s.cur;
    const el = root.children[s.cur] as HTMLElement | undefined;
    if (el && root.scrollWidth > root.clientWidth) root.scrollTo({ left: el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }
}

function stat(icon: string, n: number, title: string): HTMLElement {
  return h("span", { class: "stat" + (n ? "" : " zero"), title }, icon, " ", h("b", null, String(n)));
}
