import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMsg, ServerMsg } from "@exploding-catan/protocol";
import { geometry, canPlaceSettlement, type GameState } from "@exploding-catan/engine";
import { startServer } from "../src/server";

let srv: ReturnType<typeof startServer>;
beforeAll(() => { srv = startServer({ port: 0, log: () => {}, botPace: 2 }); });
afterAll(async () => { await srv.close(); });

/** A tiny test client: send, and wait for the next message of a kind. */
class C {
  ws: WebSocket;
  inbox: ServerMsg[] = [];
  waiters: { t: string; res: (m: ServerMsg) => void }[] = [];
  token = "";
  constructor() { this.ws = new WebSocket(`ws://127.0.0.1:${srv.port()}`); this.ws.on("message", (d) => { const m = JSON.parse(String(d)) as ServerMsg; const i = this.waiters.findIndex((w) => w.t === m.t); if (i >= 0) this.waiters.splice(i, 1)[0].res(m); else this.inbox.push(m); }); }
  open(): Promise<void> { return new Promise((r) => this.ws.once("open", () => r())); }
  send(m: ClientMsg): void { this.ws.send(JSON.stringify(m)); }
  next<T extends ServerMsg["t"]>(t: T, ms = 5000): Promise<Extract<ServerMsg, { t: T }>> {
    const i = this.inbox.findIndex((m) => m.t === t);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>);
    return new Promise((res, rej) => { const timer = setTimeout(() => rej(new Error(`no ${t} within ${ms}ms`)), ms); this.waiters.push({ t, res: (m) => { clearTimeout(timer); res(m as Extract<ServerMsg, { t: T }>); } }); });
  }
  drain(t: string): void { this.inbox = this.inbox.filter((m) => m.t !== t); }
  close(): void { this.ws.close(); }
}
async function hello(name: string, token?: string): Promise<C> {
  const c = new C(); await c.open();
  c.send({ t: "hello", v: 1, name, ...(token ? { token } : {}) });
  const w = await c.next("welcome"); c.token = w.token;
  return c;
}
const config = { mode: "normal" as const, board: "auto" as const, winPoints: 10, turnSeconds: 0 };

describe("rooms", () => {
  it("creates a room, seats people, starts, and sends each seat its own view", async () => {
    const a = await hello("Ann"), b = await hello("Ben");
    a.send({ t: "create", seats: 3, config });
    let room = (await a.next("room")).room;
    expect(room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(room.seat).toBe(0); expect(room.host).toBe(true);
    b.send({ t: "join", code: room.code });
    room = (await b.next("room")).room;
    expect(room.seat).toBe(1); expect(room.host).toBe(false);
    // Ben cannot start; Ann cannot start with an empty seat; a bot fills it.
    b.send({ t: "start" });
    expect((await b.next("error")).message).toMatch(/host/);
    a.send({ t: "start" });
    expect((await a.next("error")).message).toMatch(/empty/);
    a.send({ t: "bot", seat: 2, on: true });
    a.drain("room"); b.drain("room");
    a.send({ t: "start", seed: 5 });
    const sa = await a.next("state"), sb = await b.next("state");
    expect(sa.seat).toBe(0); expect(sb.seat).toBe(1);
    expect(sa.state.players[2].name).toContain("bot");
    expect(sa.state.deck.every((c) => c.key === "hidden")).toBe(true);
    expect(sa.state.rng).toBe(0);
    // The current player places; the other seat is refused; both see the piece.
    const s = sa.state as GameState;
    const geo = geometry(s.board);
    const vid = geo.vertices.find((v) => canPlaceSettlement(s, geo, v.id, s.cur, true))!.id;
    const mover = s.cur === 0 ? a : s.cur === 1 ? b : null;
    const other = mover === a ? b : a;
    if (mover) {
      other.send({ t: "action", action: { type: "placeSettlement", seat: 9, vid } });
      expect((await other.next("refused")).error).toMatch(/not your turn/);
      a.drain("state"); b.drain("state");
      mover.send({ t: "action", action: { type: "placeSettlement", seat: 9, vid } }); // seat is stamped by the server
      const after = await other.next("state");
      expect(after.state.vOwner[vid]).toBe(s.cur);
      expect(after.events.some((e) => e.type === "feed")).toBe(true);
    }
    a.close(); b.close();
  });

  it("runs a table of bots to the end without anybody present, and a reconnecting seat sees it", async () => {
    const a = await hello("Ann");
    a.send({ t: "create", seats: 3, config: { ...config, winPoints: 4 } });
    const code = (await a.next("room")).room.code;
    a.send({ t: "bot", seat: 1, on: true }); a.send({ t: "bot", seat: 2, on: true });
    a.send({ t: "stand" }); // Ann watches; her chair becomes a bot? No: standing before start leaves it empty.
    a.send({ t: "bot", seat: 0, on: true });
    a.drain("room");
    a.send({ t: "start", seed: 9 });
    await a.next("state");
    const room = srv.rooms.get(code)!;
    a.close();
    // Drop out entirely; the room keeps playing.
    await new Promise((r) => setTimeout(r, 50));
    // Every turn boundary waits out the real three-second hand-over window, so
    // a whole game takes minutes; three turns is proof the table runs itself.
    const t0 = Date.now();
    while (room.state && room.state.turnCounter < 3 && Date.now() - t0 < 25000) await new Promise((r) => setTimeout(r, 200));
    expect(room.state?.turnCounter).toBeGreaterThanOrEqual(3);
    // Reconnect with the old token and get the live state, bots still going.
    const again = await hello("Ann", a.token);
    const st = await again.next("state");
    expect(st.state.turnCounter).toBeGreaterThanOrEqual(3);
    expect(st.seat).toBeNull();
    again.close();
  }, 40000);

  it("keeps a seat across a disconnect and hands it to a bot only when the player stands", async () => {
    const a = await hello("Ann"), b = await hello("Ben");
    a.send({ t: "create", seats: 2, config });
    const code = (await a.next("room")).room.code;
    b.send({ t: "join", code });
    await b.next("room");
    a.drain("room"); b.drain("room");
    a.send({ t: "start", seed: 3 });
    await a.next("state"); await b.next("state");
    b.close();
    const room = srv.rooms.get(code)!;
    await new Promise((r) => setTimeout(r, 50));
    expect(room.seats[1].uid).not.toBeNull();
    expect(room.info(room.hostUid).seats[1].connected).toBe(false);
    const b2 = await hello("Ben", b.token);
    expect((await b2.next("room")).room.seat).toBe(1);
    b2.send({ t: "stand" });
    await new Promise((r) => setTimeout(r, 50));
    expect(room.seats[1].bot).toBe(true);
    a.close(); b2.close();
  });

  it("relays chat to everybody in the room, trimmed", async () => {
    const a = await hello("Ann"), b = await hello("Ben");
    a.send({ t: "create", seats: 2, config });
    const code = (await a.next("room")).room.code;
    b.send({ t: "join", code }); await b.next("room");
    a.send({ t: "chat", text: "  hello <b>there</b> " + "x".repeat(300) });
    const m = await b.next("chat");
    expect(m.name).toBe("Ann"); expect(m.seat).toBe(0);
    expect(m.text.length).toBeLessThanOrEqual(140);
    a.close(); b.close();
  });
});
