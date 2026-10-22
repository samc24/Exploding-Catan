/* ══════════════════════════════════════════════════════════════════════
   ACTION JOURNAL
   ══════════════════════════════════════════════════════════════════════
   Nothing waits for permission. Every action resolves at once and is
   recorded here with a snapshot of the state immediately before it. A
   Nope played later rewinds to that snapshot, which is what lets a player
   answer without first announcing that they hold the card.
   ══════════════════════════════════════════════════════════════════════ */
import { HANDOVER_MS, JOURNAL_KEEP, NOPE_REACH, PILE_KEEP, TARGETED } from "./constants";
import type { Geometry } from "./board";
import { holds, refuse, type Ctx } from "./state";
import {
  isSnapshot, type Card, type CardKey, type CardPayload, type CardPlay, type EntryKind, type GameState,
  type JournalEntry, type ShowKind, type Snapshot, type SnapshotOrRedacted, type TurnPointer,
} from "./types";

export function snapAll(s: GameState): Snapshot {
  return {
    res: s.players.map((p) => ({ ...p.res })),
    bank: { ...s.bank },
    hands: s.players.map((p) => p.cards.map((c) => ({ ...c }))),
    knights: s.players.map((p) => p.knights),
    skips: s.players.map((p) => p.skipTokens),
    roads: s.players.map((p) => p.roads),
    setts: s.players.map((p) => p.settlements),
    cities: s.players.map((p) => p.cities),
    vOwner: s.vOwner.slice(),
    vType: s.vType.slice(),
    eOwner: s.eOwner.slice(),
    numbers: s.numbers.slice(),
    robber: s.robber,
    dir: s.dir,
    extra: s.extraTurn,
    rolled: s.rolled ? [s.rolled[0], s.rolled[1]] : null,
    deck: s.deck.map((c) => ({ ...c })),
    discard: s.discard.map((c) => ({ ...c })),
    lr: { ...s.longestRoad },
    la: { ...s.largestArmy },
    roadLens: s.roadLens.slice(),
    implodeTurn: s.implodeTurn,
    seven: s.seven ? { actor: s.seven.actor, jid: s.seven.jid, queue: s.seven.queue.slice() } : null,
    robberDue: s.robberDue.map((m) => ({ ...m })),
    attackDue: s.attackDue.map((m) => ({ ...m })),
    rec: {
      edges: s.turnRec.edges.slice(),
      verts: s.turnRec.verts.map((v) => ({ ...v })),
      drawn: s.turnRec.drawn.slice(),
      knights: s.turnRec.knights,
      gained: { ...s.turnRec.gained },
    },
  };
}

/** Put the board back. The snapshots carry the board, not the clock: whose
    turn it is and what phase is NOT restored here. */
export function restoreAll(s: GameState, snap: SnapshotOrRedacted | null): void {
  if (!isSnapshot(snap)) refuse("a redacted view cannot be rewound");
  const x = snap;
  s.players.forEach((p, i) => {
    p.res = { ...x.res[i] };
    p.cards = x.hands[i].map((c) => ({ ...c }));
    p.knights = x.knights[i];
    p.skipTokens = x.skips[i];
    p.roads = x.roads[i];
    p.settlements = x.setts[i];
    p.cities = x.cities[i];
  });
  s.bank = { ...x.bank };
  s.vOwner = x.vOwner.slice();
  s.vType = x.vType.slice();
  s.eOwner = x.eOwner.slice();
  s.numbers = x.numbers.slice();
  s.robber = x.robber;
  s.dir = x.dir;
  s.extraTurn = x.extra;
  s.rolled = x.rolled ? [x.rolled[0], x.rolled[1]] : null;
  s.deck = x.deck.map((c) => ({ ...c }));
  s.discard = x.discard.map((c) => ({ ...c }));
  s.longestRoad = { ...x.lr };
  s.largestArmy = { ...x.la };
  s.roadLens = x.roadLens.slice();
  s.implodeTurn = x.implodeTurn;
  s.seven = x.seven ? { actor: x.seven.actor, jid: x.seven.jid, queue: x.seven.queue.slice() } : null;
  s.robberDue = x.robberDue.map((m) => ({ ...m }));
  s.attackDue = x.attackDue.map((m) => ({ ...m }));
  s.turnRec = {
    edges: x.rec.edges.slice(),
    verts: x.rec.verts.map((v) => ({ ...v })),
    drawn: x.rec.drawn.slice(),
    knights: x.rec.knights,
    gained: { ...x.rec.gained },
  };
}

