import { totalRes, publicVP, totalVP, seatPickable, discardOwed, type GameState } from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { avatarArt, has } from "../art";

export function drawSeats(root: HTMLElement, s: GameState, view: number, isBot: (pid: number) => boolean, onSeat: (pid: number) => void): void {
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
    const av = p.avatar && has(avatarArt(Number(p.avatar))) ? avatarArt(Number(p.avatar)) : null;
    const el = h("div", {
      class: "seat" + (p.id === s.cur ? " cur" : "") + (mine ? " me" : "") + (pickable ? " pickable" : ""),
      style: { "--c": p.color } as unknown as Record<string, string>,
      onclick: () => onSeat(p.id),
      title: mine ? "Your seat" : isBot(p.id) ? `${p.name} is a bot` : `View as ${p.name}`,
    },
      h("div", { class: "avatar", style: av ? { backgroundImage: `url(${av})` } : null }, av ? "" : p.name[0]),
      h("div", { class: "who" },
        h("div", { class: "name" }, isBot(p.id) ? "🤖 " : "", p.name, p.id === s.cur && s.phase !== "over" ? " ·  playing" : ""),
        h("div", { class: "stats" },
          h("span", { title: "resource cards" }, "🂠 ", h("b", null, String(totalRes(p)))),
          h("span", { title: "kitten cards" }, "🐱 ", h("b", null, String(p.cards.length))),
          h("span", { title: "knights played" }, "⚔ ", h("b", null, String(p.knights))),
          h("span", { title: "longest road" }, "🛣 ", h("b", null, String(s.roadLens[p.id] ?? 0))),
          s.longestRoad.owner === p.id ? h("span", { style: { color: "var(--accent)" } }, "Longest Road") : null,
          s.largestArmy.owner === p.id ? h("span", { style: { color: "var(--accent)" } }, "Largest Army") : null,
          p.skipTokens ? h("span", { style: { color: "var(--danger)" } }, `skip ×${p.skipTokens}`) : null,
        ),
      ),
      h("div", { class: "vp", title: "victory points" }, String(vp)),
      waiting ? h("span", { class: "tag wait" }, waiting) : (s.winner === p.id ? h("span", { class: "tag" }, "winner") : null),
    );
    root.append(el);
  }
}
