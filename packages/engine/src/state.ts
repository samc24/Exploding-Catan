/* ══════════════════════════════════════════════════════════════════════
   GAME STATE — creation and the small helpers everything else leans on
   ══════════════════════════════════════════════════════════════════════ */
import {
  BOARD, COST, ENGINE_VERSION, KITTEN, KNIGHT_FLAVOR, LIMIT, LOG_KEEP, MODES, PLAYER_COLORS,
  PLAYER_NAMES, RES, emptyBundle,
} from "./constants";
import { dealTerrain, geometry, placePorts, type Geometry } from "./board";
import { Rng } from "./rng";
import type {
  BoardKey, Building, BuildKind, Bundle, Card, CardKey, FeedKind, GameConfig, GameEvent, GameState,
  Player, Res, TurnRecord,
} from "./types";

/* Everything a rule needs while it runs: the state being mutated (always a
   private copy — see reduce.ts), the board it sits on, the clock as the caller
   reported it, and the events it produces on the way. */
export interface Ctx {
  s: GameState;
  geo: Geometry;
  now: number;
  events: GameEvent[];
  rng: Rng;
}

export class RuleError extends Error {}
export function refuse(msg: string): never {
  throw new RuleError(msg);
}

export function cur(c: Ctx): Player {
  return c.s.players[c.s.cur];
}
export function player(c: Ctx, id: number): Player {
  const p = c.s.players[id];
  if (!p) refuse(`no such seat ${id}`);
  return p;
}

export function log(c: Ctx, text: string): void {
  c.s.log.push(text);
  while (c.s.log.length > LOG_KEEP) c.s.log.shift();
  c.events.push({ type: "log", text });
}
export function feed(c: Ctx, text: string, kind: FeedKind, ms?: number): void {
  c.events.push(ms === undefined ? { type: "feed", text, kind } : { type: "feed", text, kind, ms });
}
export function hint(c: Ctx, seat: number, text: string): void {
  c.events.push({ type: "hint", seat, text });
}

/* ── modes ─────────────────────────────────────────────────────────── */
export function fastStart(c: Ctx): boolean {
  return c.s.mode !== "normal";
}
/** The fast tracks' first round, which is protected: no 7, no Attack, no Exploding Kitten. */
export function openingRound(c: Ctx): boolean {
  return fastStart(c) && !c.s.phase.startsWith("setup") && c.s.turnCounter <= c.s.players.length;
}
export function heldBack(c: Ctx, key: CardKey): boolean {
  return (key === "attack" || key === "explode") && openingRound(c);
}
export function inSetup(c: Ctx): boolean {
  return c.s.phase.startsWith("setup");
}

/* ── resources / bank ──────────────────────────────────────────────── */
export function totalRes(p: Player): number {
  return RES.reduce((s, r) => s + p.res[r], 0);
}
export function freshTurnRecord(): TurnRecord {
  return { edges: [], verts: [], drawn: [], knights: 0, gained: emptyBundle() };
}
/** Record resources flowing to the active player so a Nope can strip them. */
export function noteGain(c: Ctx, p: Player, r: Res, n: number): void {
  if (p.id !== c.s.cur || n <= 0) return;
  c.s.turnRec.gained[r] += n;
}
export function give(c: Ctx, p: Player, r: Res, n: number): number {
  const actual = Math.min(n, c.s.bank[r]);
  p.res[r] += actual;
  c.s.bank[r] -= actual;
  noteGain(c, p, r, actual);
  return actual;
}
export function take(c: Ctx, p: Player, r: Res, n: number): number {
  const actual = Math.min(n, p.res[r]);
  p.res[r] -= actual;
  c.s.bank[r] += actual;
  return actual;
}
export function canAfford(p: Player, cost: Partial<Bundle>): boolean {
  return (Object.keys(cost) as Res[]).every((r) => p.res[r] >= (cost[r] ?? 0));
}
export function pay(c: Ctx, p: Player, cost: Partial<Bundle>): void {
  for (const r of Object.keys(cost) as Res[]) take(c, p, r, cost[r] ?? 0);
}
export function hasBundle(p: Player, b: Bundle): boolean {
  return RES.every((r) => p.res[r] >= b[r]);
}

