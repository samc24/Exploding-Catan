/* ══════════════════════════════════════════════════════════════════════
   ANSWERS — Nope and Defuse, and what cancelling a turn costs
   ══════════════════════════════════════════════════════════════════════ */
import { KITTEN, RES } from "./constants";
import {
  cur, feed, holds, log, player, refuse, removeCardById, spendCard, totalVP, turnPointer, updateLargestArmy,
  updateLongestRoad, type Ctx,
} from "./state";
import {
  canDefuseEntry, canNopeEntry, canNopeFor, canNopeNow, canNopeTurnNow, entryById, handoverActive, isRobberEntry,
  logAction, nopeCancelsCard, notThisTurnsDoing, pileCancel, pileDrop, restoreAll, snapAll, turnOpenSnap,
  turnStartSnap,
} from "./journal";
import {
  advancePlayer, beginRobberMove, checkVictory, clearImplodeClock, doRoll, settleAttackDue, startTurnTimer,
  stepSeven,
} from "./turn";
import { playResolved } from "./cards";
import type { JournalEntry, Player, TurnPointer } from "./types";

/* ── a Noped turn ──────────────────────────────────────────────────── */
/* A Noped turn is not merely rewound: everything its owner gained is DELETED
   FROM PLAY, and everything it did to everybody else is handed back. Drawn
   cards do not return to the deck; resources spent are never refunded. */
export function wipeNopedTurn(c: Ctx): void {
  const s = c.s;
  const p = cur(c), rec = s.turnRec;
  const lost: string[] = [];

  const start = turnStartSnap(s);
  const skip = notThisTurnsDoing(s, p.id);
  const given: string[] = [];
  if (start) {
    s.players.forEach((q, i) => {
      if (i === p.id || skip[i]) return;
      let back = 0;
      for (const r of RES) {
        const d = start.res[i][r] - q.res[r];
        if (!d) continue;
        q.res[r] = start.res[i][r];
        s.bank[r] -= d;
        if (d > 0) back += d;
      }
      q.skipTokens = start.skips[i];
      if (back > 0) given.push(`${q.name} ${back}`);
    });
    s.robber = start.robber;
    s.numbers = start.numbers.slice();
    s.dir = start.dir;
    s.extraTurn = start.extra;
  }

  for (const eid of rec.edges) { s.eOwner[eid] = null; p.roads--; }
  if (rec.edges.length) lost.push(`${rec.edges.length} road${rec.edges.length === 1 ? "" : "s"}`);

  // Undo newest-first so a settlement→city upgrade unwinds before the build.
  for (let i = rec.verts.length - 1; i >= 0; i--) {
    const { vid, prevType } = rec.verts[i];
    if (prevType === null) { s.vOwner[vid] = null; s.vType[vid] = null; p.settlements--; }
    else { s.vType[vid] = "settlement"; p.cities--; p.settlements++; }
  }
  if (rec.verts.length) lost.push(`${rec.verts.length} building${rec.verts.length === 1 ? "" : "s"}`);

  // Cards drawn this turn are destroyed, not returned to the deck.
  let vp = 0;
  for (const id of rec.drawn) {
    const card = removeCardById(p, id);
    if (card && card.key === "vp") vp++;
  }
  if (rec.drawn.length) lost.push(`${rec.drawn.length} kitten card${rec.drawn.length === 1 ? "" : "s"}${vp ? ` (incl. ${vp} Feral)` : ""}`);

  if (rec.knights) { p.knights -= rec.knights; lost.push(`${rec.knights} knight${rec.knights === 1 ? "" : "s"}`); }

  let res = 0;
  for (const r of RES) {
    const n = Math.min(rec.gained[r], p.res[r]);
    if (n > 0) { p.res[r] -= n; s.bank[r] += n; res += n; }
  }
  if (res) lost.push(`${res} resource${res === 1 ? "" : "s"}`);

  // Put the bonus cards back where the turn found them, THEN recompute, so a
  // tie is judged from where the turn started rather than defending the very
  // thing the Nope is taking away. turnOpenSnap, not `start`: see the README.
  const open = turnOpenSnap(s);
  if (open) {
    s.longestRoad = { ...open.lr };
    s.largestArmy = { ...open.la };
  }
  updateLongestRoad(c);
  updateLargestArmy(c);
  feed(c, `🚫 ${p.name}'s turn was Noped${lost.length ? ` — lost ${lost.join(", ")}` : ""}${given.length ? " — everything it took is handed back" : ""}`, "big", 5200);
  log(c, `${p.name}'s turn was Noped — ${lost.length ? `lost ${lost.join(", ")}` : "nothing to lose"}. Resources already spent are gone too.`);
  if (given.length) log(c, `Cards the turn took are handed back: ${given.join(", ")}.`);
}

