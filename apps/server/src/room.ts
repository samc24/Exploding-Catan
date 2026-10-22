/* ══════════════════════════════════════════════════════════════════════
   A ROOM — one table, its lobby, its game, and its bots
   ══════════════════════════════════════════════════════════════════════
   The room owns the real GameState. People send actions; the room applies
   them through the engine with the sender's seat stamped on, and sends
   every connected seat its own redacted view. Bots are driven here on a
   timer, so the game goes on whether or not anybody's tab is open.
   ══════════════════════════════════════════════════════════════════════ */
import {
  applyAction, createGame, eventsFor, handoverActive, implodeActive, timerEnabled, viewFor,
  type Action, type GameConfig, type GameEvent, type GameState,
} from "@exploding-catan/engine";
import { createTable, nextBotAction, type Table } from "@exploding-catan/bots";
import { CODE_CHARS, MAX_CHAT, type RoomConfig, type RoomInfo, type ServerMsg } from "@exploding-catan/protocol";

export interface Client {
  uid: string;
  name: string;
  send(msg: ServerMsg): void;
  connected: boolean;
}
interface Seat { uid: string | null; name: string | null; bot: boolean }

/** Bots deliberately move slowly, so a Nope can be reached for before the line scrolls away. */
export const BOT_PACE = 1800;
const TICK_MS = 250;
const PLAYER_NAMES = ["Red", "Blue", "Orange", "White", "Green", "Purple"];

export function randomCode(rng: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return s;
}

export class Room {
  readonly code: string;
  hostUid: string;
  config: RoomConfig;
  seats: Seat[];
  state: GameState | null = null;
  table: Table = createTable([], 0);
  clients = new Map<string, Client>();
  /** When the last person left, for sweeping idle rooms. */
  emptySince: number | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private seed = 0;
  botPace = BOT_PACE;

  constructor(code: string, host: Client, seats: number, config: RoomConfig, botPace = BOT_PACE) {
    this.code = code;
    this.botPace = botPace;
    this.hostUid = host.uid;
    this.config = config;
    this.seats = Array.from({ length: Math.min(6, Math.max(2, seats)) }, () => ({ uid: null, name: null, bot: false }));
    this.clients.set(host.uid, host);
    this.sit(host, 0);
  }

  /* ── membership ───────────────────────────────────────────────────── */
  seatOf(uid: string): number | null {
    const i = this.seats.findIndex((s) => s.uid === uid);
    return i < 0 ? null : i;
  }
  join(c: Client): void {
    this.clients.set(c.uid, c);
    this.emptySince = null;
    // Back to the seat they held, else the first free chair.
    if (this.seatOf(c.uid) === null) {
      const free = this.seats.findIndex((s) => s.uid === null && !s.bot);
      if (free >= 0 && !this.state) this.sit(c, free);
      else if (free >= 0 && this.state) this.sit(c, free); // an empty chair mid-game is anybody's
    }
    this.pushRoom();
    if (this.state) this.sendState(c.uid, []);
  }
  sit(c: Client, seat: number): void {
    const s = this.seats[seat];
    if (!s || s.bot || (s.uid !== null && s.uid !== c.uid)) throw new Error("that seat is taken");
    const prev = this.seatOf(c.uid);
    if (prev !== null) this.seats[prev] = { uid: null, name: null, bot: false };
    this.seats[seat] = { uid: c.uid, name: c.name, bot: false };
    if (this.state) this.state.players[seat].name = c.name;
    this.pushRoom();
  }
  stand(c: Client): void {
    const prev = this.seatOf(c.uid);
    if (prev === null) return;
    this.seats[prev] = { uid: null, name: null, bot: false };
    // Mid-game, an empty chair plays itself until somebody sits down.
    if (this.state) this.setBot(prev, true);
    this.pushRoom();
  }
  leave(uid: string): void {
    const c = this.clients.get(uid);
    if (c) this.stand(c);
    this.clients.delete(uid);
    if (uid === this.hostUid) {
      const next = [...this.clients.values()].find((x) => x.connected) ?? [...this.clients.values()][0];
      if (next) this.hostUid = next.uid;
    }
    if (!this.clients.size) this.emptySince = Date.now();
    this.pushRoom();
  }
  disconnect(uid: string): void {
    const c = this.clients.get(uid);
    if (!c) return;
    c.connected = false;
    if (![...this.clients.values()].some((x) => x.connected)) this.emptySince = Date.now();
    this.pushRoom();
  }
  reconnect(c: Client): void {
    this.clients.set(c.uid, c);
    c.connected = true;
    this.emptySince = null;
    const seat = this.seatOf(c.uid);
    if (seat !== null) { this.seats[seat].name = c.name; if (this.state) this.state.players[seat].name = c.name; }
    this.pushRoom();
    if (this.state) this.sendState(c.uid, []);
  }
  rename(uid: string, name: string): void {
    const seat = this.seatOf(uid);
    if (seat !== null) { this.seats[seat].name = name; if (this.state) this.state.players[seat].name = name; }
    this.pushRoom();
    if (this.state) this.broadcastState([]);
  }