/* ── victory points / longest road / largest army ─────────────────── */
export function vpCards(p: Player): number {
  return p.cards.filter((c) => c.key === "vp").length;
}
export function publicVP(s: GameState, p: Player): number {
  return (
    p.settlements + p.cities * 2 +
    (s.longestRoad.owner === p.id ? 2 : 0) +
    (s.largestArmy.owner === p.id ? 2 : 0)
  );
}
export function totalVP(s: GameState, p: Player): number {
  return publicVP(s, p) + vpCards(p);
}

/** Longest continuous road. A path may END on an opponent's building but not pass THROUGH it. */
export function longestRoadFor(s: GameState, geo: Geometry, pid: number): number {
  let best = 0;
  const walk = (at: number, used: Set<number>, isStart: boolean): number => {
    const v = geo.vertices[at];
    if (!isStart && s.vOwner[at] !== null && s.vOwner[at] !== pid) return 0;
    let local = 0;
    for (const eid of v.edges) {
      if (s.eOwner[eid] !== pid || used.has(eid)) continue;
      used.add(eid);
      const e = geo.edges[eid];
      const other = e.v[0] === at ? e.v[1] : e.v[0];
      local = Math.max(local, 1 + walk(other, used, false));
      used.delete(eid);
    }
    return local;
  };
  for (const v of geo.vertices) {
    if (!v.edges.some((eid) => s.eOwner[eid] === pid)) continue;
    best = Math.max(best, walk(v.id, new Set(), true));
  }
  return best;
}

export function updateLongestRoad(c: Ctx): void {
  const s = c.s;
  let bestPid = s.longestRoad.owner;
  let bestLen = s.longestRoad.owner === null ? 4 : s.longestRoad.len;
  const lens = s.players.map((p) => longestRoadFor(s, c.geo, p.id));
  // The holder keeps it on ties; a challenger must strictly exceed.
  if (s.longestRoad.owner !== null) {
    bestLen = lens[s.longestRoad.owner];
    bestPid = s.longestRoad.owner;
    if (bestLen < 5) { bestPid = null; bestLen = 4; }
  }
  for (const p of s.players) {
    if (lens[p.id] >= 5 && lens[p.id] > bestLen) { bestLen = lens[p.id]; bestPid = p.id; }
  }
  if (bestPid !== s.longestRoad.owner && bestPid !== null) {
    log(c, `${s.players[bestPid].name} takes Longest Road (${bestLen}).`);
    feed(c, `${s.players[bestPid].name} takes Longest Road (${bestLen})`, "big");
  }
  s.roadLens = lens;
  s.longestRoad = { owner: bestPid, len: bestPid === null ? 0 : lens[bestPid] };
}

export function updateLargestArmy(c: Ctx): void {
  const s = c.s;
  let bestPid = s.largestArmy.owner;
  let bestN = s.largestArmy.owner === null ? 2 : s.players[s.largestArmy.owner].knights;
  // The holder loses the card if a cancelled turn drops them under three.
  if (bestPid !== null && bestN < 3) { bestPid = null; bestN = 2; }
  for (const p of s.players) {
    if (p.knights >= 3 && p.knights > bestN) { bestN = p.knights; bestPid = p.id; }
  }
  if (bestPid !== s.largestArmy.owner && bestPid !== null) {
    log(c, `${s.players[bestPid].name} takes Largest Army (${bestN} knights).`);
    feed(c, `${s.players[bestPid].name} takes Largest Army (${bestN})`, "big");
  }
  s.largestArmy = { owner: bestPid, n: bestN };
}