export interface LogOpts {
  actor?: number;
  target?: number | null;
  card?: Card | null;
  payload?: CardPayload | null;
  snap?: SnapshotOrRedacted | null;
  turnBack?: TurnPointer | null;
  spent?: { pid: number; key: CardKey; id: number | null } | null;
  redo?: CardPlay | null;
  cardOwner?: number | null;
  participants?: number[] | null;
  noDefuse?: boolean;
  show?: ShowKind | null;
  undid?: { text: string; actor: number; kind: EntryKind } | null;
  turnSafe?: boolean;
  wonBy?: number | null;
  notice?: boolean;
  nopeable?: boolean;
  /** A card to put on the pile that is not this entry's own: the Imploding Kitten. */
  pileCard?: Card | null;
  ms?: number;
  /** Also write the line, with a full stop, to the detailed log. */
  log?: boolean;
}

/** Record an action and announce it. Returns the entry. */
export function logAction(c: Ctx, text: string, kind: EntryKind, opts: LogOpts = {}): JournalEntry {
  const s = c.s;
  const e: JournalEntry = {
    id: ++s.journalId,
    turn: s.turnCounter,
    actor: opts.actor === undefined ? s.cur : opts.actor,
    target: opts.target === undefined ? null : opts.target,
    kind,
    text,
    card: opts.card ? { ...opts.card } : null,
    payload: opts.payload ?? null,
    snap: opts.snap ?? null,
    turnBack: opts.turnBack ?? null,
    spent: opts.spent ?? null,
    redo: opts.redo ?? null,
    cardOwner: opts.cardOwner === undefined ? null : opts.cardOwner,
    participants: opts.participants ? opts.participants.slice() : null,
    noDefuse: !!opts.noDefuse,
    show: opts.show ?? null,
    undid: opts.undid ?? null,
    turnSafe: !!opts.turnSafe,
    wonBy: opts.wonBy === undefined ? null : opts.wonBy,
    notice: !!opts.notice,
    nopeable: opts.nopeable !== false,
    noped: false,
  };
  s.journal.push(e);
  pileAdd(s, e, opts.pileCard ?? null);
  while (s.journal.length > JOURNAL_KEEP) s.journal.shift();
  trimSnapshots(s);
  if (opts.log) { s.log.push(text + "."); }
  c.events.push(opts.ms === undefined ? { type: "feed", text, kind, jid: e.id } : { type: "feed", text, kind, jid: e.id, ms: opts.ms });
  if (e.show) c.events.push({ type: "show", what: e.show, pid: e.actor, jid: e.id });
  return e;
}

/* A snapshot is only ever read while its entry can still be answered, or
   while its turn can still be cancelled: the turn in progress, the one that
   just handed over, and one more for a counter-Nope that hands a turn back.
   Older snapshots are dead weight — a full copy of the board each — and
   every action clones the whole state, so they are dropped here. */
export function trimSnapshots(s: GameState): void {
  const keepFrom = s.turnCounter - 2;
  for (const e of s.journal) if (e.snap && e.turn < keepFrom) e.snap = null;
}

/* ── the discard pile ──────────────────────────────────────────────── */
/* Every kitten card that has been played, in order. Kept as a record of its
   own rather than read off the journal, because the journal is trimmed. */
