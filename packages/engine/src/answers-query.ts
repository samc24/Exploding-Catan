/* What a Nope or a Defuse could answer right now, newest first, each with a
   label and a plain sentence saying what choosing it does. The same checks
   the reducer applies, so nothing is offered that it would refuse. */
import { geometry } from "./board";
import { KITTEN } from "./constants";
import { canDefuseEntry, canNopeTurnNow, describeTurnGains, isRobberEntry, nopeCancelsCard, openEntries } from "./journal";
import type { GameState, JournalEntry } from "./types";

export type Answer =
  | { jid: number; label: string; effect: string }
  | { turn: number; label: string; effect: string };

export function answersFor(s: GameState, key: "nope" | "defuse", me: number, now: number): Answer[] {
  const geo = geometry(s.board);
  const out: Answer[] = [];
  let rollSeen = false;
  for (const e of openEntries(s, now)) {
    const ok = key === "defuse" ? canDefuseEntry(s, geo, e, me, now) : nopeCancelsCard(s, geo, e, me, now);
    if (!ok) continue;
    if (e.kind === "roll") { if (rollSeen) continue; rollSeen = true; }
    out.push({ jid: e.id, label: answerLabel(s, e, me, key), effect: answerEffect(s, e, me, key) });
  }
  if (key === "nope" && canNopeTurnNow(s, me)) {
    const who = s.players[s.cur].name;
    const gains = describeTurnGains(s);
    out.push({
      turn: s.cur,
      label: `Cancel ${who}'s whole turn`,
      effect: gains ? `${who} loses everything this turn gained: ${gains}. Nothing they spent comes back, and their turn ends.`
                    : `${who}'s turn ends. It has gained nothing yet, so nothing is lost but the turn.`,
    });
  }
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

/** One sentence: what happens if this answer is chosen. */
function answerEffect(s: GameState, e: JournalEntry, me: number, key: "nope" | "defuse"): string {
  const who = s.players[e.actor].name;
  if (e.kind === "roll") {
    if (key === "defuse") return "Your hand is not cut. The rest of the seven stands: the robber still moves and everybody else still pays.";
    return e.actor === me
      ? "Your roll is thrown again. Whatever the dice say the second time is the number you keep, and your turn carries on."
      : `${who} throws again and their turn carries on.`;
  }
  if (isRobberEntry(e)) {
    return key === "defuse"
      ? `The robber goes back where it was and the stolen card returns. Then you move the robber yourself and rob whoever is there.`
      : `The robbery is undone: the robber goes back and the card returns.`;
  }
  if (e.kind === "defend") {
    const answered = e.spent && e.spent.key === "defuse" ? "Defuse" : "Nope";
    const back = e.undid ? e.undid.text : "what it cancelled";
    return answered === "Nope"
      ? `${who}'s Nope is taken back and ${back} stands after all.`
      : `${who}'s Defuse is taken back and the card they reflected hits them as first played.`;
  }
  if (e.card) {
    const name = KITTEN[e.card.key]?.name ?? "card";
    if (key === "defuse") {
      if (e.card.key === "favor") return `The Favor turns around: ${who} owes you three cards of your choosing instead.`;
      if (e.card.key === "alter") return `The swap is undone and you choose the two numbers to swap instead.`;
      return `The ${name} bounces back onto ${who} as if they had played it on themselves. Your cards are untouched.`;
    }
    return `Only the ${name} is cancelled; ${who}'s turn carries on. Both the ${name} and your Nope are spent.`;
  }
  return "";
}