/* ── build legality ────────────────────────────────────────────────── */
export function canPlaceSettlement(s: GameState, geo: Geometry, vid: number, pid: number, setup: boolean): boolean {
  const v = geo.vertices[vid];
  if (!v || s.vOwner[vid] !== null) return false;
  for (const a of v.adj) if (s.vOwner[a] !== null) return false; // distance rule
  if (setup) return true;
  return v.edges.some((eid) => s.eOwner[eid] === pid); // must touch own road
}
export function canPlaceRoad(s: GameState, geo: Geometry, eid: number, pid: number, setupVertex: number | null): boolean {
  const e = geo.edges[eid];
  if (!e || s.eOwner[eid] !== null) return false;
  if (setupVertex !== null) return e.v.includes(setupVertex);
  return e.v.some((vid) => {
    if (s.vOwner[vid] === pid) return true;
    if (s.vOwner[vid] !== null) return false; // opponent building blocks pass-through
    return geo.vertices[vid].edges.some((x) => s.eOwner[x] === pid);
  });
}
export function canPlaceCity(s: GameState, vid: number, pid: number): boolean {
  return s.vOwner[vid] === pid && s.vType[vid] === "settlement";
}
export function countPieces(p: Player, kind: BuildKind): number {
  return kind === "road" ? p.roads : kind === "settlement" ? p.settlements : p.cities;
}
export function affordable(p: Player, kind: BuildKind): boolean {
  return canAfford(p, COST[kind]) && countPieces(p, kind) < LIMIT[kind];
}

/* ── trade rates ───────────────────────────────────────────────────── */
export function tradeRate(s: GameState, p: Player, r: Res): number {
  let rate = 4;
  s.vport.forEach((port, vid) => {
    if (s.vOwner[vid] !== p.id || !port) return;
    if (port === "3:1") rate = Math.min(rate, 3);
    else if (port === r) rate = Math.min(rate, 2);
  });
  return rate;
}

/** How many kitten cards a pool of resources buys: three DIFFERENT types each,
    spending one from each of the three deepest piles until it cannot. */
export function cardsFromPool(pool: Bundle): { cards: number; spent: Bundle; left: Bundle } {
  const left: Bundle = { ...pool };
  let n = 0;
  for (;;) {
    const have = RES.filter((r) => left[r] > 0).sort((a, b) => left[b] - left[a]);
    if (have.length < 3) break;
    left[have[0]]--; left[have[1]]--; left[have[2]]--;
    n++;
  }
  const spent = emptyBundle();
  for (const r of RES) spent[r] = pool[r] - left[r];
  return { cards: n, spent, left };
}

/* ── cards ─────────────────────────────────────────────────────────── */
export function findCard(p: Player, id: number): Card | undefined {
  return p.cards.find((c) => c.id === id);
}
export function removeCardById(p: Player, id: number): Card | null {
  const i = p.cards.findIndex((c) => c.id === id);
  return i < 0 ? null : p.cards.splice(i, 1)[0];
}
export function holds(p: Player, key: CardKey): boolean {
  return p.cards.some((c) => c.key === key);
}
/** Take one card of a kind out of a hand and onto the discard. Returns it. */
export function spendCard(c: Ctx, p: Player, key: CardKey): Card | null {
  const i = p.cards.findIndex((x) => x.key === key);
  if (i < 0) return null;
  const card = p.cards.splice(i, 1)[0];
  c.s.discard.push(card);
  return card;
}

/* ── setup ─────────────────────────────────────────────────────────── */
export function buildSetupOrder(n: number, start: number): number[] {
  const fwd: number[] = [];
  for (let i = 0; i < n; i++) fwd.push((start + i) % n);
  return fwd.concat(fwd.slice().reverse()); // snake order from the first player
}

export function boardFor(numPlayers: number, boardKey: BoardKey | undefined): BoardKey {
  if (boardKey === "small" || boardKey === "large") return boardKey;
  return numPlayers >= 5 ? "large" : "small";
}

