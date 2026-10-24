/* ══════════════════════════════════════════════════════════════════════
   THE SERVER — rooms, sessions, and one WebSocket per tab
   ══════════════════════════════════════════════════════════════════════ */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { CODE_CHARS, PROTOCOL_VERSION, cleanName, type ClientMsg, type ServerMsg } from "@exploding-catan/protocol";
import { Refused, Room, type Client } from "./room";
import { MemoryStore, type RoomStore } from "./store";

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain" };

interface Session { token: string; uid: string; name: string; room: Room | null; ws: WebSocket | null }

export interface ServerOptions {
  port?: number;
  staticDir?: string | null;
  log?: (line: string) => void;
  botPace?: number;
  store?: RoomStore;
  /** Rooms nobody has been in for this long are forgotten. */
  roomIdleMs?: number;
  /** Let a client choose the game's seed. Tests only: a host who picks the seed knows every card. */
  allowClientSeed?: boolean;
  /** How long a vanished player is given to come back before a bot plays their seat. */
  seatGraceMs?: number;
}

export function randomCode(rng: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return s;
}

export function startServer(opts: ServerOptions = {}) {
  const log = opts.log ?? ((l: string) => console.log(l));
  const store = opts.store ?? new MemoryStore();
  const roomIdleMs = opts.roomIdleMs ?? 10 * 60 * 1000;
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Session>(); // token -> session
  const persistRoom = (room: Room) => store.saveRoom(room.toSnapshot());
  const persistSession = (s: Session) => store.saveSession({ token: s.token, uid: s.uid, name: s.name, room: s.room ? s.room.code : null });

  // Pick up where the last process left off.
  for (const snap of store.loadRooms()) {
    try {
      const room = Room.fromSnapshot(snap, opts.botPace, opts.seatGraceMs);
      room.onChange = persistRoom;
      rooms.set(room.code, room);
    } catch (err) { log(`could not restore room ${snap.code}: ${err instanceof Error ? err.message : err}`); }
  }
  for (const rec of store.loadSessions()) {
    sessions.set(rec.token, { token: rec.token, uid: rec.uid, name: rec.name, room: rec.room ? rooms.get(rec.room) ?? null : null, ws: null });
  }
  if (rooms.size) log(`restored ${rooms.size} room${rooms.size === 1 ? "" : "s"}, ${sessions.size} session${sessions.size === 1 ? "" : "s"}`);

  const http = createServer((req, res) => serveStatic(req, res, opts.staticDir ?? null, rooms));
  // Compressed per message, with no context carried between messages, so a
  // 30KB state costs ~4KB on the wire and a socket costs no zlib memory while idle.
  const wss = new WebSocketServer({
    server: http,
    perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true, zlibDeflateOptions: { level: 1 } },
  });

  wss.on("connection", (ws) => {
    let me: Session | null = null;
    const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
    const fail = (message: string) => send({ t: "error", message });
    const clientOf = (s: Session): Client => ({ uid: s.uid, name: s.name, connected: true, send });

    ws.on("message", (raw) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(raw)); } catch { fail("not JSON"); return; }
      try {
        if (msg.t === "hello") {
          if (msg.v !== PROTOCOL_VERSION) { fail(`protocol ${msg.v} is not ${PROTOCOL_VERSION} — reload`); return; }
          const name = cleanName(msg.name);
          let s = msg.token ? sessions.get(msg.token) : undefined;
          if (!s) { s = { token: randomUUID(), uid: randomUUID(), name, room: null, ws: null }; sessions.set(s.token, s); }
          if (s.ws && s.ws !== ws) { try { s.ws.close(4000, "replaced by a newer tab"); } catch { /* gone */ } }
          me = s;
          s.ws = ws;
          s.name = name || s.name;
          persistSession(s);
          send({ t: "welcome", v: PROTOCOL_VERSION, token: s.token, name: s.name });
          if (s.room) s.room.join(clientOf(s), false);
          return;
        }
        if (!me) { fail("say hello first"); return; }
        const s = me;
        switch (msg.t) {
          case "ping": send({ t: "pong", now: Date.now() }); return;
          case "setName": s.name = cleanName(msg.name) || s.name; persistSession(s); if (s.room) s.room.rename(s.uid, s.name); return;
          case "setAvatar": if (s.room) s.room.setAvatar(s.uid, msg.avatar); return;
          case "create": {
            if (s.room) s.room.leave(s.uid);
            let code = randomCode();
            while (rooms.has(code)) code = randomCode();
            const room = Room.create(code, clientOf(s), msg.seats, msg.config, opts.botPace, opts.seatGraceMs);
            room.onChange = persistRoom;
            rooms.set(code, room);
            s.room = room;
            persistSession(s);
            persistRoom(room);
            log(`room ${code} created by ${s.name}`);
            room.pushRoom();
            return;
          }
          case "join": {
            const room = rooms.get(String(msg.code).toUpperCase().trim());
            if (!room) { fail("no room with that code"); return; }
            if (s.room && s.room !== room) s.room.leave(s.uid);
            s.room = room;
            persistSession(s);
            room.join(clientOf(s));
            return;
          }
          case "leave": if (s.room) { s.room.leave(s.uid); s.room = null; persistSession(s); } send({ t: "left" }); return;
        }
        const room = s.room;
        if (!room) { fail("you are not in a room"); return; }
        switch (msg.t) {
          case "sit": room.sit(s.uid, msg.seat); return;
          case "stand": room.stand(s.uid); return;
          case "bot": room.requireHost(s.uid); room.setBot(msg.seat, msg.on); return;
          case "config": room.requireHost(s.uid); room.setConfig(msg.config); return;
          case "start": room.requireHost(s.uid); room.start(opts.allowClientSeed ? msg.seed : undefined); return;
          case "restart": room.requireHost(s.uid); room.restart(); return;
          case "chat": room.chat(s.uid, msg.text); return;
          case "emote": room.emote(s.uid, msg.emoji); return;
          case "action": room.act(s.uid, msg.action); return;
        }
      } catch (err) {
        if (err instanceof Refused) send({ t: "refused", error: err.message, ...(msg.t === "action" ? { action: msg.action } : {}) });
        else fail(err instanceof Error ? err.message : String(err));
      }
    });
    ws.on("close", () => { if (me && me.ws === ws) { me.ws = null; if (me.room) me.room.disconnect(me.uid); } });
  });

  // Rooms nobody has been in for a while are forgotten, on disk too.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.emptySince !== null && now - room.emptySince > roomIdleMs) {
        room.stopTimers();
        rooms.delete(code);
        store.deleteRoom(code);
        for (const s of sessions.values()) if (s.room === room) { s.room = null; persistSession(s); }
        log(`room ${code} swept`);
      }
    }
  }, Math.min(60_000, roomIdleMs));

  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  http.listen(port, () => log(`exploding-catan server on :${(http.address() as { port: number }).port}`));
  const close = () => new Promise<void>((res) => {
    clearInterval(sweeper);
    for (const r of rooms.values()) { r.stopTimers(); persistRoom(r); }
    store.flush();
    for (const c of wss.clients) c.close(1012, "server restarting");
    wss.close();
    http.close(() => res());
  });
  return { http, wss, rooms, store, port: () => (http.address() as { port: number }).port, close };
}

function serveStatic(req: IncomingMessage, res: ServerResponse, dir: string | null, rooms: Map<string, Room>): void {
  const url = new URL(req.url ?? "/", "http://x");
  // Any origin may ask: the web app on Pages knocks here to wake a sleeping host before connecting.
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  if (!dir) { res.writeHead(404); res.end("no static dir"); return; }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  const file = join(dir, p);
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
    const index = join(dir, "index.html");
    if (existsSync(index)) { res.writeHead(200, { "content-type": MIME[".html"] }); res.end(readFileSync(index)); return; }
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
  res.end(readFileSync(file));
}
