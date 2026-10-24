/* The one line of standing advice for whoever is playing at this screen:
   what the table wants from them right now. Said on every repaint rather
   than shouted once, so nothing can wipe it. Nothing for a bot's turn. */
import { COST, KITTEN, RES_NAME, type GameState, type Res } from "@exploding-catan/engine";
import { Tap, tap } from "./tap";

export function adviceFor(s: GameState, view: number, armed: { kind: string; id: number } | null, isBot: (pid: number) => boolean): string | null {
  if (isBot(view) || s.phase === "over") return null;
  const sel = s.select;
  const ours = (sel && "actor" in sel) ? sel.actor === view : s.cur === view;
  if (!ours) return null;
  // Aiming a card that has already been played.
  if (sel && sel.kind === "seat") return `${Tap} the portrait of the player you are aiming ${KITTEN[sel.key].name} at.`;
  if (armed) {
    if (armed.kind === "robber") return `${Tap} that hex again to move the robber there, or another to change your mind.`;
    if (armed.kind === "alterb") return `${Tap} that token again to swap the two, or another to change your mind.`;
    if (armed.kind === "free") return `${Tap} again to confirm placement, or ${tap} elsewhere to cancel.`;
    const kind = armed.kind as keyof typeof COST;
    const cost = COST[kind] ? " — " + (Object.entries(COST[kind]) as [Res, number][]).map(([r, n]) => `${n} ${RES_NAME[r]}`).join(", ") : "";
    return `${Tap} again to confirm the ${kind}${cost}, or ${tap} elsewhere to cancel.`;
  }
  if (sel && sel.kind === "robber") return `${Tap} a hex to move the robber onto it.`;
  if (sel && sel.kind === "alter") return sel.first === null ? "Pick the first number token to swap." : "Now pick the second number token.";
  if (s.phase === "setup3") {
    const left = s.roadsOwed ? s.roadsOwed[view] : 0;
    if (!left) return "Waiting for everyone to place their roads.";
    return `Place ${left === 2 ? "a road on each of your settlements" : "a road on your other settlement"}. Everybody is placing at once.`;
  }
  if (s.phase.startsWith("setup")) return `Place your ${sel && sel.kind === "road" ? "road" : "settlement"} — ${tap} a highlighted spot.`;
  if (s.phase === "roll") return "Roll the dice to begin your turn.";
  return null;
}
