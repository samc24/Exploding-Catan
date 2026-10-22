/* ══════════════════════════════════════════════════════════════════════
   PERSISTENCE — rooms and sessions outlive the process
   ══════════════════════════════════════════════════════════════════════
   The server writes every room after every change and every session when
   it is made, and reads them all back on boot. A deploy or a crash in the
   middle of a game then costs the players a reconnect, not the game.

   The interface is the swap point. FileStore keeps one JSON file per
   record in a directory (a volume, on any host); anything else — SQLite,
   Redis, a KV — is a second class that implements the same five methods.
   ══════════════════════════════════════════════════════════════════════ */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "@exploding-catan/engine";
import type { RoomConfig } from "@exploding-catan/protocol";

export interface SeatRecord { uid: string | null; name: string | null; bot: boolean }
export interface RoomSnapshot {
  code: string;
  hostUid: string;
  config: RoomConfig;
  seats: SeatRecord[];
  seed: number;
  state: GameState | null;
  /** The uids who were in the room, so they can find their way back. */
  members: string[];
  savedAt: number;
}
export interface SessionRecord { token: string; uid: string; name: string; room: string | null }

export interface RoomStore {
  loadRooms(): RoomSnapshot[];
  saveRoom(snap: RoomSnapshot): void;
  deleteRoom(code: string): void;
  loadSessions(): SessionRecord[];
  saveSession(rec: SessionRecord): void;
  /** Write anything still pending. Called on shutdown. */
  flush(): void;
}

/** Nothing survives the process. For tests, and for running without a disk. */
export class MemoryStore implements RoomStore {
  rooms = new Map<string, RoomSnapshot>();
  sessions = new Map<string, SessionRecord>();
  loadRooms(): RoomSnapshot[] { return [...this.rooms.values()].map((r) => structuredClone(r)); }
  saveRoom(snap: RoomSnapshot): void { this.rooms.set(snap.code, structuredClone(snap)); }
  deleteRoom(code: string): void { this.rooms.delete(code); }
  loadSessions(): SessionRecord[] { return [...this.sessions.values()].map((s) => ({ ...s })); }
  saveSession(rec: SessionRecord): void { this.sessions.set(rec.token, { ...rec }); }
  flush(): void { /* nothing pending */ }
}

/** One JSON file per room and per session, written atomically, coalesced so
    a turn timer ticking four times a second does not write four times a second. */
export class FileStore implements RoomStore {
  private pending = new Map<string, () => void>();
  private timer: NodeJS.Timeout | null = null;
  constructor(readonly dir: string, readonly debounceMs = 400) {
    mkdirSync(join(dir, "rooms"), { recursive: true });
    mkdirSync(join(dir, "sessions"), { recursive: true });
  }
  loadRooms(): RoomSnapshot[] { return this.readAll<RoomSnapshot>("rooms"); }
  saveRoom(snap: RoomSnapshot): void { this.later("rooms/" + snap.code, () => this.write("rooms", snap.code, snap)); }
  deleteRoom(code: string): void {
    this.pending.delete("rooms/" + code);
    const f = join(this.dir, "rooms", code + ".json");
    if (existsSync(f)) unlinkSync(f);
  }
  loadSessions(): SessionRecord[] { return this.readAll<SessionRecord>("sessions"); }
  saveSession(rec: SessionRecord): void { this.later("sessions/" + rec.token, () => this.write("sessions", rec.token, rec)); }
  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const jobs = [...this.pending.values()];
    this.pending.clear();
    for (const job of jobs) job();
  }
  private later(key: string, job: () => void): void {
    this.pending.set(key, job);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }
  private write(kind: string, name: string, data: unknown): void {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return;
    const f = join(this.dir, kind, name + ".json");
    const tmp = f + ".tmp";
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, f);
  }
  private readAll<T>(kind: string): T[] {
    const out: T[] = [];
    for (const f of readdirSync(join(this.dir, kind))) {
      if (!f.endsWith(".json")) continue;
      try { out.push(JSON.parse(readFileSync(join(this.dir, kind, f), "utf8")) as T); }
      catch (err) { console.warn(`could not read ${kind}/${f}: ${err instanceof Error ? err.message : err}`); }
    }
    return out;
  }
}
