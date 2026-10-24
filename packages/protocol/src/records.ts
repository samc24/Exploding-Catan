/* ══════════════════════════════════════════════════════════════════════
   RECORDS — who has beaten whom
   ══════════════════════════════════════════════════════════════════════
   One line per finished game: who was at the table (people, by nickname;
   the bots are a count) and who won. Everything shown is derived from
   those lines, so the three views can never disagree: a person's overall
   record, the record for one exact lineup, and head-to-head pairs. A
   nickname is the identity; "JP" and "jp " are the same person.
   ══════════════════════════════════════════════════════════════════════ */

export interface GameRecord {
  /** When the game ended (ms since the epoch). */
  at: number;
  /** The people at the table, as they were named. Bots are not listed. */
  players: string[];
  /** The winner's name as listed, or a bot's name when a bot won. */
  winner: string;
  winnerIsBot: boolean;
  bots: number;
  points: number;
  mode: string;
}
export const RECORDS_KEEP = 1000;

/** The identity behind a display name. */
export function nick(name: string): string { return name.trim().toLowerCase(); }
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const nicks = (names: string[]) => [...new Set(names.map(nick))].sort();

export interface PersonalRecord { name: string; games: number; wins: number; losses: number }
export interface LineupRecord { names: string[]; games: number; wins: Record<string, number>; last: number }
export interface PairRecord { a: string; b: string; games: number; aWins: number; bWins: number }

/** One game's line, from the seats as they were. Null when nobody at the table was a person. */
export function recordOf(players: { name: string; bot: boolean }[], winnerSeat: number, points: number, mode: string, at = Date.now()): GameRecord | null {
  const people = players.filter((p) => !p.bot);
  if (!people.length) return null;
  const w = players[winnerSeat];
  return { at, players: people.map((p) => p.name), winner: w?.name ?? "", winnerIsBot: !!w?.bot, bots: players.length - people.length, points, mode };
}
/** Add a line, newest last, keeping the list bounded. */
export function addRecord(list: GameRecord[], rec: GameRecord): GameRecord[] {
  const out = [...list, rec];
  while (out.length > RECORDS_KEEP) out.shift();
  return out;
}

/** Everything a person has played, with everybody. */
export function personal(records: GameRecord[], name: string): PersonalRecord {
  const me = nick(name);
  let games = 0, wins = 0;
  for (const r of records) {
    if (!r.players.some((p) => nick(p) === me)) continue;
    games++;
    if (!r.winnerIsBot && nick(r.winner) === me) wins++;
  }
  return { name, games, wins, losses: games - wins };
}
/** The games where exactly these people sat down (bots or not), and who won each. */
export function lineup(records: GameRecord[], names: string[]): LineupRecord {
  const want = nicks(names);
  const wins: Record<string, number> = {};
  const shown = new Map<string, string>();
  for (const n of names) shown.set(nick(n), n);
  let games = 0, last = 0;
  for (const r of records) {
    if (!sameSet(nicks(r.players), want)) continue;
    games++;
    last = Math.max(last, r.at);
    if (!r.winnerIsBot) { const w = shown.get(nick(r.winner)) ?? r.winner; wins[w] = (wins[w] ?? 0) + 1; }
  }
  return { names: [...names], games, wins, last };
}
/** Every lineup that has played, most played first. */
export function lineups(records: GameRecord[]): LineupRecord[] {
  const seen = new Map<string, string[]>();
  for (const r of records) { const k = nicks(r.players).join("|"); if (!seen.has(k)) seen.set(k, r.players); }
  return [...seen.values()].map((names) => lineup(records, names)).sort((a, b) => b.games - a.games || b.last - a.last);
}
/** Head to head within a group: for each pair, the games both were in, and who took them. */
export function pairs(records: GameRecord[], names: string[]): PairRecord[] {
  const out: PairRecord[] = [];
  const list = [...new Map(names.map((n) => [nick(n), n])).values()];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], na = nick(a), nb = nick(b);
    let games = 0, aWins = 0, bWins = 0;
    for (const r of records) {
      const ns = r.players.map(nick);
      if (!ns.includes(na) || !ns.includes(nb)) continue;
      games++;
      if (!r.winnerIsBot) { const w = nick(r.winner); if (w === na) aWins++; else if (w === nb) bWins++; }
    }
    if (games) out.push({ a, b, games, aWins, bWins });
  }
  return out;
}
