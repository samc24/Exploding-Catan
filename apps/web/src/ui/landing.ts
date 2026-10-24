/* ══════════════════════════════════════════════════════════════════════
   THE LANDING — the table before anybody sits down
   ══════════════════════════════════════════════════════════════════════
   A title, a hand of the game's own cards, and three ways in. Shown when
   there is no game, and on demand from the title in the header (with a
   Continue button when a game is waiting).
   ══════════════════════════════════════════════════════════════════════ */
import { $, clear, h } from "./dom";
import { cardArt, hexArt, has } from "../media/art";

export interface LandingActions {
  bots(): void;
  passAndPlay(): void;
  online(): void;
  rules(): void;
  /** Present when a game is waiting to be picked up. */
  resume?: (() => void) | null;
  resumeLabel?: string;
  /** Present when there is a game to walk away from. */
  leave?: (() => void) | null;
}

const FAN: { key: Parameters<typeof cardArt>[0]; flavor: string | null }[] = [
  { key: "nope", flavor: null }, { key: "knight", flavor: "Taco Cat" }, { key: "explode", flavor: null },
  { key: "defuse", flavor: null }, { key: "alter", flavor: null },
];

export function showLanding(a: LandingActions): void {
  const root = $("landing");
  clear(root);
  const tiles = (["wood", "wheat", "ore", "sheep", "brick", "wheat", "wood"] as const).map((t, i) =>
    h("div", { class: "tile t" + i, style: has(hexArt(t)) ? { backgroundImage: `url(${hexArt(t)})` } : { background: `var(--${t})` } }));
  const fan = h("div", { class: "fan" }, FAN.map((c, i) => {
    const art = has(cardArt(c.key, c.flavor)) ? cardArt(c.key, c.flavor) : null;
    return h("div", { class: "fcard c" + i, style: art ? { backgroundImage: `url(${art})` } : null }, art ? "" : c.key);
  }));
  root.append(
    h("div", { class: "table-bg" }, tiles),
    h("div", { class: "hero" },
      h("div", { class: "hero-text" },
        h("p", { class: "kicker" }, "A kitchen-table game"),
        h("h1", null, h("span", { class: "ex" }, "Exploding"), " ", h("span", { class: "ca" }, "Catan")),
        h("p", { class: "lede" }, "Catan with the development deck torn out and 54 kitten cards put in its place. Build, trade, and Nope your friends' whole turns."),
        h("div", { class: "ways" },
          a.resume ? h("button", { class: "way resume", onclick: a.resume }, h("b", null, a.resumeLabel ?? "Continue"), h("span", null, "pick the last game back up")) : null,
          h("button", { class: "way", onclick: a.bots }, h("b", null, "Play against bots"), h("span", null, "you and three kittens, right now")),
          h("button", { class: "way", onclick: a.passAndPlay }, h("b", null, "Pass and play"), h("span", null, "one screen, around the table")),
          h("button", { class: "way", onclick: a.online }, h("b", null, "Play online"), h("span", null, "a room code and your friends' screens")),
        ),
        h("p", { class: "fine" }, h("a", { href: "#", onclick: (e: Event) => { e.preventDefault(); a.rules(); } }, "How it differs from Catan"), " · 2 to 6 players · free, no account",
          a.leave ? [" · ", h("a", { href: "#", class: "leave", onclick: (e: Event) => { e.preventDefault(); a.leave!(); } }, "Leave the current game")] : null),
      ),
      fan,
    ),
    h("div", { class: "beats" },
      beat(hexArt("wheat"), "Build like Catan", "Roads, settlements, cities. Longest Road and Largest Army still count."),
      beat(cardArt("favor", null), "Buy kitten cards", "Any three different resources buys one. Play as many as you like, the turn after."),
      beat(cardArt("nope", null), "Nope anything", "A card, a roll, or somebody's entire turn. A Nope can be Noped."),
    ),
  );
  root.hidden = false;
}
function beat(img: string, title: string, text: string): HTMLElement {
  return h("div", { class: "beat" },
    h("div", { class: "beat-img", style: has(img) ? { backgroundImage: `url(${img})` } : null }),
    h("div", null, h("b", null, title), h("p", null, text)));
}
export function hideLanding(): void { const root = $("landing"); root.hidden = true; clear(root); }
export function landingShowing(): boolean { return !$("landing").hidden; }