/** Shared by a voluntary turn-Nope and the forced one after a win. The turn
    being played is the turn that comes off, whoever's win it was. */
export function cancelTurn(c: Ctx, actorId: number, wasWin: boolean): void {
  const s = c.s;
  s.select = null;
  wipeNopedTurn(c);
  stripWinningPoints(c, s.players[actorId], wasWin);
  advancePlayer(c);
}

/** Noping a win IS Noping the winning points: every Feral Kitten goes. */
export function stripWinningPoints(c: Ctx, p: Player, wasWin: boolean): void {
  const s = c.s;
  if (!wasWin) return;
  let ferals = 0;
  for (let i = p.cards.length - 1; i >= 0; i--) {
    if (p.cards[i].key !== "vp") continue;
    p.cards.splice(i, 1); // out of the game, not discarded
    ferals++;
  }
  if (totalVP(s, p) >= s.winPoints) {
    // The rule written down: a cancelled turn puts the winner back under. If
    // it did not, the code is wrong, and it is said rather than hidden.
    log(c, `⚠ cancelled win left ${p.name} on ${totalVP(s, p)} — the cancel did not take them back under the target`);
  }
  if (ferals) {
    const what = ferals === 1 ? "their Feral Kitten" : `all ${ferals} of their Feral Kittens`;
    log(c, `The cancelled win costs ${p.name} ${what}.`);
    feed(c, `${p.name} loses ${what} to the cancelled win`, "big", 5600);
  }
}

/** Dropping a Nope on whoever is playing cancels their whole turn. */
export function nopeWholeTurn(c: Ctx, ownerId: number, pid: number): void {
  const s = c.s;
  if (!canNopeNow(s, ownerId)) refuse("a forced Nope is being served first");
  const victim = player(c, pid), noper = player(c, ownerId);
  if (!holds(noper, "nope")) refuse("no Nope in hand");
  const playing = cur(c);
  const sameTurn = playing.id === pid;
  const wasWin = totalVP(s, victim) >= s.winPoints;
  // Snapshot BEFORE the card is spent, so a counter-Nope's re-charge finds it.
  const snapBefore = snapAll(s);
  s.forcedNope = null;
  const spent = spendCard(c, noper, "nope");
  log(c, sameTurn
    ? `${victim.name}'s turn was Noped by ${noper.name}.`
    : `${noper.name} Nopes ${victim.name}'s win, which takes ${playing.name}'s turn with it.`);
  const turnBack = turnPointer(s);
  const noteEntry = logAction(c,
    sameTurn ? `${victim.name}'s turn was Noped` : `${victim.name}'s win is Noped — ${playing.name}'s turn is cancelled with it`,
    "defend", { actor: ownerId, snap: snapBefore, nopeable: true, turnBack, spent, show: "nope", wonBy: wasWin ? pid : null });
  clearImplodeClock(c);
  cancelTurn(c, pid, wasWin);
  noteEntry.turn = s.turnCounter; // it belongs to the turn it made
}

/** The forced player serving their obligation. */
export function serveForcedNope(c: Ctx, pid: number): void {
  const f = c.s.forcedNope;
  if (!f || f.pid !== pid) refuse("you are not the one being forced");
  nopeWholeTurn(c, pid, f.winner);
}

