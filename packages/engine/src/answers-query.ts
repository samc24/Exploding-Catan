/* What a Nope or a Defuse dropped on the pile could answer right now, newest
   first. The same checks the reducer applies, so nothing becomes answerable
   here that the reducer would refuse. */
import { geometry } from "./board";
import { KITTEN } from "./constants";
import { canDefuseEntry, canNopeTurnNow, isRobberEntry, nopeCancelsCard, openEntries } from "./journal";
import type { GameState, JournalEntry } from "./types";

export type Answer = { jid: number; label: string } | { turn: number; label: string };

export function answersFor(s: GameState, key: "nope" | "defuse", me: number, now: number): Answer[] {
  const geo = geometry(s.board);
  const out: Answer[] = [];
  let rollSeen = false;
  for (const e of openEntries(s, now)) {
    const ok = key === "defuse" ? canDefuseEntry(s, geo, e, me, now) : nopeCancelsCard(s, geo, e, me, now);
    if (!ok) continue;
    if (e.kind === "roll") { if (rollSeen) continue; rollSeen = true; }
    out.push({ jid: e.id, label: answerLabel(s, e, me, key) });
  }
  if (key === "nope" && canNopeTurnNow(s, me))
    out.push({ turn: s.cur, label: `Cancel ${s.players[s.cur].name}'s whole turn` });
  return out;
}

function answerLabel(s: GameState, e: JournalEntry, me: number, key: "nope" | "defuse"): string {
  const who = s.players[e.actor].name;
  if (e.kind === "roll") {
    if (key === "defuse") return "The 7 — keep your hand";
    return e.actor === me ? "Your own roll — throw the dice again" : `${who}'s roll — they throw again`;
  }
  if (isRobberEntry(e)) return `${who}'s robber, on your hex`;
  if (e.kind === "defend") return `${who}'s ${e.spent && e.spent.key === "defuse" ? "Defuse" : "Nope"}`;
  if (e.card && KITTEN[e.card.key]) return `${who}'s ${KITTEN[e.card.key].name}`;
  return e.text;
}
