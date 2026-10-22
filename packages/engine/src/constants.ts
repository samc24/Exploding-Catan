import type { Bundle, BoardKey, BuildKind, CardKey, CardKind, Mode, Res, Terrain } from "./types";

export const ENGINE_VERSION = 1;

export const RES: readonly Res[] = ["wood", "brick", "sheep", "wheat", "ore"];
export const RES_NAME: Record<Res, string> = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  ore: "Ore",
};
export const PLAYER_COLORS = ["#d94b4b", "#4b7fd9", "#e08a2e", "#e8e8e8", "#59b364", "#a86fd0"];
export const PLAYER_NAMES = ["Red", "Blue", "Orange", "White", "Green", "Purple"];

export const COST: Record<BuildKind, Partial<Bundle>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
};
export const LIMIT: Record<BuildKind, number> = { road: 15, settlement: 5, city: 4 };

export interface KittenDef {
  name: string;
  count: number;
  kind: CardKind;
  text: string;
}
// 54 cards. Reverse's count is inferred: 54 − (all others) = 5.
export const KITTEN: Record<CardKey, KittenDef> = {
  implode: {
    name: "Imploding Kitten",
    count: 1,
    kind: "auto",
    text: "When drawn, immediately take every other player's entire resource hand. It cannot be Noped, Defused or refuted in any way — even a cancelled turn does not undo it.",
  },
  vp: { name: "Feral Kitten", count: 3, kind: "vp", text: "Worth 1 victory point. Kept hidden until you win." },
  skip: { name: "Skip", count: 5, kind: "target", text: "Skip a chosen player's next turn." },
  nope: {
    name: "Nope",
    count: 5,
    kind: "response",
    text: "Cancels a player's whole turn. Everything that turn drew, built and played is destroyed, and nothing they spent comes back. A Nope can itself be Noped. If someone reaches the target points, the next player in turn order holding a Nope must spend it.",
  },
  explode: {
    name: "Exploding Kitten",
    count: 5,
    kind: "target",
    text: "Return a chosen player's entire resource hand to the bank.",
  },
  defuse: {
    name: "Defuse",
    count: 5,
    kind: "response",
    text: '"No you." Reflect an attack aimed at you back onto the player who played it.',
  },
  alter: { name: "Alter the Future", count: 5, kind: "board", text: "Swap any two number tokens on the board." },
  attack: { name: "Attack", count: 5, kind: "target", text: "A chosen player discards 3 resource cards of their choice." },
  favor: {
    name: "Favor",
    count: 5,
    kind: "target",
    text: "Name 3 resource cards. A chosen player gives you whichever of them they actually hold.",
  },
  reverse: { name: "Reverse", count: 5, kind: "self", text: "Take another turn immediately, then turn order reverses." },
  knight: {
    name: "Knight",
    count: 10,
    kind: "knight",
    text: "Move the robber and steal 1 resource from a player on that hex. Counts toward Largest Army.",
  },
};
export const KNIGHT_FLAVOR = ["Beard Cat", "Watermelon Cat", "Potato Cat", "Rainbow Cat", "Taco Cat"];

export const MODES: Record<Mode, { name: string; blurb: string }> = {
  normal: { name: "Normal", blurb: "Catan's own opening. Only the second settlement pays out." },
  fast: {
    name: "Fast track",
    blurb: "Both opening settlements pay out, so everybody starts with roughly twice the resources.",
  },
  fastplus: {
    name: "Fast track +",
    blurb:
      "Fast track, and everybody opens holding one random kitten card — dealt fresh, not off the 54, and never the Imploding Kitten.",
  },
};

/** Playable on anyone's turn: a Nope, and the two direct attacks. */
export const OFF_TURN: ReadonlySet<CardKey> = new Set(["nope", "attack", "explode"]);
/** Cards that name a player when played, and can therefore be Defused. */
export const TARGETED: ReadonlySet<CardKey> = new Set(["skip", "explode", "attack", "favor"]);

/** How far back a Nope or a Defuse may still reach, in journal lines. */
export const NOPE_REACH = 4;
/** The gap after a turn ends during which it is still answerable and nobody may roll. */
export const HANDOVER_MS = 3000;
/** The Imploding Kitten's turn ends this long after the card has landed. */
export const IMPLODE_MS = 20000;
export const JOURNAL_KEEP = 240;
export const LOG_KEEP = 400;

export const TURN_TICK_MS = 250;
/** A tick arriving this late was not at the table (background tab); the excess is handed back. */
export const TURN_TICK_SLACK = 600;

export interface BoardDef {
  rows: number[] | null;
  turned?: boolean;
  size: number;
  ports: number;
  bank: number;
  terrain: Terrain[];
  numbers: number[];
}
export const BOARD: Record<BoardKey, BoardDef> = {
  small: {
    rows: null,
    size: 54,
    ports: 9,
    bank: 19,
    terrain: [
      "wood", "wood", "wood", "wood", "brick", "brick", "brick",
      "sheep", "sheep", "sheep", "sheep", "wheat", "wheat", "wheat", "wheat",
      "ore", "ore", "ore", "desert",
    ],
    numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
  },
  large: {
    rows: [3, 4, 5, 6, 5, 4, 3],
    turned: true,
    size: 44,
    ports: 11,
    bank: 24,
    terrain: [
      "wood", "wood", "wood", "wood", "wood", "wood",
      "brick", "brick", "brick", "brick", "brick",
      "sheep", "sheep", "sheep", "sheep", "sheep", "sheep",
      "wheat", "wheat", "wheat", "wheat", "wheat", "wheat",
      "ore", "ore", "ore", "ore", "ore",
      "desert", "desert",
    ],
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
  },
};

export function emptyBundle(): Bundle {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}
export function bundleOf(b: Partial<Bundle>): Bundle {
  return { ...emptyBundle(), ...b };
}
export function bundleTotal(b: Bundle): number {
  return RES.reduce((s, r) => s + b[r], 0);
}
export function bundleText(b: Partial<Bundle> | null | undefined): string {
  if (!b) return "";
  return RES.filter((r) => (b[r] ?? 0) > 0)
    .map((r) => `${b[r]} ${RES_NAME[r]}`)
    .join(", ");
}