  /* ── the host's controls ──────────────────────────────────────────── */
  setBot(seat: number, on: boolean): void {
    const s = this.seats[seat];
    if (!s) throw new Error("no such seat");
    if (on) {
      if (s.uid !== null) throw new Error("somebody is sitting there");
      this.seats[seat] = { uid: null, name: PLAYER_NAMES[seat] + " (bot)", bot: true };
    } else {
      if (!s.bot) return;
      this.seats[seat] = { uid: null, name: null, bot: false };
    }
    if (this.state) {
      this.state.players[seat].name = this.seats[seat].name ?? PLAYER_NAMES[seat];
      this.table = createTable(this.seats.map((x, i) => (x.bot ? i : -1)).filter((i) => i >= 0), this.seed);
      this.scheduleBots(this.botPace);
    }
    this.pushRoom();
  }
  setConfig(c: Partial<RoomConfig>): void {
    if (this.state) throw new Error("the game has started");
    this.config = { ...this.config, ...c };
    this.pushRoom();
  }
  start(seed = (Math.random() * 2 ** 32) >>> 0): void {
    if (this.state && this.state.phase !== "over") throw new Error("the game has started");
    const open = this.seats.filter((s) => s.uid === null && !s.bot).length;
    if (open) throw new Error(`${open} seat${open === 1 ? " is" : "s are"} still empty — add a bot or wait`);
    this.seed = seed;
    const cfg: GameConfig = {
      players: this.seats.map((s, i) => ({ name: s.name ?? PLAYER_NAMES[i], avatar: String(1 + ((i * 7) % 26)) })),
      mode: this.config.mode, winPoints: this.config.winPoints, turnSeconds: this.config.turnSeconds, implodeRevealMs: 2500,
    };
    if (this.config.board !== "auto") cfg.board = this.config.board;
    this.state = createGame(cfg, seed);
    this.table = createTable(this.seats.map((x, i) => (x.bot ? i : -1)).filter((i) => i >= 0), seed);
    this.pushRoom();
    this.broadcastState([]);
    this.scheduleBots(600);
    this.armTicks();
  }
  restart(): void {
    if (!this.state || this.state.phase !== "over") throw new Error("the game is not over");
    this.state = null;
    this.stopTimers();
    this.pushRoom();
  }

  /* ── play ─────────────────────────────────────────────────────────── */
  act(uid: string, action: Action): string | null {
    if (!this.state) return "no game in progress";
    const seat = this.seatOf(uid);
    if (action.type === "tick") return "not yours to send";
    if (seat === null) return "you are watching, not playing";
    const stamped = { ...action, seat } as Action;
    return this.apply(stamped);
  }
  private apply(action: Action): string | null {
    if (!this.state) return "no game";
    const r = applyAction(this.state, action, Date.now());
    if (!r.ok) return r.error;
    this.state = r.state;
    this.broadcastState(r.events);
    if (action.type !== "tick") this.scheduleBots(this.botPace);
    this.armTicks();
    if (this.state.phase === "over") { this.stopTimers(); this.pushRoom(); }
    return null;
  }
  chat(uid: string, text: string): void {
    const c = this.clients.get(uid);
    if (!c) return;
    const clean = String(text).slice(0, MAX_CHAT).trim();
    if (!clean) return;
    const msg: ServerMsg = { t: "chat", seat: this.seatOf(uid), name: c.name, text: clean, at: Date.now() };
    for (const x of this.clients.values()) if (x.connected) x.send(msg);
  }

  /* ── bots and clocks ──────────────────────────────────────────────── */
  private botTick = (): void => {
    this.botTimer = null;
    const s = this.state;
    if (!s || s.phase === "over" || !this.table.bots.size) return;
    const a = nextBotAction(this.table, s, Date.now());
    if (a) { const err = this.apply(a); if (err) console.warn(`[${this.code}] bot refused: ${a.type} by ${"seat" in a ? a.seat : "-"}: ${err}`); }
    // Nothing to do yet: a window (hand-over, implode) is passing. Look again soon.
    this.scheduleBots(a ? this.botPace : Math.min(400, this.botPace));
  };
  private scheduleBots(ms: number): void {
    if (!this.table.bots.size || !this.state || this.state.phase === "over") return;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = setTimeout(this.botTick, ms);
  }
  private armTicks(): void {
    const s = this.state;
    const need = !!s && s.phase !== "over" && ((timerEnabled(s) && s.turnTimerUntil > 0) || implodeActive(s) || handoverActive(s, Date.now()));
    if (need && !this.tickTimer) {
      this.tickTimer = setInterval(() => {
        const cur = this.state;
        if (!cur || cur.phase === "over") { this.stopTimers(); return; }
        if ((timerEnabled(cur) && cur.turnTimerUntil > 0) || implodeActive(cur)) this.apply({ type: "tick" });
        else if (!handoverActive(cur, Date.now())) { clearInterval(this.tickTimer!); this.tickTimer = null; }
      }, TICK_MS);
    }
  }
  stopTimers(): void {
    if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
  }

  /* ── what goes over the wire ──────────────────────────────────────── */
  info(forUid: string): RoomInfo {
    const seat = this.seatOf(forUid);
    return {
      code: this.code,
      config: this.config,
      seats: this.seats.map((s, i) => ({
        seat: i, name: s.name, bot: s.bot, taken: s.bot || s.uid !== null,
        connected: s.bot || (!!s.uid && !!this.clients.get(s.uid)?.connected),
        ...(i === seat ? { you: true } : {}),
      })),
      started: !!this.state,
      over: !!this.state && this.state.phase === "over",
      host: forUid === this.hostUid,
      seat,
    };
  }
  pushRoom(): void {
    const now = Date.now();
    for (const c of this.clients.values()) if (c.connected) c.send({ t: "room", room: this.info(c.uid), now });
  }
  private sendState(uid: string, events: GameEvent[]): void {
    const c = this.clients.get(uid);
    if (!c || !c.connected || !this.state) return;
    const seat = this.seatOf(uid);
    c.send({ t: "state", state: viewFor(this.state, seat), events: eventsFor(events, seat), seat, now: Date.now() });
  }
  private broadcastState(events: GameEvent[]): void {
    for (const uid of this.clients.keys()) this.sendState(uid, events);
  }
}
