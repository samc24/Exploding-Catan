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
  bot: boolean;
  /** Somebody holds this seat (bot or person). */
  taken: boolean;
  connected: boolean;
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
  /** The recipient's seat, or null while watching. */
  seat: number | null;
}

export type ClientMsg =
  | { t: "hello"; v: number; name: string; token?: string }
  | { t: "setName"; name: string }
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
  | { t: "ping" };

export type ServerMsg =
  | { t: "welcome"; v: number; token: string; name: string }
  | { t: "room"; room: RoomInfo; now: number }
  | { t: "left" }
  | { t: "state"; state: GameState; events: GameEvent[]; seat: number | null; now: number }
  | { t: "refused"; error: string; action?: Action }
  | { t: "error"; message: string }
  | { t: "chat"; seat: number | null; name: string; text: string; at: number }
  | { t: "pong"; now: number };

export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to read aloud
export const MAX_CHAT = 140;
