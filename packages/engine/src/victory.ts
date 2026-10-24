/* ══════════════════════════════════════════════════════════════════════
   VICTORY — who has won, and who is forced to Nope it
   ══════════════════════════════════════════════════════════════════════
   Every player is checked, not only whose turn it is: a win does not
   always land on its owner's turn. One question decides whether it stands:
   is there a Nope at this table that is not the winner's own? If so, its
   holder must spend it (the forced Nope); if not, the win is declared.
   ══════════════════════════════════════════════════════════════════════ */
import { cur, feed, holds, log, totalVP, type Ctx } from "./state";
import { implodeActive, logAction } from "./journal";
import { clearImplodeClock, stopTurnTimer } from "./clock";
import type { GameState, Player } from "./types";

/** Every player is checked: a win does not always land on whose turn it is. */
export function checkVictory(c: Ctx): void {
  const s = c.s;
  if (s.winner !== null || s.phase === "over") return;
  let claimant: Player | null = totalVP(s, cur(c)) >= s.winPoints ? cur(c) : null;
  if (!claimant) {
    for (const q of s.players)
      if (totalVP(s, q) >= s.winPoints && (!claimant || totalVP(s, q) > totalVP(s, claimant))) claimant = q;
  }
  if (!claimant) return;
  // An Imploding Kitten makes its turn un-Nopeable, and that includes the win.
  if (implodeActive(s) && claimant.id === s.cur) {
    log(c, `${claimant.name} wins on an imploded turn — no Nope can touch it.`);
    feed(c, `💥 ${claimant.name} wins on an imploded turn — un-Nopeable`, "big");
    declareWinner(c, claimant.id);
    return;
  }
  // One question: is there a Nope at this table that is not the winner's own?
  const forced = forcedNoperFor(s, claimant.id);
  if (forced !== null) forcedWinNope(c, claimant, forced);
  else declareWinner(c, claimant.id);
}

/** The next player in turn order who holds a Nope must spend it. */
export function forcedNoperFor(s: GameState, winnerId: number): number | null {
  const n = s.players.length;
  for (let i = 1; i < n; i++) {
    const id = (winnerId + s.dir * i + n * n) % n;
    if (id === winnerId) continue;
    if (holds(s.players[id], "nope")) return id;
  }
  return null;
}

function forcedWinNope(c: Ctx, winner: Player, pid: number): void {
  const s = c.s;
  if (s.forcedNope && s.forcedNope.pid === pid && s.forcedNope.winner === winner.id) return;
  s.forcedNope = { pid, winner: winner.id };
  const p = s.players[pid];
  log(c, `${winner.name} reaches ${s.winPoints} VP — ${p.name} is forced to Nope it.`);
  logAction(c, `🏆 ${winner.name} reached ${s.winPoints} VP — ${p.name} is forced to Nope it`, "big", {
    actor: winner.id, target: pid, nopeable: false, notice: true, show: "winnoped",
  });
  // The forced player answers with a `nopeTurn` action; nothing else may move until they do.
}

export function declareWinner(c: Ctx, pid: number): void {
  const s = c.s;
  s.forcedNope = null;
  const p = s.players[pid];
  s.winner = pid;
  s.phase = "over";
  s.select = null;
  s.trade = null;
  s.revealed = true;
  clearImplodeClock(c);
  stopTurnTimer(c);
  log(c, `🏆 ${p.name} wins with ${totalVP(s, p)} victory points!`);
  logAction(c, `🏆 ${p.name} wins with ${totalVP(s, p)} victory points`, "big", {
    actor: pid, nopeable: false, notice: true, show: "win",
  });
  c.events.push({ type: "gameOver", winner: pid });
}

