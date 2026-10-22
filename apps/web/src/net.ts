/* ══════════════════════════════════════════════════════════════════════
   NET — the one WebSocket to the server
   ══════════════════════════════════════════════════════════════════════
   Online, this screen decides nothing. It sends what the player did and
   draws the state the server sends back. The server's clock travels with
   every message, so the windows that depend on time are judged by it.
   ══════════════════════════════════════════════════════════════════════ */
import type { Action, GameEvent, GameState } from "@exploding-catan/engine";
import { PROTOCOL_VERSION, type ClientMsg, type RoomConfig, type RoomInfo, type ServerMsg } from "@exploding-catan/protocol";

const TOKEN_KEY = "exploding-catan:token";
const NAME_KEY = "exploding-catan:name";
const SERVER_KEY = "exploding-catan:server";

export interface NetHandlers {
  room(room: RoomInfo | null): void;
  state(state: GameState, events: GameEvent[], seat: number | null): void;
  chat(seat: number | null, name: string, text: string, at: number): void;
  emote(seat: number, emoji: string): void;
  clock(p: { turnTimerUntil: number; turnTickAt: number; implodeUntil: number; implodeFrom: number }): void;
  refused(error: string): void;
  error(message: string): void;
  connection(up: boolean): void;
}

export class Net {
  ws: WebSocket | null = null;
  room: RoomInfo | null = null;
  seat: number | null = null;
  name = "";
  url = "";
  private offset = 0;
  private handlers: NetHandlers;
  private closedByUs = false;
  private retry: number | null = null;

  constructor(handlers: NetHandlers) { this.handlers = handlers; }

  get connected(): boolean { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }
  get online(): boolean { return this.connected && !!this.room; }
  /** The server's clock, as best this screen can tell. */
  now(): number { return Date.now() + this.offset; }

  /** Where the server is: configured, remembered, or this same host when the server served the page. */
  static defaultUrl(): string {
    const env = (import.meta.env?.VITE_SERVER_URL as string | undefined) ?? "";
    if (env) return env;
    try { const saved = localStorage.getItem(SERVER_KEY); if (saved) return saved; } catch { /* no storage */ }
    if (location.hostname.endsWith("github.io") || location.protocol === "file:") return "";
    return (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
  }
  static savedName(): string { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } }

  connect(url: string, name: string): Promise<void> {
    this.disconnect();
    this.closedByUs = false;
    this.url = url;
    this.name = name;
    try { localStorage.setItem(SERVER_KEY, url); localStorage.setItem(NAME_KEY, name); } catch { /* fine */ }
    return new Promise((res, rej) => {
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch (e) { rej(e); return; }
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        let token: string | undefined;
        try { token = localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { /* none */ }
        this.send({ t: "hello", v: PROTOCOL_VERSION, name, ...(token ? { token } : {}) });
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as ServerMsg;
        if (m.t === "welcome") {
          try { localStorage.setItem(TOKEN_KEY, m.token); } catch { /* fine */ }
          this.name = m.name;
          this.handlers.connection(true);
          if (!settled) { settled = true; res(); }
          return;
        }
        this.handle(m);
      };
      ws.onerror = () => { if (!settled) { settled = true; rej(new Error("could not reach the server")); } };
      ws.onclose = (ev) => {
        if (this.ws === ws) this.ws = null;
        this.handlers.connection(false);
        if (!settled) { settled = true; rej(new Error(ev.reason || "the server closed the connection")); return; }
        // Dropped: come back and pick the seat up again, unless we left on purpose.
        if (!this.closedByUs && ev.code !== 4000) this.retry = window.setTimeout(() => { this.connect(url, this.name).catch(() => { /* tries again on close */ }); }, 1500);
      };
    });
  }
  disconnect(): void {
    this.closedByUs = true;
    if (this.retry) { clearTimeout(this.retry); this.retry = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* gone */ } }
    this.ws = null;
    this.room = null;
    this.seat = null;
  }
  private handle(m: ServerMsg): void {
    switch (m.t) {
      case "room": this.offset = m.now - Date.now(); this.room = m.room; this.seat = m.room.seat; this.handlers.room(m.room); break;
      case "left": this.room = null; this.seat = null; this.handlers.room(null); break;
      case "state": this.offset = m.now - Date.now(); this.seat = m.seat; this.handlers.state(m.state, m.events, m.seat); break;
      case "clock": this.offset = m.now - Date.now(); this.handlers.clock(m); break;
      case "refused": this.handlers.refused(m.error); break;
      case "error": this.handlers.error(m.message); break;
      case "chat": this.handlers.chat(m.seat, m.name, m.text, m.at); break;
      case "emote": this.handlers.emote(m.seat, m.emoji); break;
      case "pong": this.offset = m.now - Date.now(); break;
    }
  }
  send(m: ClientMsg): void {
    if (!this.connected) { this.handlers.error("not connected"); return; }
    this.ws!.send(JSON.stringify(m));
  }
  create(seats: number, config: RoomConfig): void { this.send({ t: "create", seats, config }); }
  join(code: string): void { this.send({ t: "join", code: code.toUpperCase().trim() }); }
  sit(seat: number): void { this.send({ t: "sit", seat }); }
  stand(): void { this.send({ t: "stand" }); }
  bot(seat: number, on: boolean): void { this.send({ t: "bot", seat, on }); }
  config(config: Partial<RoomConfig>): void { this.send({ t: "config", config }); }
  start(): void { this.send({ t: "start" }); }
  restart(): void { this.send({ t: "restart" }); }
  leave(): void { this.send({ t: "leave" }); this.room = null; this.seat = null; }
  action(action: Action): void { this.send({ t: "action", action }); }
  chat(text: string): void { this.send({ t: "chat", text }); }
  setAvatar(avatar: string): void { this.send({ t: "setAvatar", avatar }); }
  emote(emoji: string): void { this.send({ t: "emote", emoji }); }
}