function pileAdd(s: GameState, e: JournalEntry, extra: Card | null): void {
  const card = extra ?? (e.card && !e.card.synthetic ? e.card : null) ?? null;
  const spent = e.spent && e.spent.id !== null ? findSpent(s, e.spent.id) : null;
  const put = spent ?? card;
  if (!put) return;
  s.pile.push({ jid: e.id, card: { ...put }, cancelled: false });
  while (s.pile.length > PILE_KEEP) s.pile.shift();
}
function findSpent(s: GameState, id: number): Card | null {
  for (let i = s.discard.length - 1; i >= 0; i--) if (s.discard[i].id === id) return s.discard[i];
  return null;
}
export function pileCancel(s: GameState, jid: number): void {
  for (const p of s.pile) if (p.jid === jid) p.cancelled = true;
}
export function pileDrop(s: GameState, jids: number[]): void {
  if (!jids.length) return;
  const gone = new Set(jids);
  s.pile = s.pile.filter((p) => !gone.has(p.jid));
}

/* ── windows ───────────────────────────────────────────────────────── */
export function handoverActive(s: GameState, now: number): boolean {
  return !!(s.handoverUntil && now < s.handoverUntil);
}
export function beginHandover(c: Ctx, endedTurn: number): void {
  if (c.s.phase === "over") return;
  c.s.handoverTurn = endedTurn;
  c.s.handoverUntil = c.now + HANDOVER_MS;
}
export function implodeActive(s: GameState): boolean {
  return s.implodeTurn === s.turnCounter;
}
/** The card is still landing: nobody may act, and the clock has not started. */
export function implodeRevealing(s: GameState, now: number): boolean {
  return implodeActive(s) && !!s.implodeFrom && now < s.implodeFrom;
}

/** The newest entry still open to an answer. */
export function openEntry(s: GameState, now: number): JournalEntry | null {
  if (!s.journal.length) return null;
  const e = s.journal[s.journal.length - 1];
  return canNopeEntry(s, e, now) ? e : null;
}
/** Every entry currently answerable, newest first. */
export function openEntries(s: GameState, now: number): JournalEntry[] {
  return s.journal.slice(-NOPE_REACH).filter((e) => canNopeEntry(s, e, now)).reverse();
}
export function entryById(s: GameState, jid: number): JournalEntry | undefined {
  return s.journal.find((e) => e.id === jid);
}

/** May this entry still be answered? Any of the last NOPE_REACH lines, from
    the turn in progress or the one that just handed over. */
export function canNopeEntry(s: GameState, e: JournalEntry | null | undefined, now: number): boolean {
  if (!e || e.noped || !e.nopeable || !e.snap) return false;
  if (s.phase === "over" || s.phase.startsWith("setup")) return false;
  if (e.turn !== s.turnCounter && !(handoverActive(s, now) && e.turn === s.handoverTurn)) return false;
  const idx = s.journal.findIndex((x) => x.id === e.id);
  if (idx < 0) return false;
  if (idx < s.journal.length - NOPE_REACH) return false;
  // An Imploding Kitten seals its own turn for good, not just while it lasts.
  if (e.turn === s.implodeTurn && e.actor === s.implodeBy) return false;
  return true;
}

/** May this player play a Nope AT ALL just now? While somebody is being forced
    to spend one on a win, nobody else may. */
export function canNopeNow(s: GameState, pid: number): boolean {
  if (!s.forcedNope) return true;
  if (s.phase === "over") return true;
  const f = s.players[s.forcedNope.pid];
  if (!f || !holds(f, "nope")) return true;
  return s.forcedNope.pid === pid;
}

/** May THIS player Nope this entry? Not your own line — except a roll, where a
    Nope is a reroll. Never one that would hand somebody else the game. */
export function canNopeFor(s: GameState, e: JournalEntry, pid: number, now: number): boolean {
  if (!canNopeEntry(s, e, now)) return false;
  if (!canNopeNow(s, pid)) return false;
  if (e.wonBy !== null && e.wonBy !== pid) return false;
  return e.kind === "roll" || e.actor !== pid;
}

/** Is there a turn going that this player could cancel outright? */
export function canNopeTurnNow(s: GameState, me: number): boolean {
  if (s.phase === "over" || s.phase.startsWith("setup")) return false;
  if (!canNopeNow(s, me)) return false;
  return s.cur !== me && !implodeActive(s);
}

