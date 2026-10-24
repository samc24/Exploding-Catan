/* ══════════════════════════════════════════════════════════════════════
   EXPLODING CATAN — ENGINE TYPES
   ══════════════════════════════════════════════════════════════════════
   Everything here is plain data. A GameState can be JSON round-tripped,
   diffed, stored, sent over a wire and replayed: there is no object
   identity anywhere in it, cards are found by id, and the board's shape is
   derived from `board` rather than stored.
   ══════════════════════════════════════════════════════════════════════ */

export type Res = "wood" | "brick" | "sheep" | "wheat" | "ore";
export type Terrain = Res | "desert";
export type Bundle = Record<Res, number>;
export type Port = Res | "3:1";

export type CardKey =
  | "hidden"
  | "implode"
  | "vp"
  | "skip"
  | "nope"
  | "explode"
  | "defuse"
  | "alter"
  | "attack"
  | "favor"
  | "reverse"
  | "knight";

export type CardKind = "auto" | "vp" | "target" | "response" | "board" | "self" | "knight";

export interface Card {
  id: number;
  key: CardKey;
  flavor: string | null;
  /** Turn the card was bought on. -1 = dealt at setup, -2 = still in the deck. */
  boughtTurn: number;
  /** A card conjured by a Defuse to reflect another; it never sat in a hand. */
  synthetic?: boolean;
}

export type Mode = "normal" | "fast" | "fastplus";
export type BoardKey = "small" | "large";
export type Phase = "setup1" | "setup2" | "setup3" | "roll" | "main" | "over";
export type BuildKind = "road" | "settlement" | "city";
export type Building = "settlement" | "city";

export interface Player {
  id: number;
  name: string;
  color: string;
  avatar: string;
  res: Bundle;
  cards: Card[];
  knights: number;
  skipTokens: number;
  roads: number;
  settlements: number;
  cities: number;
}

export interface TurnRecord {
  edges: number[];
  verts: { vid: number; prevType: Building | null }[];
  drawn: number[]; // card ids drawn this turn
  knights: number;
  gained: Bundle;
}

/** A robber move in progress, or waiting behind one. */
export interface RobberMove {
  actor: number;
  knight: boolean;
  noDefuse: boolean;
  credit?: number;
  fromHex?: number;
  victim?: number;
  stole?: Res;
}

export type AlterPurpose = { kind: "play"; cardId: number } | { kind: "defuse" };

export type Select =
  | { kind: "settlement" }
  | { kind: "road"; fromVertex: number }
  | ({ kind: "robber" } & RobberMove)
  | { kind: "victim"; actor: number; candidates: number[]; move: RobberMove }
  | { kind: "alter"; actor: number; first: number | null; purpose: AlterPurpose }
  | { kind: "seat"; actor: number; cardId: number; key: CardKey }
  | { kind: "favor"; actor: number; target: number; cardId: number | null; synthetic: boolean };

export type TradeReply = "wait" | "yes" | "no" | "cant";
export interface TradeOffer {
  from: number;
  offer: Bundle;
  want: Bundle;
  replies: Record<number, TradeReply>;
  /** The clock when it was put on the table, so a bot can give up waiting. */
  since: number;
}

/** Everything a rewind has to put back. Taken before each recorded action. */
export interface Snapshot {
  res: Bundle[];
  bank: Bundle;
  hands: Card[][];
  knights: number[];
  skips: number[];
  roads: number[];
  setts: number[];
  cities: number[];
  vOwner: (number | null)[];
  vType: (Building | null)[];
  eOwner: (number | null)[];
  numbers: (number | null)[];
  robber: number;
  dir: 1 | -1;
  extra: boolean;
  rolled: [number, number] | null;
  deck: Card[];
  discard: Card[];
  lr: { owner: number | null; len: number };
  la: { owner: number | null; n: number };
  roadLens: number[];
  implodeTurn: number;
  seven: SevenState | null;
  robberDue: RobberMove[];
  attackDue: AttackDue[];
  rec: TurnRecord;
}
/** What a snapshot looks like from another seat: present, so the line is still
    open to an answer, but holding nothing a rewind could use. */
export interface RedactedSnapshot { redacted: true }
export type SnapshotOrRedacted = Snapshot | RedactedSnapshot;
export function isSnapshot(x: SnapshotOrRedacted | null | undefined): x is Snapshot {
  return !!x && !("redacted" in x);
}

export interface SevenState {
  actor: number;
  jid: number;
  queue: number[];
}
export interface AttackDue {
  pid: number;
  n: number;
  jid: number | null;
}

export type EntryKind = "roll" | "buy" | "attack" | "info" | "defend" | "big";
export type ShowKind =
  | CardKey
  | "seven"
  | "nope"
  | "defuse"
  | "win"
  | "winnoped"
  | "timeout"
  | "implode"
  | "robbery";

export interface TurnPointer {
  cur: number;
  phase: Phase;
  turnCounter: number;
  rolled: [number, number] | null;
  extraTurn: boolean;
}

export interface CardPlay {
  card: Card;
  actor: number;
  target: number | null;
  payload: CardPayload;
}
export interface CardPayload {
  hexes?: [number, number];
  want?: Bundle;
  robber?: boolean;
  hex?: number;
  sum?: number;
}

