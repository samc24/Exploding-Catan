/* ══════════════════════════════════════════════════════════════════════
   WIRE PROTOCOL — what a client and the server say to each other
   ══════════════════════════════════════════════════════════════════════
   JSON messages over one WebSocket. The server is the only authority: a
   client sends what it wants to do and is told what came of it. Every
   message from the server carries its clock, so clients can judge the
   windows that depend on time (hand-over, the Imploding Kitten) without
   trusting their own.
   ══════════════════════════════════════════════════════════════════════ */
import type { Action, BoardKey, GameEvent, GameState, Mode } from "@exploding-catan/engine";
import { MODES } from "@exploding-catan/engine";

export const PROTOCOL_VERSION = 1;

export interface RoomConfig {
  mode: Mode;
  board: BoardKey | "auto";
  winPoints: number;
  turnSeconds: number;
}
export interface SeatInfo {
  seat: number;
  name: string | null;
  avatar: string | null;
  bot: boolean;
  /** Somebody holds this seat (bot or person). */
  taken: boolean;
  connected: boolean;
  /** A person's seat that a bot is playing while they are gone. Open to anybody with the code. */
  away?: boolean;
  /** This seat is yours. Set per recipient. */
  you?: boolean;
}
export interface RoomInfo {
  code: string;
  config: RoomConfig;
  seats: SeatInfo[];
  started: boolean;
  over: boolean;
  /** The recipient may change settings, add bots and start. */
  host: boolean;
  /** The recipient"s seat, or null while watching. */
  seat: number | null;
}

export type ClientMsg =
  | { t: "hello"; v: number; name: string; token?: string }
  | { t: "setName"; name: string }
  | { t: "setAvatar"; avatar: string }
  | { t: "create"; seats: number; config: RoomConfig }
  | { t: "join"; code: string }
  | { t: "sit"; seat: number }
  | { t: "stand" }
  | { t: "leave" }
  | { t: "bot"; seat: number; on: boolean }
  | { t: "config"; config: Partial<RoomConfig> }
  | { t: "start"; seed?: number }
  | { t: "restart" }
  | { t: "action"; action: Action }
  | { t: "chat"; text: string }
  | { t: "emote"; emoji: string }
  | { t: "ping" };

export type ServerMsg =
  | { t: "welcome"; v: number; token: string; name: string }
  | { t: "room"; room: RoomInfo; now: number }
  | { t: "left" }
  | { t: "state"; state: GameState; events: GameEvent[]; seat: number | null; now: number }
  /** The clocks moved and nothing else did. A few bytes instead of a whole state. */
  | { t: "clock"; turnTimerUntil: number; turnTickAt: number; implodeUntil: number; implodeFrom: number; now: number }
  | { t: "refused"; error: string; action?: Action }
  | { t: "error"; message: string }
  | { t: "chat"; seat: number | null; name: string; text: string; at: number }
  /** A word from the table itself: who sat down, who left, why there is no chair. */
  | { t: "notice"; text: string; kind: "info" | "big"; at: number }
  | { t: "emote"; seat: number; emoji: string; at: number }
  | { t: "pong"; now: number };

export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to read aloud
export const MAX_CHAT = 140;
export const NAME_MAX = 16;

/** A display name as the server will keep it: printable, no angle brackets, at most NAME_MAX. */
export function cleanName(n: unknown): string {
  return Array.from(String(n ?? ""))
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch !== "<" && ch !== ">")
    .join("")
    .trim()
    .slice(0, NAME_MAX);
}

export const WIN_POINTS = { min: 3, max: 20, default: 10 };
export const TURN_SECONDS = { min: 20, max: 600 };

/** Whatever a client sent, as a config the engine accepts. Unknown values fall back. */
export function normalizeRoomConfig(raw: unknown, base?: RoomConfig): RoomConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof RoomConfig, unknown>>;
  const mode = typeof r.mode === "string" && r.mode in MODES ? (r.mode as Mode) : base?.mode ?? "normal";
  const board = r.board === "small" || r.board === "large" || r.board === "auto" ? r.board : base?.board ?? "auto";
  const wp = Number(r.winPoints);
  const winPoints = Number.isInteger(wp) ? Math.min(WIN_POINTS.max, Math.max(WIN_POINTS.min, wp)) : base?.winPoints ?? WIN_POINTS.default;
  const ts = Number(r.turnSeconds);
  const turnSeconds = Number.isInteger(ts) && ts >= TURN_SECONDS.min ? Math.min(TURN_SECONDS.max, ts) : 0;
  return { mode, board, winPoints, turnSeconds: r.turnSeconds === undefined && base ? base.turnSeconds : turnSeconds };
}

/** A different portrait for each seat, from the ones that exist. */
export function defaultAvatar(seat: number): string {
  return AVATAR_IDS[(seat * 7) % AVATAR_IDS.length];
}
/** A different face for each bot, never one a person at the table chose. */
export function freeAvatar(seat: number, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let k = 0; k < AVATAR_IDS.length; k++) { const id = AVATAR_IDS[((seat * 7) + k * 3) % AVATAR_IDS.length]; if (!used.has(id)) return id; }
  return defaultAvatar(seat);
}
/** The tray: the original game"s eighteen, then five more. Anything else is
    refused, so a bot or a client cannot be given a wider vocabulary. */
export const EMOJIS = [
  "😠", "😂", "😏", "🙄", "🥱", "🤡", "💀", "🖕", "☹️", "😎", "⏲️", "🧠", "😉", "😱", "😭", "🙏", "🤝", "🔥",
  "😹", "👏", "🐔", "💩", "👶",
];
/** The painted portraits that exist in art/profile (the numbering has gaps). */
export const AVATAR_IDS: readonly string[] = ["1", "2", "3", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28"].map(String);
export function validAvatar(a: unknown): string | null {
  const s = String(a ?? "");
  return AVATAR_IDS.includes(s) ? s : null;
}