export function isRobberEntry(e: JournalEntry | null | undefined): boolean {
  return !!(e && e.payload && e.payload.robber);
}
export function settledOnRobbedHex(s: GameState, geo: Geometry, e: JournalEntry, pid: number): boolean {
  if (!isRobberEntry(e) || e.payload?.hex === undefined) return false;
  const hx = geo.hexes[e.payload.hex];
  if (!hx) return false;
  return hx.verts.some((v) => s.vOwner[v] === pid);
}

/** Did this land on YOU? */
export function aimedAtMe(s: GameState, geo: Geometry, e: JournalEntry, me: number): boolean {
  if (isRobberEntry(e)) return e.actor !== me && settledOnRobbedHex(s, geo, e, me);
  if (!e.card) return false;
  if (e.actor === me) return false;
  return TARGETED.has(e.card.key) && e.target === me;
}

/** Does a Nope answer this entry by cancelling the CARD rather than by taking
    somebody's turn? A roll is thrown again, a reaction is taken back, and a
    card that landed on you while there is no turn of theirs to take is simply
    cancelled. */
export function nopeCancelsCard(s: GameState, geo: Geometry, e: JournalEntry | undefined, me: number, now: number): boolean {
  if (!e || !canNopeFor(s, e, me, now)) return false;
  if (e.kind === "roll" || e.kind === "defend") return true;
  if (canNopeTurnNow(s, me) && e.actor === s.cur) return false;
  return aimedAtMe(s, geo, e, me);
}

export function owesSevenCut(s: GameState, pid: number): boolean {
  return !!(s.seven && s.seven.queue.indexOf(pid) >= 0);
}

/** A Defuse only answers an attack that landed on you, and never another Defuse. */
export function canDefuseEntry(s: GameState, geo: Geometry, e: JournalEntry | undefined, pid: number, now: number): boolean {
  if (!e || !canNopeEntry(s, e, now)) return false;
  if (e.kind === "roll") return e.show === "seven" && owesSevenCut(s, pid);
  if (isRobberEntry(e))
    return !e.noDefuse && !e.answered && e.actor !== pid && settledOnRobbedHex(s, geo, e, pid);
  if (!e.card) return false;
  if (e.actor === pid) return false;
  if (e.card.key === "alter") {
    if (e.participants && e.participants.includes(pid)) return false;
    return (e.payload?.hexes ?? []).some((hid) => geo.hexes[hid].verts.some((v) => s.vOwner[v] === pid));
  }
  return TARGETED.has(e.card.key) && e.target === pid;
}

/* ── where the turn began ──────────────────────────────────────────── */
/** Where this turn was standing before it started. Anything un-Nopeable (the
    Imploding Kitten) draws a line under itself and moves the mark forward. */
export function turnStartSnap(s: GameState): Snapshot | null {
  let snap: Snapshot | null = null;
  for (const e of s.journal) {
    if (e.turn !== s.turnCounter) continue;
    if (e.notice) continue;
    if (e.nopeable === false) { snap = null; continue; }
    if (!snap && isSnapshot(e.snap)) snap = e.snap;
  }
  return snap;
}
/** The top of the turn, with no line drawn under anything. */
export function turnOpenSnap(s: GameState): Snapshot | null {
  for (const e of s.journal) {
    if (e.turn !== s.turnCounter) continue;
    if (e.notice) continue;
    if (isSnapshot(e.snap)) return e.snap;
  }
  return null;
}
/** Seats whose resources this turn is NOT responsible for: somebody else threw a card during it. */
export function notThisTurnsDoing(s: GameState, ownerId: number): Record<number, 1> {
  const out: Record<number, 1> = {};
  for (const e of s.journal) {
    if (e.turn !== s.turnCounter) continue;
    if (e.actor === ownerId) continue;
    if (e.target === null || e.target === undefined) continue;
    out[e.actor] = 1;
    out[e.target] = 1;
  }
  return out;
}