/* ── Nope an entry ─────────────────────────────────────────────────── */
export function nopeEntry(c: Ctx, id: number, noperId: number): void {
  const s = c.s;
  const idx = s.journal.findIndex((e) => e.id === id);
  if (idx < 0) refuse("that line is gone");
  const e = s.journal[idx];
  if (!canNopeFor(s, e, noperId, c.now)) refuse(canNopeEntry(s, e, c.now) ? "you may not Nope that" : "that can no longer be answered");
  const noper = player(c, noperId);
  if (!holds(noper, "nope")) refuse("no Nope in hand");

  const selfRoll = noperId === e.actor && e.kind === "roll";
  const answeredCard = e.kind === "defend" ? (e.spent && e.spent.key === "defuse" ? "Defuse" : "Nope") : null;
  const answering = answeredCard ? `${s.players[e.actor].name}'s ${answeredCard}` : e.text;
  let reroll = false;
  const victim = s.players[e.actor];
  const live = s.phase !== "over" && !s.phase.startsWith("setup");
  const wasNoperTurn = e.actor === s.cur && live;
  // Their turn ended a moment ago and the hand-over window is still open.
  const lateTurn = live && e.actor !== s.cur && handoverActive(s, c.now) && e.turn === s.handoverTurn;
  const turnBack = turnPointer(s);

  // Captured BEFORE the rewind: what a counter-Nope has to put back.
  const undone = snapAll(s);

  // Rewind first, then spend the card — the entry's snapshot predates the Nope.
  restoreAll(s, e.snap);
  pileDrop(s, s.journal.slice(idx + 1).map((x) => x.id));
  pileCancel(s, e.id);
  s.journal.splice(idx);
  const spent = spendCard(c, noper, "nope");

  // The attack and the Nope are both spent: the rewind handed the card back.
  if (e.card && !e.card.synthetic) {
    const owner = s.players[e.actor];
    const back = removeCardById(owner, e.card.id);
    if (back) s.discard.push(back);
  }
  // A Nope that is itself Noped is still spent. Charged by IDENTITY.
  if (e.spent && s.players[e.spent.pid]) {
    const payer = s.players[e.spent.pid];
    const i = e.spent.id !== null
      ? payer.cards.findIndex((x) => x.id === e.spent!.id)
      : payer.cards.findIndex((x) => x.key === e.spent!.key);
    if (i >= 0) s.discard.push(payer.cards.splice(i, 1)[0]);
    else if (e.spent.id !== null)
      c.events.push({ type: "log", text: `the ${e.spent.key} spent on entry ${e.id} was not in ${payer.name}'s hand after the rewind` });
  }
  // Undoing an answer puts what it answered back on the table.
  if (e.unanswers !== undefined) {
    const back = entryById(s, e.unanswers);
    if (back) back.answered = false;
  }
  s.select = null;
  s.robberDue = [];
  if (s.trade) tradeOff(c);

  const noteEntry = logAction(c, `${noper.name} Nopes ${selfRoll ? "their own roll" : answering}`, "defend", {
    actor: noperId, snap: undone, nopeable: true, turnBack, spent, show: "nope",
    undid: { text: e.text, actor: e.actor, kind: e.kind },
  });
  log(c, selfRoll ? `${noper.name} Nopes their own roll.` : `${noper.name} Nopes: ${e.text}`);

  // Noping a Defuse cancels the "no you": the original card is played again.
  if (e.redo) {
    playResolved(c, { card: e.redo.card, actor: e.redo.actor, target: e.redo.target, payload: e.redo.payload }, { quiet: true });
  }
  // Noping a NOPE puts back whatever that Nope cancelled; say so.
  if (e.undid && e.undid.text) {
    feed(c, `↺ ${e.undid.text} — stands after all`, "defend");
    log(c, `Back on: ${e.undid.text}.`);
  }

  const handedBack = !!e.turnBack && (e.turnBack.cur !== s.cur || e.turnBack.turnCounter !== s.turnCounter);
  if (e.turnBack) restoreTurnPointer(c, e.turnBack);

  if (handedBack) {
    const back = s.players[s.cur];
    feed(c, `${back.name} gets their turn back`, "defend");
    log(c, `${back.name} gets their turn back.`);
  } else if ((wasNoperTurn || lateTurn) && e.kind === "roll") {
    // A Noped roll is thrown again; it costs the roller their number, not their turn.
    reroll = true;
    if (lateTurn) {
      s.cur = e.actor;
      s.turnCounter = e.turn;
      s.handoverUntil = 0;
      s.handoverTurn = -1;
    }
  } else if (lateTurn) {
    // Answered after they had already left the table: the rewind is the whole punishment.
  } else if (wasNoperTurn && !e.redo && !e.turnSafe) {
    // The card is cancelled. The turn is not.
    feed(c, `${victim.name}'s card is cancelled — their turn continues`, "defend");
    log(c, `${victim.name}'s card is cancelled; their turn continues.`);
  }
  noteEntry.turn = s.turnCounter;

  if (reroll) {
    s.phase = "roll";
    s.rolled = null;
    s.seven = null;
    feed(c, selfRoll ? `${victim.name} Nopes their own roll — throwing again` : `${victim.name} is Noped — the dice are thrown again`, "defend");
    log(c, selfRoll ? `${victim.name} Nopes their own roll and throws again.` : `${victim.name}'s roll is Noped — they roll again.`);
    doRoll(c);
    return;
  }
  if (s.seven) stepSeven(c);
  else settleAttackDue(c);
  // Undoing a Nope can put a WIN back on the table. Ask again.
  if (e.kind === "defend") checkVictory(c);
}

