/* ══════════════════════════════════════════════════════════════════════
   A ROOM — one table, its lobby, its game, and its bots
   ══════════════════════════════════════════════════════════════════════
   The room owns the real GameState. People send actions; the room applies
   them through the engine with the sender's seat stamped on, and sends
   every connected seat its own redacted view. Bots are driven here on a
   timer, so the game goes on whether or not anybody's tab is open.

   Two kinds of refusal leave here: a Refused is the engine or the room
   saying no to a move (the client un-arms and carries on); any other Error
   is a request that made no sense (the client is told, nothing changes).
   ══════════════════════════════════════════════════════════════════════ */
import {
  PLAYER_NAMES, applyAction, createGame, eventsFor, handoverActive, implodeActive, timerEnabled, viewFor,
  type Action, type GameConfig, type GameEvent, type GameState,
} from "@exploding-catan/engine";
import {
  addBot, createTable, createTauntMemory, hasBots, heard, nextBotAction, nextTaunts, removeBot, type Table,
  type TauntMemory,
} from "@exploding-catan/bots";
import {
  EMOJIS, MAX_CHAT, defaultAvatar, normalizeRoomConfig, validAvatar, type RoomConfig, type RoomInfo, type ServerMsg,
} from "@exploding-catan/protocol";
import type { RoomSnapshot } from "./store";

export interface Client {
  uid: string;
  name: string;
  send(msg: ServerMsg): void;
  connected: boolean;
}
interface Seat { uid: string | null; name: string | null; bot: boolean; avatar?: string }

export class Refused extends Error {}

/** Bots deliberately move slowly, so a Nope can be reached for before the line scrolls away. */
export const BOT_PACE = 1800;
const TICK_MS = 250;
const EMOTE_GAP_MS = 1500;

export class Room {
  readonly code: string;
  hostUid: string;
  config: RoomConfig;
  seats: Seat[];
  state: GameState | null = null;
  table: Table;
  clients = new Map<string, Client>();
  /** When the last person was here, for sweeping idle rooms. Null while somebody is connected. */
  emptySince: number | null = null;
  /** Called after anything worth keeping changed. The server persists it. */
  onChange: ((room: Room) => void) | null = null;
  readonly botPace: number;
  private seed = 0;
  private botTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private lastEmote = new Map<string, number>();
  private taunts: TauntMemory = createTauntMemory(0);

  constructor(code: string, seats: number, config: RoomConfig, botPace = BOT_PACE) {
    this.code = code;
    this.botPace = botPace;
    this.hostUid = "";
    this.config = normalizeRoomConfig(config);
    this.seats = Array.from({ length: Math.min(6, Math.max(2, seats)) }, () => ({ uid: null, name: null, bot: false }));
    this.table = createTable([], 0);
  }
  /** A fresh table: the host sits in the first chair. */
  static create(code: string, host: Client, seats: number, config: RoomConfig, botPace?: number): Room {
    const room = new Room(code, seats, config, botPace);
    room.hostUid = host.uid;
    room.clients.set(host.uid, host);
    room.seats[0] = { uid: host.uid, name: host.name, bot: false };
    room.changed();
    return room;
  }
  /** A room as it was saved: nobody connected yet, bots and clocks running again. */
  static fromSnapshot(snap: RoomSnapshot, botPace?: number): Room {
    const room = new Room(snap.code, snap.seats.length, snap.config, botPace);
    room.hostUid = snap.hostUid;
    room.seats = snap.seats.map((s) => ({ ...s }));
    room.seed = snap.seed;
    room.state = snap.state;
    room.emptySince = Date.now();
    room.table = createTable(room.botSeats(), room.seed);
    room.taunts = createTauntMemory(room.seed ^ 0x5eed, room.state ?? undefined);
    if (room.state) { room.scheduleBots(room.botPace); room.armTicks(); }
    return room;
  }
  toSnapshot(): RoomSnapshot {
    return {
      code: this.code, hostUid: this.hostUid, config: this.config,
      seats: this.seats.map((s) => ({ ...s })), seed: this.seed, state: this.state, savedAt: Date.now(),
    };
  }
  private changed(): void { if (this.onChange) this.onChange(this); }
  private botSeats(): number[] { return this.seats.map((x, i) => (x.bot ? i : -1)).filter((i) => i >= 0); }

