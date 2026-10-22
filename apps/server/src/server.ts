/* ══════════════════════════════════════════════════════════════════════
   THE SERVER — rooms, sessions, and one WebSocket per tab
   ══════════════════════════════════════════════════════════════════════ */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from "@exploding-catan/protocol";
import { Room, randomCode, type Client } from "./room";

const ROOM_IDLE_MS = 10 * 60 * 1000;
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain" };

interface Session { uid: string; name: string; room: Room | null; ws: WebSocket | null }

export interface ServerOptions { port?: number; staticDir?: string | null; log?: (line: string) => void; botPace?: number }

export function startServer(opts: ServerOptions = {}) {
  const log = opts.log ?? ((l: string) => console.log(l));
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Session>(); // token -> session

  const http = createServer((req, res) => serveStatic(req, res, opts.staticDir ?? null, rooms));
  const wss = new WebSocketServer({ server: http });

  wss.on("connection", (ws) => {
    let me: Session | null = null;
    const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
    const fail = (message: string) => send({ t: "error", message });

    ws.on("message", (raw) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(raw)); } catch { fail("not JSON"); return; }
      try {
        if (msg.t === "hello") {
          if (msg.v !== PROTOCOL_VERSION) { fail(`protocol ${msg.v} is not ${PROTOCOL_VERSION} — reload`); return; }
          const name = cleanName(msg.name);
          let token = msg.token && sessions.has(msg.token) ? msg.token : null;
          if (!token) { token = randomUUID(); sessions.set(token, { uid: randomUUID(), name, room: null, ws: null }); }
          me = sessions.get(token)!;
          if (me.ws && me.ws !== ws) { try { me.ws.close(4000, "replaced by a newer tab"); } catch { /* gone */ } }
          me.ws = ws;
          me.name = name || me.name;
          send({ t: "welcome", v: PROTOCOL_VERSION, token, name: me.name });
          if (me.room) me.room.reconnect(clientFor(me, send));
          return;
        }
        if (!me) { fail("say hello first"); return; }
        const s = me;
        switch (msg.t) {
          case "ping": send({ t: "pong", now: Date.now() }); return;
          case "setName": s.name = cleanName(msg.name) || s.name; if (s.room) s.room.rename(s.uid, s.name); return;
          case "create": {
            if (s.room) s.room.leave(s.uid);
            let code = randomCode();
            while (rooms.has(code)) code = randomCode();
            const room = new Room(code, clientFor(s, send), msg.seats, msg.config, opts.botPace);
            rooms.set(code, room);
            s.room = room;
            log(`room ${code} created by ${s.name}`);
            room.pushRoom();
            return;
          }
          case "join": {
            const room = rooms.get(String(msg.code).toUpperCase().trim());
            if (!room) { fail("no room with that code"); return; }
            if (s.room && s.room !== room) s.room.leave(s.uid);
            s.room = room;
            room.join(clientFor(s, send));
            return;
          }
          case "leave": if (s.room) { s.room.leave(s.uid); s.room = null; } send({ t: "left" }); return;
        }
        const room = s.room;
        if (!room) { fail("you are not in a room"); return; }
        switch (msg.t) {
          case "sit": room.sit(room.clients.get(s.uid)!, msg.seat); return;
          case "stand": room.stand(room.clients.get(s.uid)!); return;
          case "bot": hostOnly(room, s); room.setBot(msg.seat, msg.on); return;
          case "config": hostOnly(room, s); room.setConfig(msg.config); return;
          case "start": hostOnly(room, s); room.start(msg.seed); return;
          case "restart": hostOnly(room, s); room.restart(); return;
          case "chat": room.chat(s.uid, msg.text); return;
          case "action": { const err = room.act(s.uid, msg.action); if (err) send({ t: "refused", error: err, action: msg.action }); return; }
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    });
    ws.on("close", () => { if (me && me.ws === ws) { me.ws = null; if (me.room) me.room.disconnect(me.uid); } });
  });

  // Rooms nobody has been in for a while are forgotten.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.emptySince !== null && now - room.emptySince > ROOM_IDLE_MS) {
        room.stopTimers();
        rooms.delete(code);
        for (const s of sessions.values()) if (s.room === room) s.room = null;
        log(`room ${code} swept`);
      }
    }
  }, 60_000);

  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  http.listen(port, () => log(`exploding-catan server on :${(http.address() as { port: number }).port}`));
  return {
    http, wss, rooms,
    port: () => (http.address() as { port: number }).port,
    close: () => new Promise<void>((res) => { clearInterval(sweeper); for (const r of rooms.values()) r.stopTimers(); wss.close(); http.close(() => res()); }),
  };
}

function clientFor(s: Session, send: (m: ServerMsg) => void): Client {
  return { uid: s.uid, name: s.name, connected: true, send };
}
function hostOnly(room: Room, s: Session): void {
  if (room.hostUid !== s.uid) throw new Error("only the host can do that");
}
function cleanName(n: unknown): string {
  return Array.from(String(n ?? ""))
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch !== "<" && ch !== ">")
    .join("")
    .trim()
    .slice(0, 16);
}

function serveStatic(req: IncomingMessage, res: ServerResponse, dir: string | null, rooms: Map<string, Room>): void {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
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