export function createGame(cfg: GameConfig, seed: number): GameState {
  const n = cfg.players.length;
  if (n < 2 || n > 6) throw new RuleError("2 to 6 players");
  const rng = new Rng(seed);
  const boardKey = boardFor(n, cfg.board);
  const geo = geometry(boardKey);
  const set = BOARD[boardKey];
  const { terrain, numbers } = dealTerrain(geo, rng);
  const { vport, eport } = placePorts(geo, rng);

  const deck: Card[] = [];
  let knightN = 0;
  for (const key of Object.keys(KITTEN) as CardKey[]) {
    for (let i = 0; i < KITTEN[key].count; i++) {
      const c: Card = { key, id: deck.length, flavor: null, boughtTurn: -2 };
      if (key === "knight") c.flavor = KNIGHT_FLAVOR[Math.floor(knightN++ / 2)];
      deck.push(c);
    }
  }
  rng.shuffle(deck);

  const players: Player[] = cfg.players.map((p, i) => ({
    id: i,
    name: p.name || PLAYER_NAMES[i],
    color: PLAYER_COLORS[i],
    avatar: p.avatar ?? "",
    res: emptyBundle(),
    cards: [],
    knights: 0, skipTokens: 0, roads: 0, settlements: 0, cities: 0,
  }));

  const desert = terrain.indexOf("desert");
  const first = rng.int(n);
  const bank = emptyBundle();
  for (const r of RES) bank[r] = set.bank;
  const mode = MODES[cfg.mode] ? cfg.mode : "normal";
  const ts = Number(cfg.turnSeconds ?? 0);

  const s: GameState = {
    version: ENGINE_VERSION,
    seed, rng: rng.state,
    mode, board: boardKey,
    winPoints: Math.min(20, Math.max(3, Number(cfg.winPoints) || 10)),
    turnSeconds: Number.isInteger(ts) && ts >= 20 && ts <= 100 ? ts : 0,
    implodeRevealMs: Math.max(0, cfg.implodeRevealMs ?? 0),
    players, terrain, numbers, vport, eport,
    vOwner: geo.vertices.map(() => null),
    vType: geo.vertices.map(() => null),
    eOwner: geo.edges.map(() => null),
    deck, discard: [], bank,
    robber: desert,
    cur: first, dir: 1, turnCounter: 0, firstPlayer: first,
    phase: "setup1", setupNeed: "settlement", setupLastVertex: null,
    setupOrder: buildSetupOrder(n, first), setupIdx: 0, roadsOwed: null,
    rolled: null, rollId: 0, extraTurn: false,
    roadLens: players.map(() => 0),
    longestRoad: { owner: null, len: 0 },
    largestArmy: { owner: null, n: 0 },
    handoverUntil: 0, handoverTurn: -1,
    seven: null, attackDue: [], robberDue: [],
    select: { kind: "settlement", setup: true },
    forcedNope: null, playing: null, trade: null,
    pile: [], diceLog: [],
    turnRec: freshTurnRecord(),
    turnTimerUntil: 0, turnTickAt: 0,
    journal: [], journalId: 0,
    revealed: false, sweeping: false,
    implodeTurn: -1, implodeBy: null, implodeUntil: 0, implodeFrom: 0,
    rewinds: 0, log: [], winner: null,
  };

  if (s.mode === "fastplus") dealOpeningKittens(s, rng);
  s.rng = rng.state;
  s.log.push(`New game — ${n} players. Deck: 54 kitten cards.`);
  if (s.mode !== "normal") s.log.push(`${MODES[s.mode].name} — ${MODES[s.mode].blurb}`);
  s.log.push(`${players[first].name} goes first.`);
  s.log.push("Setup: place your first settlement.");
  return s;
}

/* Fast track + opens every hand with one kitten card: EXTRA copies run off for
   the occasion, drawn against the deck's own distribution minus the Imploding
   Kitten. boughtTurn is -1: always there, so playable from the first turn. */
function dealOpeningKittens(s: GameState, rng: Rng): void {
  const pool: CardKey[] = [];
  for (const key of Object.keys(KITTEN) as CardKey[]) {
    if (key === "implode") continue;
    for (let i = 0; i < KITTEN[key].count; i++) pool.push(key);
  }
  let extraId = 10000;
  for (const p of s.players) {
    const key = rng.pick(pool);
    const c: Card = { key, id: extraId++, flavor: null, boughtTurn: -1 };
    if (key === "knight") c.flavor = rng.pick(KNIGHT_FLAVOR);
    p.cards.push(c);
  }
  s.log.push("Fast track + — everybody opens holding one kitten card.");
}

export function buildingAt(s: GameState, vid: number): Building | null {
  return s.vType[vid];
}