  /* ── who is here ───────────────────────────────────────────────────── */
  seatOf(uid: string): number | null {
    const i = this.seats.findIndex((s) => s.uid === uid);
    return i < 0 ? null : i;
  }
  isHost(uid: string): boolean {
    // The host, or anybody at all when the host has gone: a table must never be stuck without one.
    return uid === this.hostUid || !this.clients.has(this.hostUid);
  }
  requireHost(uid: string): void {
    if (!this.isHost(uid)) throw new Error("only the host can do that");
  }
  private noteEmpty(): void {
    const anyone = [...this.clients.values()].some((x) => x.connected);
    this.emptySince = anyone ? null : Date.now();
  }
  /** Arriving, or coming back: the seat they held, else the first free chair. */
  join(c: Client): void {
    this.clients.set(c.uid, c);
    c.connected = true;
    this.noteEmpty();
    const seat = this.seatOf(c.uid);
    if (seat !== null) {
      this.seats[seat].name = c.name;
      if (this.state) this.state.players[seat].name = c.name;
    } else {
      const free = this.seats.findIndex((s) => s.uid === null && !s.bot);
      if (free >= 0) this.seats[free] = { uid: c.uid, name: c.name, bot: false };
      if (free >= 0 && this.state) this.state.players[free].name = c.name;
    }
    this.changed();
    this.pushRoom();
    if (this.state) this.sendState(c.uid, []);
  }
  sit(uid: string, seat: number): void {
    const c = this.clients.get(uid);
    if (!c) throw new Error("you are not at this table");
    const s = this.seats[seat];
    if (!s || s.bot || (s.uid !== null && s.uid !== uid)) throw new Error("that seat is taken");
    const prev = this.seatOf(uid);
    if (prev !== null) this.seats[prev] = { uid: null, name: null, bot: false };
    this.seats[seat] = { uid, name: c.name, bot: false };
    if (this.state) this.state.players[seat].name = c.name;
    this.changed();
    this.pushRoom();
  }
  /** Give the chair up. Mid-game, an empty chair plays itself until somebody sits down. */
  private vacate(uid: string): void {
    const prev = this.seatOf(uid);
    if (prev === null) return;
    this.seats[prev] = { uid: null, name: null, bot: false };
    if (this.state) this.setBot(prev, true, false);
  }
  stand(uid: string): void {
    this.vacate(uid);
    this.changed();
    this.pushRoom();
  }
  leave(uid: string): void {
    this.vacate(uid);
    this.clients.delete(uid);
    if (uid === this.hostUid) {
      const next = [...this.clients.values()].find((x) => x.connected) ?? [...this.clients.values()][0];
      if (next) this.hostUid = next.uid;
    }
    this.noteEmpty();
    this.changed();
    this.pushRoom();
  }
  disconnect(uid: string): void {
    const c = this.clients.get(uid);
    if (!c) return;
    c.connected = false;
    this.noteEmpty();
    this.pushRoom();
  }
  rename(uid: string, name: string): void {
    const seat = this.seatOf(uid);
    if (seat === null) return;
    this.seats[seat].name = name;
    if (this.state) this.state.players[seat].name = name;
    this.changed();
    this.pushRoom();
  }
  /** Your portrait, for your seat. Mid-game it changes on every screen. */
  setAvatar(uid: string, avatar: string): void {
    const seat = this.seatOf(uid);
    const ok = validAvatar(avatar);
    if (seat === null || !ok) return;
    this.seats[seat].avatar = ok;
    if (this.state) { this.state.players[seat].avatar = ok; this.broadcastState([]); }
    this.changed();
    this.pushRoom();
  }

  /* ── the host's controls ──────────────────────────────────────────── */
  setBot(seat: number, on: boolean, announce = true): void {
    const s = this.seats[seat];
    if (!s) throw new Error("no such seat");
    if (on) {
      if (s.uid !== null) throw new Error("somebody is sitting there");
      this.seats[seat] = { uid: null, name: PLAYER_NAMES[seat] + " (bot)", bot: true };
      addBot(this.table, seat);
    } else {
      if (!s.bot) return;
      this.seats[seat] = { uid: null, name: null, bot: false };
      removeBot(this.table, seat);
    }
    if (this.state) {
      this.state.players[seat].name = this.seats[seat].name ?? PLAYER_NAMES[seat];
      this.scheduleBots(this.botPace);
    }
    if (announce) { this.changed(); this.pushRoom(); }
  }
  setConfig(c: unknown): void {
    if (this.state) throw new Error("the game has started");
    this.config = normalizeRoomConfig(c, this.config);
    this.changed();
    this.pushRoom();
  }
  start(seed = (Math.random() * 2 ** 32) >>> 0): void {
    if (this.state && this.state.phase !== "over") throw new Error("the game has started");
    const open = this.seats.filter((s) => s.uid === null && !s.bot).length;
    if (open) throw new Error(`${open} seat${open === 1 ? " is" : "s are"} still empty — add a bot or wait`);
    this.seed = seed;
    const cfg: GameConfig = {
      players: this.seats.map((s, i) => ({ name: s.name ?? PLAYER_NAMES[i], avatar: s.avatar ?? defaultAvatar(i) })),
      mode: this.config.mode, winPoints: this.config.winPoints, turnSeconds: this.config.turnSeconds, implodeRevealMs: 2500,
    };
    if (this.config.board !== "auto") cfg.board = this.config.board;
    this.state = createGame(cfg, seed);
    this.table = createTable(this.botSeats(), seed);
    this.taunts = createTauntMemory(seed ^ 0x5eed);
    this.changed();
    this.pushRoom();
    this.broadcastState([]);
    this.scheduleBots(600);
    this.armTicks();
  }
  restart(): void {
    if (!this.state || this.state.phase !== "over") throw new Error("the game is not over");
    this.state = null;
    this.stopTimers();
    this.changed();
    this.pushRoom();
  }

