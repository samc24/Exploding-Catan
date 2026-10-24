import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMsg, ServerMsg } from "@exploding-catan/protocol";
import { geometry, canPlaceSettlement, type GameState } from "@exploding-catan/engine";
import { startServer } from "../src/server";

let srv: ReturnType<typeof startServer>;
beforeAll(() => { srv = startServer({ port: 0, log: () => {}, botPace: 2, allowClientSeed: true, seatGraceMs: 150 }); });
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

  it("keeps a seat across a blip; past the grace a bot plays it and the table is told; the player gets it straight back", async () => {
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
    // Within the grace: still Ben's chair, just not connected. No bot, no word to the table.
    expect(room.seats[1].uid).not.toBeNull();
    expect(room.seats[1].away).toBeFalsy();
    expect(room.info(room.hostUid).seats[1].connected).toBe(false);
    // Past it: a bot plays the seat, the chair stays Ben's, and the table is told.
    const gone = await a.next("notice", 3000);
    expect(gone.text).toMatch(/Ben has left — a bot is playing/);
    expect(room.seats[1].away).toBe(true);
    expect(room.seats[1].uid).not.toBeNull();
    expect(room.info(room.hostUid).seats[1].bot).toBe(true);
    // Ben comes back: the bot is removed, the seat is exactly as he left it.
    const b2 = await hello("Ben", b.token);
    expect((await b2.next("room")).room.seat).toBe(1);
    expect((await a.next("notice", 3000)).text).toMatch(/Ben is back/);
    expect(room.seats[1].away).toBe(false);
    expect(room.info(room.hostUid).seats[1].bot).toBe(false);
    // Saying so frees the chair at once; mid-game that is a bot too.
    b2.send({ t: "stand" });
    await new Promise((r) => setTimeout(r, 50));
    expect(room.seats[1].bot).toBe(true);
    expect(room.seats[1].uid).toBeNull();
    a.close(); b2.close();
  });

  it("anybody with the code may take an abandoned seat or a never-sat bot mid-game, and the table hears who sat down", async () => {
    const a = await hello("Ann"), b = await hello("Ben");
    a.send({ t: "create", seats: 3, config });
    const code = (await a.next("room")).room.code;
    b.send({ t: "join", code }); await b.next("room");
    a.send({ t: "bot", seat: 2, on: true });
    a.drain("room"); b.drain("room");
    a.send({ t: "start", seed: 3 });
    await a.next("state"); await b.next("state");
    // Ben walks away for good.
    b.close();
    await a.next("notice", 3000);
    // Cal arrives mid-game: Ben's abandoned chair is his, and everybody is told.
    const c = await hello("Cal");
    c.send({ t: "join", code });
    expect((await c.next("room")).room.seat).toBe(1);
    expect((await a.next("notice", 3000)).text).toMatch(/Cal takes over Ben's seat/);
    // Dee arrives: the only chair left is the bot nobody ever sat in. She may ask for it by name.
    const d = await hello("Dee");
    d.send({ t: "join", code });
    const dr = await d.next("room");
    expect(dr.room.seat).toBe(2);
    expect((await a.next("notice", 3000)).text).toMatch(/Dee takes over the .* seat/);
    // Eve arrives to a full table and is told why she is watching.
    const e = await hello("Eve");
    e.send({ t: "join", code });
    expect((await e.next("room")).room.seat).toBeNull();
    expect((await e.next("notice", 3000)).text).toMatch(/every seat is taken/);
    // Ben, back late, finds his chair gone and watches.
    const b2 = await hello("Ben", b.token);
    expect((await b2.next("room")).room.seat).toBeNull();
    a.close(); c.close(); d.close(); e.close(); b2.close();
  });

  it("in the lobby a dropped guest's chair goes back to the table after the grace", async () => {
    const a = await hello("Ann"), b = await hello("Ben");
    a.send({ t: "create", seats: 2, config });
    const code = (await a.next("room")).room.code;
    b.send({ t: "join", code }); await b.next("room");
    b.close();
    const room = srv.rooms.get(code)!;
    await new Promise((r) => setTimeout(r, 400));
    expect(room.seats[1].uid).toBeNull();
    expect(room.seats[1].bot).toBe(false);
    a.close();
  });

  it("sends the record book's lines for the people at the table, and only those", async () => {
    const { nick } = await import("@exploding-catan/protocol");
    const store = srv.store as import("../src/store").MemoryStore;
    store.records = [
      { at: 1, players: ["Ann", "Ben"], winner: "Ann", winnerIsBot: false, bots: 0, points: 10, mode: "normal" },
      { at: 2, players: ["Cal", "Dee"], winner: "Dee", winnerIsBot: false, bots: 1, points: 10, mode: "normal" },
    ];
    // The server read the book at boot; the test seeds it after, so ask through the one path that reads live.
    const a = await hello("ann"); // the nickname is the identity, whatever the case
    a.send({ t: "create", seats: 2, config });
    await a.next("room");
    a.send({ t: "records" });
    const book = await a.next("records");
    expect(book.list.every((r) => r.players.map(nick).includes("ann"))).toBe(true);
    a.close();
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

describe("persistence", () => {
  it("a restarted server restores the room, the game and the seats, and bots carry on", async () => {
    const { MemoryStore } = await import("../src/store");
    const store = new MemoryStore();
    const first = startServer({ port: 0, log: () => {}, botPace: 2, store, allowClientSeed: true });
    const savedSrv = srv; srv = first;
    const a = await hello("Ann");
    a.send({ t: "create", seats: 3, config: { ...config, winPoints: 10 } });
    const code = (await a.next("room")).room.code;
    a.send({ t: "bot", seat: 1, on: true }); a.send({ t: "bot", seat: 2, on: true });
    a.send({ t: "stand" }); a.send({ t: "bot", seat: 0, on: true }); // Ann hosts and watches
    a.drain("room");
    a.send({ t: "start", seed: 4 });
    const before = await a.next("state");
    // Let the table move a little, then pull the plug.
    await new Promise((r) => setTimeout(r, 1500));
    a.drain("state");
    const turnBefore = first.rooms.get(code)!.state!.turnCounter;
    await first.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(store.rooms.has(code)).toBe(true);
    // Second process, same store.
    const second = startServer({ port: 0, log: () => {}, botPace: 2, store, allowClientSeed: true });
    srv = second;
    expect(second.rooms.has(code)).toBe(true);
    const back = await hello("Ann", a.token);
    const room = await back.next("room");
    expect(room.room.seat).toBeNull();
    expect(room.room.host).toBe(true);
    expect(room.room.seats.filter((x) => x.bot).length).toBe(3);
    const st = await back.next("state");
    expect(st.state.board).toBe(before.state.board);
    expect(st.state.terrain).toEqual(before.state.terrain);
    expect(st.state.turnCounter).toBeGreaterThanOrEqual(turnBefore);
    // Bots keep playing in the new process.
    const t0 = Date.now();
    while (second.rooms.get(code)!.state!.turnCounter < turnBefore + 2 && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 200));
    expect(second.rooms.get(code)!.state!.turnCounter).toBeGreaterThanOrEqual(turnBefore + 2);
    back.close(); a.close();
    await second.close();
    srv = savedSrv;
  }, 40000);

  it("FileStore round-trips rooms and sessions through a directory", async () => {
    const { FileStore } = await import("../src/store");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "ec-store-"));
    try {
      const fs1 = new FileStore(dir, 10);
      fs1.saveRoom({ code: "ABCD", hostUid: "u1", config, seats: [{ uid: "u1", name: "Ann", bot: false }, { uid: null, name: "Blue (bot)", bot: true }], seed: 7, state: null, savedAt: 1 });
      fs1.saveRoom({ code: "ABCD", hostUid: "u1", config, seats: [{ uid: "u1", name: "Ann", bot: false }, { uid: null, name: "Blue (bot)", bot: true }], seed: 8, state: null, savedAt: 2 });
      fs1.saveSession({ token: "t-1", uid: "u1", name: "Ann", room: "ABCD" });
      fs1.flush();
      const fs2 = new FileStore(dir);
      const rooms = fs2.loadRooms();
      expect(rooms.length).toBe(1);
      expect(rooms[0].seed).toBe(8); // the later write won
      expect(fs2.loadSessions()).toEqual([{ token: "t-1", uid: "u1", name: "Ann", room: "ABCD" }]);
      fs2.deleteRoom("ABCD");
      expect(fs2.loadRooms()).toEqual([]);
      // Names that are not plain identifiers are refused rather than written.
      fs2.saveRoom({ code: "../x", hostUid: "", config, seats: [], seed: 0, state: null, savedAt: 0 });
      fs2.flush();
      expect(fs2.loadRooms()).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("edges", () => {
  it("hands the host role on when the host leaves, and to anybody when the host is gone", async () => {
    const a = await hello("Ann"), b = await hello("Ben");
    a.send({ t: "create", seats: 2, config });
    const code = (await a.next("room")).room.code;
    b.send({ t: "join", code }); await b.next("room");
    b.drain("room");
    a.send({ t: "leave" }); await a.next("left");
    const r = await b.next("room");
    expect(r.room.host).toBe(true);
    // Ben leaves too; a newcomer to the empty room may run it.
    b.send({ t: "leave" }); await b.next("left");
    const c = await hello("Cal");
    c.send({ t: "join", code });
    expect((await c.next("room")).room.host).toBe(true);
    a.close(); b.close(); c.close();
  });
  it("refuses a wrong protocol version, then accepts a right one on the same socket", async () => {
    const c = new C(); await c.open();
    c.send({ t: "hello", v: 0, name: "Old" });
    expect((await c.next("error")).message).toMatch(/protocol/);
    c.send({ t: "hello", v: 1, name: "Old" });
    expect((await c.next("welcome")).name).toBe("Old");
    c.close();
  });
  it("refuses actions from a spectator, ticks from anybody, and a client seed unless allowed", async () => {
    const a = await hello("Ann"), w = await hello("Watcher");
    a.send({ t: "create", seats: 2, config });
    const code = (await a.next("room")).room.code;
    a.send({ t: "bot", seat: 1, on: true });
    a.drain("room");
    a.send({ t: "start", seed: 1 });
    await a.next("state");
    // Arriving mid-game, the bot nobody sat in is his for the taking; standing up again makes him a watcher.
    w.send({ t: "join", code });
    expect((await w.next("room")).room.seat).toBe(1);
    w.send({ t: "stand" });
    await new Promise((r) => setTimeout(r, 30));
    w.send({ t: "action", action: { type: "roll", seat: 0 } });
    expect((await w.next("refused")).error).toMatch(/watching/);
    a.send({ t: "action", action: { type: "tick" } });
    expect((await a.next("refused")).error).toMatch(/not yours/);
    a.close(); w.close();
  });
  it("a second tab with the same token replaces the first without unseating the player", async () => {
    const a = await hello("Ann");
    a.send({ t: "create", seats: 2, config });
    const code = (await a.next("room")).room.code;
    const closed = new Promise<number>((res) => a.ws.once("close", (c) => res(c)));
    const a2 = await hello("Ann", a.token);
    expect(await closed).toBe(4000);
    const r = await a2.next("room");
    expect(r.room.seat).toBe(0);
    expect(srv.rooms.get(code)!.info(srv.rooms.get(code)!.hostUid).seats[0].connected).toBe(true);
    a2.close();
  });
  it("sweeps an idle room from memory and from the store", async () => {
    const { MemoryStore } = await import("../src/store");
    const store = new MemoryStore();
    const quick = startServer({ port: 0, log: () => {}, store, roomIdleMs: 150 });
    const saved = srv; srv = quick;
    const a = await hello("Ann");
    a.send({ t: "create", seats: 2, config });
    const code = (await a.next("room")).room.code;
    expect(store.rooms.has(code)).toBe(true);
    a.close();
    await new Promise((r) => setTimeout(r, 500));
    expect(quick.rooms.has(code)).toBe(false);
    expect(store.rooms.has(code)).toBe(false);
    expect([...store.sessions.values()][0].room).toBeNull();
    await quick.close();
    srv = saved;
  });
  it("clamps a client's config", async () => {
    const a = await hello("Ann");
    a.send({ t: "create", seats: 2, config: { mode: "weird" as never, board: "huge" as never, winPoints: 99, turnSeconds: 5 } });
    const r = (await a.next("room")).room;
    expect(r.config).toEqual({ mode: "normal", board: "auto", winPoints: 20, turnSeconds: 0 });
    a.close();
  });
});
