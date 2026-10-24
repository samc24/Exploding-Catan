/* The one place the game state lives in the browser. Everything the UI does
   goes through dispatch(); everything it shows comes from get(). */
import {
  applyAction, createGame, type Action, type GameConfig, type GameEvent, type GameState,
} from "@exploding-catan/engine";

export type Listener = (s: GameState, events: GameEvent[], action: Action | null) => void;

const SAVE_KEY = "exploding-catan:game";

class Store {
  private s: GameState | null = null;
  private listeners: Listener[] = [];
  lastError: string | null = null;
  /** Online: actions go to the server instead of the engine, and states come back from it. */
  remote: ((a: Action) => void) | null = null;

  get(): GameState | null { return this.s; }
  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }
  newGame(cfg: GameConfig, seed = (Math.random() * 2 ** 32) >>> 0): void {
    this.s = createGame(cfg, seed);
    this.save();
    this.emit([], null);
  }
  /** Apply an action. Returns the error text when the engine refused it. */
  dispatch(a: Action, now = Date.now()): string | null {
    if (this.remote) { this.remote(a); return null; }
    if (!this.s) return "no game";
    const r = applyAction(this.s, a, now);
    if (!r.ok) { this.lastError = r.error; return r.error; }
    this.lastError = null;
    this.s = r.state;
    if (a.type !== "tick" || r.events.length) this.save();
    this.emit(r.events, a);
    return null;
  }
  end(): void { this.s = null; try { localStorage.removeItem(SAVE_KEY); } catch { /* fine */ } this.emit([], null); }
  /** A state handed to us by the server. */
  receive(s: GameState, events: GameEvent[]): void { this.s = s; this.emit(events, null); }
  /** Only the clocks moved. Patched in place and announced as a tick, so the screen repaints just them. */
  patchClock(p: { turnTimerUntil: number; turnTickAt: number; implodeUntil: number; implodeFrom: number }): void {
    if (!this.s) return;
    this.s = { ...this.s, ...p };
    this.emit([], { type: "tick" });
  }
  /** Leaving a room: forget its state without touching the saved local game. */
  clear(): void { this.s = null; this.emit([], null); }
  restore(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw) as GameState;
      if (!s || !Array.isArray(s.players)) return false;
      this.s = s;
      return true;
    } catch { return false; }
  }
  private save(): void {
    if (this.remote) return;
    try { if (this.s) localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* storage may be unavailable */ }
  }
  private emit(events: GameEvent[], a: Action | null): void {
    for (const fn of this.listeners) fn(this.s!, events, a);
  }
}
export const store = new Store();