/** Put the turn pointer back where a Nope found it. Only the counter-Nope path uses this. */
function restoreTurnPointer(c: Ctx, t: TurnPointer): void {
  const s = c.s;
  clearImplodeClock(c);
  s.robberDue = [];
  s.cur = t.cur;
  s.phase = t.phase;
  s.turnCounter = t.turnCounter;
  s.rolled = t.rolled ? [t.rolled[0], t.rolled[1]] : null;
  s.extraTurn = t.extraTurn;
  s.select = null;
  // A turn handed back gets a fresh clock rather than none.
  if (t.rolled) startTurnTimer(c);
}

/** A rewind under a live offer takes the offer off the table, and says so. */
function tradeOff(c: Ctx): void {
  c.s.trade = null;
  feed(c, "↺ A card was answered — the trade on the table is off", "info");
  log(c, "The trade on the table is off: a card was answered under it.");
}

/* ── Defuse ────────────────────────────────────────────────────────── */
/** Spending a Defuse on the roll buys one hand out of the cut. Nothing is rewound. */
function defuseSeven(c: Ctx, _e: JournalEntry, defuserId: number): void {
  const s = c.s;
  if (!s.seven) refuse("no seven to Defuse");
  const d = player(c, defuserId);
  const snapBefore = snapAll(s);
  const spent = spendCard(c, d, "defuse");
  const i = s.seven.queue.indexOf(defuserId);
  if (i >= 0) s.seven.queue.splice(i, 1);
  log(c, `${d.name} Defuses the seven — their hand is not cut.`);
  // turnSafe: defensive and out of turn, so Noping it must not end a roller's turn.
  logAction(c, `${d.name} Defuses the seven — their hand is spared`, "defend", {
    actor: defuserId, snap: snapBefore, nopeable: true, turnSafe: true, spent, show: "defuse",
  });
  stepSeven(c);
}

/** "No you": the robbery is undone and the defuser moves the robber themselves. */
function defuseRobber(c: Ctx, e: JournalEntry, defuserId: number): void {
  const s = c.s;
  if (e.answered) refuse("that robbery has already been answered");
  const d = player(c, defuserId);
  const thief = s.players[e.actor];
  if (!thief || e.fromHex === undefined) refuse("that robbery cannot be answered");
  const snapBefore = snapAll(s);
  const spent = spendCard(c, d, "defuse");
  e.answered = true;
  s.robber = e.fromHex;
  const r = e.stolen;
  const victim = e.target === null ? null : s.players[e.target];
  if (r && victim && thief.res[r] > 0) { thief.res[r]--; victim.res[r]++; }
  log(c, `${d.name} Defuses the robbery — they take the robber from ${thief.name}${r && victim ? ", and the card goes back" : ""}.`);
  const note = logAction(c, `${d.name} Defuses the robbery — they move the robber instead`, "defend", {
    actor: defuserId, target: e.actor, snap: snapBefore, nopeable: true, turnSafe: true, spent, show: "defuse",
  });
  note.unanswers = e.id;
  // The reflected placement is part of the Defuse, not a fresh attack.
  beginRobberMove(c, defuserId, { knight: false, noDefuse: true });
}

