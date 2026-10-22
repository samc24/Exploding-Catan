/* ══════════════════════════════════════════════════════════════════════════
   TAUNTS — bots throw emoji at the table, about what the table saw
   ══════════════════════════════════════════════════════════════════════════
   Everything here reads the JOURNAL, which is the public record: what was
   played, by whom, at whom. No bot looks in a hand to decide whether to
   laugh, so the fairness rule holds. The tuning is deliberately mean: a bot
   that has just taken your whole hand laughs at you; a bot that has just
   lost its own hand blames the dice. They are gracious about losing the
   game, and only sometimes.

   Pure: nextTaunts(table, mind, state, now) returns the emoji to throw and
   advances the taunt memory. The host decides what to do with them.
   ══════════════════════════════════════════════════════════════════════════ */
import { EMOJIS } from "@exploding-catan/protocol";
import { Rng, type GameState, type JournalEntry } from "@exploding-catan/engine";
import type { Table } from "./driver";

export interface Taunt { seat: number; emoji: string }
export interface TauntMemory {
  rng: Rng;
  seenEntry: number;
  lastAt: number;
  sawOver: boolean;
  quietUntil: Map<number, number>;
}
export function createTauntMemory(seed: number, s?: GameState): TauntMemory {
  const last = s && s.journal.length ? s.journal[s.journal.length - 1].id : 0;
  return { rng: new Rng(seed >>> 0), seenEntry: last, lastAt: 0, sawOver: false, quietUntil: new Map() };
}

const JEER = ["😂", "😹", "🤡", "💀", "👶", "🐔", "💩", "🖕"];
const SMUG = ["😏", "🧠", "🔥", "🥱"];
const HURT = ["😭", "😱", "🙄", "💀"];
const RESPECT = ["👏", "🤝", "🙏"];
const BORED = ["🥱", "🙄"];
/** The whole table stays quiet this long after any throw. */
const GAP_MS = 2200;
/** One bot stays quiet this long after its own. */
const COOLDOWN_MS = 9000;
/** Every chance below is multiplied by this: the joke is the timing, and timing needs gaps. */
const RATE = 0.7;

function pick(m: TauntMemory, list: string[]): string | null {
  const ok = list.filter((e) => EMOJIS.includes(e));
  return ok.length ? ok[m.rng.int(ok.length)] : null;
}
/** One throw, if this bot is allowed one and the dice say so. */
function tryTaunt(t: Table, m: TauntMemory, out: Taunt[], seat: number, list: string[], chance: number, now: number): boolean {
  if (!t.bots.has(seat)) return false;
  if (now - m.lastAt < GAP_MS) return false;
  if ((m.quietUntil.get(seat) ?? 0) > now) return false;
  if (m.rng.next() > chance * RATE) return false;
  const e = pick(m, list);
  if (!e) return false;
  m.lastAt = now;
  m.quietUntil.set(seat, now + COOLDOWN_MS);
  out.push({ seat, emoji: e });
  return true;
}
/** Every bot except the ones named, in a random order. */
function otherBots(t: Table, m: TauntMemory, exclude: number[]): number[] {
  const out = [...t.bots.keys()].filter((seat) => !exclude.includes(seat));
  return m.rng.shuffle(out);
}

function reactTo(t: Table, m: TauntMemory, out: Taunt[], e: JournalEntry, now: number): void {
  const actor = e.actor;
  const target = e.target === null ? -1 : e.target;
  // Somebody was named and something was done to them: a card with their name
  // on it, a knight's steal, a robbery. The best joke belongs to whoever threw
  // it; failing that, to whoever was hit; failing that, to anybody watching.
  if (target >= 0 && target !== actor) {
    const loud = !!e.card;
    if (tryTaunt(t, m, out, actor, JEER, loud ? 0.75 : 0.5, now)) return;
    if (tryTaunt(t, m, out, target, HURT, 0.4, now)) return;
    for (const seat of otherBots(t, m, [actor, target])) if (tryTaunt(t, m, out, seat, JEER, loud ? 0.28 : 0.18, now)) return;
    return;
  }
  // A card that answered another card. Landing a Nope is the smuggest moment available.
  if (e.kind === "defend") {
    if (tryTaunt(t, m, out, actor, SMUG, 0.7, now)) return;
    for (const seat of otherBots(t, m, [actor])) if (tryTaunt(t, m, out, seat, JEER, 0.2, now)) return;
    return;
  }
  if (e.kind === "roll") {
    // A seven: everybody is about to pay, so the roller is the one seat with nothing to be sorry about.
    if (e.show === "seven") {
      if (tryTaunt(t, m, out, actor, JEER, 0.6, now)) return;
      for (const seat of otherBots(t, m, [actor])) if (tryTaunt(t, m, out, seat, HURT, 0.3, now)) return;
      return;
    }
    if (e.text.includes("nobody produces")) {
      for (const seat of otherBots(t, m, [])) if (tryTaunt(t, m, out, seat, BORED, 0.3, now)) return;
    }
    return;
  }
  // Somebody bought a card, built something, took a bonus card. Mild, and rare.
  if (e.kind === "buy" || e.kind === "big") {
    for (const seat of otherBots(t, m, [actor])) if (tryTaunt(t, m, out, seat, JEER, 0.12, now)) return;
  }
}

/** The end of the game: everyone gets to say something about it. */
function reactToEnd(t: Table, m: TauntMemory, out: Taunt[], s: GameState): void {
  const winner = s.winner;
  for (const seat of otherBots(t, m, [])) {
    if (seat !== winner && m.rng.next() > RATE) continue;
    const humanWon = winner !== null && !t.bots.has(winner);
    const list = seat === winner ? SMUG : humanWon ? (m.rng.next() < 0.45 ? RESPECT : HURT) : HURT;
    const e = pick(m, list);
    if (e) out.push({ seat, emoji: e });
  }
}

/** What the bots want to throw, given everything that has happened since last asked. */
export function nextTaunts(t: Table, m: TauntMemory, s: GameState, now: number): Taunt[] {
  const out: Taunt[] = [];
  if (!t.bots.size) return out;
  const j = s.journal;
  // A fresh game: the ids went backwards, so nothing here has been seen. Catch up silently.
  if (j.length && j[j.length - 1].id < m.seenEntry) { m.seenEntry = j[j.length - 1].id; return out; }
  if (s.phase === "over") {
    if (!m.sawOver) { m.sawOver = true; reactToEnd(t, m, out, s); }
    return out;
  }
  m.sawOver = false;
  // Nothing to say during the opening placements.
  const quiet = !s.turnCounter || s.phase.startsWith("setup");
  for (const e of j) {
    if (e.id <= m.seenEntry) continue;
    m.seenEntry = e.id;
    if (quiet || e.noped) continue;
    reactTo(t, m, out, e, now);
  }
  return out;
}

/** Somebody typed something. Bots cannot read it and would not care if they could. */
export function heard(t: Table, m: TauntMemory, fromSeat: number | null, now: number): Taunt | null {
  if (fromSeat !== null && t.bots.has(fromSeat)) return null;
  const bots = otherBots(t, m, []);
  if (!bots.length) return null;
  if (m.rng.next() > 0.4 * RATE) return null;
  const out: Taunt[] = [];
  tryTaunt(t, m, out, bots[0], m.rng.next() < 0.75 ? JEER : BORED, 1, now);
  return out[0] ?? null;
}