  /* ── play ─────────────────────────────────────────────────────────── */
  /** A seat's action. Throws Refused when the engine says no. */
  act(uid: string, action: Action): void {
    if (!this.state) throw new Refused("no game in progress");
    const seat = this.seatOf(uid);
    if (action.type === "tick") throw new Refused("not yours to send");
    if (seat === null) throw new Refused("you are watching, not playing");
    const err = this.apply({ ...action, seat } as Action);
    if (err) throw new Refused(err);
  }
  private apply(action: Action): string | null {
    if (!this.state) return "no game";
    const r = applyAction(this.state, action, Date.now());
    if (!r.ok) return r.error;
    const before = this.state;
    this.state = r.state;
    if (action.type === "tick" && !r.events.length) {
      // Only the clocks moved. Say so in a few bytes, and keep nothing.
      if (before.turnTimerUntil !== r.state.turnTimerUntil || before.implodeUntil !== r.state.implodeUntil) this.broadcastClock();
      return null;
    }
    this.broadcastState(r.events);
    this.changed();
    if (action.type !== "tick") { this.scheduleBots(this.botPace); this.botTaunts(); }
    this.armTicks();
    if (this.state.phase === "over") { this.stopTimers(); this.pushRoom(); }
    return null;
  }
  chat(uid: string, text: string): void {
    const c = this.clients.get(uid);
    if (!c) return;
    const clean = String(text).slice(0, MAX_CHAT).trim();
    if (!clean) return;
    this.send({ t: "chat", seat: this.seatOf(uid), name: c.name, text: clean, at: Date.now() });
    // Bots cannot read it and would not care if they could, which is roughly the answer it gets.
    const back = heard(this.table, this.taunts, this.seatOf(uid), Date.now());
    if (back) setTimeout(() => this.send({ t: "emote", seat: back.seat, emoji: back.emoji, at: Date.now() }), 900 + Math.random() * 1400);
  }
  /** The bots react to what the table just saw. */
  private botTaunts(): void {
    if (!this.state || !hasBots(this.table)) return;
    for (const t of nextTaunts(this.table, this.taunts, this.state, Date.now())) this.send({ t: "emote", seat: t.seat, emoji: t.emoji, at: Date.now() });
  }
  /** An emoji thrown at the table. Seated players only, from the tray only, not too often. */
  emote(uid: string, emoji: string): void {
    const seat = this.seatOf(uid);
    if (seat === null || !EMOJIS.includes(emoji)) return;
    const now = Date.now();
    if (now - (this.lastEmote.get(uid) ?? 0) < EMOTE_GAP_MS) return;
    this.lastEmote.set(uid, now);
    this.send({ t: "emote", seat, emoji, at: now });
  }

  /* ── bots and clocks ──────────────────────────────────────────────── */
  private botTick = (): void => {
    this.botTimer = null;
    const s = this.state;
    if (!s || s.phase === "over" || !hasBots(this.table)) return;
    const a = nextBotAction(this.table, s, Date.now());
    if (a) { const err = this.apply(a); if (err) console.warn(`[${this.code}] bot refused: ${a.type} by ${"seat" in a ? a.seat : "-"}: ${err}`); }
    // Nothing to do yet: a window (hand-over, implode) is passing. Look again soon.
    this.scheduleBots(a ? this.botPace : Math.min(400, this.botPace));
  };
  private scheduleBots(ms: number): void {
    if (!hasBots(this.table) || !this.state || this.state.phase === "over") return;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = setTimeout(this.botTick, ms);
  }
  private clocksRunning(): boolean {
    const s = this.state;
    return !!s && s.phase !== "over" && ((timerEnabled(s) && s.turnTimerUntil > 0) || implodeActive(s) || handoverActive(s, Date.now()));
  }
  private armTicks(): void {
    if (!this.clocksRunning() || this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      const cur = this.state;
      if (!cur || cur.phase === "over") { this.stopTimers(); return; }
      if ((timerEnabled(cur) && cur.turnTimerUntil > 0) || implodeActive(cur)) this.apply({ type: "tick" });
      else if (!handoverActive(cur, Date.now())) { clearInterval(this.tickTimer!); this.tickTimer = null; }
    }, TICK_MS);
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
        seat: i, name: s.name, avatar: s.avatar ?? (s.bot || s.uid ? defaultAvatar(i) : null), bot: s.bot, taken: s.bot || s.uid !== null,
        connected: s.bot || (!!s.uid && !!this.clients.get(s.uid)?.connected),
        ...(i === seat ? { you: true } : {}),
      })),
      started: !!this.state,
      over: !!this.state && this.state.phase === "over",
      host: this.isHost(forUid),
      seat,
    };
  }
  private send(msg: ServerMsg): void {
    for (const x of this.clients.values()) if (x.connected) x.send(msg);
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
  private broadcastClock(): void {
    const s = this.state;
    if (!s) return;
    this.send({ t: "clock", turnTimerUntil: s.turnTimerUntil, turnTickAt: s.turnTickAt, implodeUntil: s.implodeUntil, implodeFrom: s.implodeFrom, now: Date.now() });
  }
}