export function defuseEntry(c: Ctx, id: number, defuserId: number): void {
  const s = c.s;
  const idx = s.journal.findIndex((e) => e.id === id);
  if (idx < 0) refuse("that line is gone");
  const e = s.journal[idx];
  if (!canDefuseEntry(s, c.geo, e, defuserId, c.now)) refuse("you may not Defuse that");
  const d = player(c, defuserId);
  if (!holds(d, "defuse")) refuse("no Defuse in hand");
  if (e.kind === "roll") { defuseSeven(c, e, defuserId); return; }
  if (isRobberEntry(e)) { defuseRobber(c, e, defuserId); return; }

  const card = e.card!, payload = e.payload ?? {}, victimId = e.actor;
  const key = card.key;
  // Journalled against the state before the ORIGINAL card, with the original
  // play recorded alongside: undo the Defuse and the card is simply played again.
  const preCard = e.snap;
  const redo = { card, actor: victimId, target: e.target, payload };

  restoreAll(s, e.snap);
  pileDrop(s, s.journal.slice(idx + 1).map((x) => x.id));
  pileCancel(s, e.id);
  s.journal.splice(idx);
  const spent = spendCard(c, d, "defuse");
  s.select = null;
  s.robberDue = [];
  if (s.trade) tradeOff(c);

  // The rewind put the defused card back in its owner's hand. It is spent either way.
  const origOwner = s.players[e.cardOwner === null ? victimId : e.cardOwner];
  const back = removeCardById(origOwner, card.id);
  if (back) s.discard.push(back);

  log(c, `${d.name} Defuses ${KITTEN[key].name}.`);
  const answerable = { snap: preCard, redo, nopeable: true, spent };

  // Alter the Future and Favor hand the card's power over: the defuser names their own.
  if (key === "alter") {
    logAction(c, `${d.name} Defuses Alter the Future — they swap instead`, "defend", {
      actor: defuserId, show: "defuse", card, payload,
      cardOwner: e.cardOwner === null ? victimId : e.cardOwner,
      participants: (e.participants ?? [victimId]).concat(defuserId),
      ...answerable,
    });
    s.select = { kind: "alter", actor: defuserId, first: null, purpose: { kind: "defuse" } };
    return;
  }
  if (key === "favor") {
    logAction(c, `${d.name} Defuses the Favor — ${s.players[victimId].name} owes them instead`, "defend", {
      actor: defuserId, show: "defuse", ...answerable,
    });
    s.select = { kind: "favor", actor: defuserId, target: victimId, cardId: null, synthetic: true };
    return;
  }
  // Everything else bounces straight back at whoever played it.
  logAction(c, `${d.name} Defuses ${KITTEN[key].name} — it hits ${s.players[victimId].name} instead`, "defend", {
    actor: defuserId, show: "defuse", ...answerable,
  });
  playResolved(c, {
    card: { key, id: -1, flavor: card.flavor, boughtTurn: -1, synthetic: true },
    actor: defuserId, target: victimId, payload,
  }, { quiet: true, noDefuse: key === "knight" });
}

/* ── a Nope dropped on a line ──────────────────────────────────────── */
/** A Nope on a log line cancels that card: a roll, a reaction, or an attack that landed on you.
    Anything else belongs to a turn, and taking the turn is `nopeTurn`. */
export function nopeLine(c: Ctx, jid: number, me: number): void {
  const s = c.s;
  const e = entryById(s, jid);
  if (!e) refuse("that line is gone");
  if (!nopeCancelsCard(s, c.geo, e, me, c.now)) {
    if (!canNopeEntry(s, e, c.now)) refuse("that can no longer be answered");
    refuse("a Nope does not answer that line on its own — cancel the turn instead");
  }
  nopeEntry(c, jid, me);
}

/** Cancel the turn in progress. The forced player's obligation goes through here too. */
export function nopeTurnNow(c: Ctx, me: number): void {
  const s = c.s;
  if (s.forcedNope && s.forcedNope.pid === me) { serveForcedNope(c, me); return; }
  if (s.cur === me) refuse("you cannot Nope your own turn");
  if (s.phase.startsWith("setup")) refuse("nothing to Nope yet");
  if (s.implodeTurn === s.turnCounter) refuse("an imploded turn cannot be Noped");
  if (!canNopeTurnNow(s, me)) refuse("there is no turn to cancel");
  nopeWholeTurn(c, me, s.cur);
}