export interface JournalEntry {
  id: number;
  turn: number;
  actor: number;
  target: number | null;
  kind: EntryKind;
  text: string;
  card: Card | null;
  payload: CardPayload | null;
  snap: SnapshotOrRedacted | null;
  turnBack: TurnPointer | null;
  spent: { pid: number; key: CardKey; id: number | null } | null;
  redo: CardPlay | null;
  cardOwner: number | null;
  participants: number[] | null;
  noDefuse: boolean;
  show: ShowKind | null;
  undid: { text: string; actor: number; kind: EntryKind } | null;
  turnSafe: boolean;
  wonBy: number | null;
  notice: boolean;
  nopeable: boolean;
  noped: boolean;
  /** A robbery that has been Defused by somebody on the hex. */
  answered?: boolean;
  /** The robbery this Defuse answered, so a Noped Defuse can reopen it. */
  unanswers?: number;
  /** Robbery details that never travel to other seats. */
  stolen?: Res | null;
  fromHex?: number;
}

export interface PileEntry {
  jid: number;
  card: Card;
  cancelled: boolean;
}

export interface GameConfig {
  players: { name: string; avatar?: string }[];
  mode: Mode;
  board?: BoardKey;
  winPoints?: number;
  /** 0 disables the clock; otherwise 20–100 seconds. */
  turnSeconds?: number;
  /** How long the Imploding Kitten's reveal owns the screen before its clock starts. */
  implodeRevealMs?: number;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  mode: Mode;
  board: BoardKey;
  winPoints: number;
  turnSeconds: number;
  implodeRevealMs: number;

  players: Player[];
  terrain: Terrain[];
  numbers: (number | null)[];
  vport: (Port | null)[];
  eport: (Port | null)[];
  vOwner: (number | null)[];
  vType: (Building | null)[];
  eOwner: (number | null)[];

  deck: Card[];
  discard: Card[];
  bank: Bundle;
  robber: number;
  cur: number;
  dir: 1 | -1;
  turnCounter: number;
  firstPlayer: number;
  phase: Phase;
  setupOrder: number[];
  setupIdx: number;
  roadsOwed: number[] | null;
  rolled: [number, number] | null;
  extraTurn: boolean;
  roadLens: number[];
  longestRoad: { owner: number | null; len: number };
  largestArmy: { owner: number | null; n: number };
  handoverUntil: number;
  handoverTurn: number;
  seven: SevenState | null;
  attackDue: AttackDue[];
  robberDue: RobberMove[];
  select: Select | null;
  forcedNope: { pid: number; winner: number } | null;
  trade: TradeOffer | null;
  pile: PileEntry[];
  diceLog: number[];
  turnRec: TurnRecord;
  turnTimerUntil: number;
  turnTickAt: number;
  journal: JournalEntry[];
  journalId: number;
  revealed: boolean;
  implodeTurn: number;
  implodeBy: number | null;
  implodeUntil: number;
  implodeFrom: number;
  log: string[];
  winner: number | null;
}

/* ── actions ───────────────────────────────────────────────────────── */

export type SeatAction =
  | { type: "placeSettlement"; seat: number; vid: number }
  | { type: "placeRoad"; seat: number; eid: number }
  | { type: "placeCity"; seat: number; vid: number }
  | { type: "roll"; seat: number }
  | { type: "endTurn"; seat: number }
  | { type: "buyCards"; seat: number; spend: Bundle }
  | { type: "bankTrade"; seat: number; give: Bundle; get: Bundle }
  | { type: "offerTrade"; seat: number; offer: Bundle; want: Bundle }
  | { type: "answerTrade"; seat: number; accept: boolean }
  | { type: "acceptTrade"; seat: number; with: number }
  | { type: "cancelTrade"; seat: number }
  | { type: "playCard"; seat: number; cardId: number }
  | { type: "pickSeat"; seat: number; target: number }
  | { type: "pickHex"; seat: number; hid: number }
  | { type: "pickVictim"; seat: number; target: number }
  | { type: "favorDemand"; seat: number; want: Bundle }
  | { type: "discard"; seat: number; bundle: Bundle }
  | { type: "nope"; seat: number; jid: number }
  | { type: "nopeTurn"; seat: number }
  | { type: "defuse"; seat: number; jid: number }
  | { type: "cancelSelect"; seat: number }
  | { type: "reorderHand"; seat: number; from: number; to: number | null }
  /** Your own portrait, at any point in the game. Cosmetic: never journalled, never answerable. */
  | { type: "setAvatar"; seat: number; avatar: string };

export type Action = SeatAction | { type: "tick"; hidden?: boolean };

/* ── events: what happened, for a UI to animate ─────────────────────── */

export type FeedKind = EntryKind | "buy" | "defend";
export type GameEvent =
  | { type: "log"; text: string }
  | { type: "feed"; text: string; kind: FeedKind; jid?: number; ms?: number; turn?: number }
  | { type: "amend"; jid: number | null; text: string }
  | { type: "production"; sources: { hid: number; pid: number; r: Res; n: number }[]; paid: Bundle[] }
  | { type: "cards"; from: number | null; to: number | null; bundle: Bundle; hidden: boolean }
  | { type: "kitten"; pid: number; card: Card }
  | { type: "show"; what: ShowKind; pid: number; jid: number | null }
  | { type: "hint"; seat: number; text: string }
  | { type: "turnTimeout"; pid: number }
  | { type: "gameOver"; winner: number };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
