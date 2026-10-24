/* ══════════════════════════════════════════════════════════════════════
   TURN FLOW — setup, building, dice, production, the seven, the robber,
   ending a turn, and the ticks that drive the clocks (clock.ts holds the
   clocks themselves; victory.ts the win)
   ══════════════════════════════════════════════════════════════════════ */
import { COST, DICE_KEEP, RES, RES_NAME, TURN_TICK_MS, TURN_TICK_SLACK, bundleText, emptyBundle } from "./constants";
import {
  cur, fastStart, openingRound, feed, freshTurnRecord, give, log, noteGain, pay, refuse, totalRes,
  updateLargestArmy, updateLongestRoad, type Ctx,
} from "./state";
import { beginHandover, handoverActive, implodeActive, implodeRevealing, logAction, snapAll } from "./journal";
import { clearImplodeClock, stopTurnTimer, timerEnabled, turnClockHeld } from "./clock";
import { checkVictory } from "./victory";
import type { Bundle, GameState, Player, RobberMove } from "./types";

/* ── setup ─────────────────────────────────────────────────────────── */
export function beginSetupStep(c: Ctx): void {
  const s = c.s;
  s.cur = s.setupOrder[s.setupIdx];
  s.phase = s.setupIdx < s.players.length ? "setup1" : "setup2";
  s.select = { kind: "settlement" };
}

/** An opening settlement. Normally only the second one pays out; fast track pays for both. */
export function placeSetupSettlement(c: Ctx, vid: number): void {
  const s = c.s;
  const p = cur(c);
  s.vOwner[vid] = s.cur;
  s.vType[vid] = "settlement";
  p.settlements++;
  log(c, `${p.name} settles.`);
  if (s.phase === "setup2" || fastStart(s)) {
    const got = emptyBundle();
    const opening: { hid: number; pid: number; r: Exclude<keyof Bundle, never>; n: number }[] = [];
    for (const hid of c.geo.vertices[vid].hexes) {
      const t = s.terrain[hid];
      if (t === "desert") continue;
      got[t] += give(c, p, t, 1);
      opening.push({ hid, pid: s.cur, r: t, n: 1 });
    }
    c.events.push({ type: "production", sources: opening, paid: s.players.map((_, i) => (i === s.cur ? got : emptyBundle())) });
    log(c, `${p.name} starts with ${bundleText(got) || "nothing"}.`);
    feed(c, `${p.name} settles and starts with ${bundleText(got) || "nothing"}`, "buy");
  } else {
    feed(c, `${p.name} places their first settlement`, "info");
  }
  // Fast track + places settlements only; the roads come afterwards, all at once.
  if (s.mode === "fastplus") {
    s.select = null;
    s.setupIdx++;
    if (s.setupIdx >= s.setupOrder.length) beginOpeningRoads(c);
    else beginSetupStep(c);
    return;
  }
  s.select = { kind: "road", fromVertex: vid };
}
/** The road that goes with an opening settlement. */
export function placeSetupRoad(c: Ctx, eid: number): void {
  const s = c.s;
  s.eOwner[eid] = s.cur;
  cur(c).roads++;
  log(c, `${cur(c).name} lays a road.`);
  s.select = null;
  s.setupIdx++;
  if (s.setupIdx >= s.setupOrder.length) finishSetup(c);
  else beginSetupStep(c);
}

/* Paid BEFORE the snapshot, in all three builds: a Nope undoes what you
   built; it does not refund it. */
export function buildSettlement(c: Ctx, vid: number): void {
  const s = c.s;
  const p = cur(c);
  pay(c, p, COST.settlement);
  const snapBefore = snapAll(s);
  s.vOwner[vid] = s.cur;
  s.vType[vid] = "settlement";
  p.settlements++;
  s.turnRec.verts.push({ vid, prevType: null });
  logAction(c, `${p.name} builds a settlement`, "buy", { snap: snapBefore, log: true });
  updateLongestRoad(c); // an opponent's settlement can cut a road
  checkVictory(c);
}
export function buildCity(c: Ctx, vid: number): void {
  const s = c.s;
  const p = cur(c);
  pay(c, p, COST.city);
  const snapBefore = snapAll(s);
  s.vType[vid] = "city";
  p.settlements--;
  p.cities++;
  s.turnRec.verts.push({ vid, prevType: "settlement" });
  logAction(c, `${p.name} upgrades to a city`, "buy", { snap: snapBefore, log: true });
  checkVictory(c);
}
export function buildRoad(c: Ctx, eid: number): void {
  const s = c.s;
  const p = cur(c);
  pay(c, p, COST.road);
  const snapBefore = snapAll(s);
  s.eOwner[eid] = s.cur;
  p.roads++;
  s.turnRec.edges.push(eid);
  logAction(c, `${p.name} builds a road`, "buy", { snap: snapBefore, log: true });
  updateLongestRoad(c);
  checkVictory(c);
}

export function finishSetup(c: Ctx): void {
  const s = c.s;
  s.phase = "roll";
  s.cur = s.firstPlayer;
  s.turnCounter = 1;
  s.turnRec = freshTurnRecord();
  s.roadsOwed = null;
  s.select = null;
  log(c, `Setup complete. ${cur(c).name} to roll.`);
  updateLongestRoad(c);
}

/* Fast track +: every settlement is down; now everybody lays two opening
   roads at once. First come, first served. */
export function beginOpeningRoads(c: Ctx): void {
  const s = c.s;
  s.phase = "setup3";
  s.select = null;
  s.cur = s.firstPlayer;
  s.roadsOwed = s.players.map(() => 2);
  log(c, "Everybody places two roads.");
}
/** An opening road goes on one of your settlements that does not have one yet. */
export function openingRoadLegal(s: GameState, geo: Ctx["geo"], eid: number, pid: number): boolean {
  const e = geo.edges[eid];
  if (!e || s.eOwner[eid] !== null) return false;
  return e.v.some((vid) => s.vOwner[vid] === pid && !geo.vertices[vid].edges.some((x) => s.eOwner[x] === pid));
}
export function placeOpeningRoad(c: Ctx, eid: number, pid: number): boolean {
  const s = c.s;
  if (!s.roadsOwed || !(s.roadsOwed[pid] > 0) || !openingRoadLegal(s, c.geo, eid, pid)) return false;
  s.eOwner[eid] = pid;
  s.players[pid].roads++;
  s.roadsOwed[pid]--;
  log(c, `${s.players[pid].name} lays a road.`);
  // Somebody boxed in has nowhere left to build; they are let off rather than waited on.
  s.roadsOwed = s.roadsOwed.map((n, i) =>
    n > 0 && !c.geo.edges.some((e) => openingRoadLegal(s, c.geo, e.id, i)) ? 0 : n,
  );
  if (s.roadsOwed.every((n) => n <= 0)) finishSetup(c);
  return true;
}

/* ── dice / production ─────────────────────────────────────────────── */
export function doRoll(c: Ctx): void {
  const s = c.s;
  const snapBefore = snapAll(s);
  let d1 = 1 + c.rng.int(6);
  let d2 = 1 + c.rng.int(6);
  // The opening round of a fast track has no 7. Thrown again, not nudged.
  while (openingRound(s) && d1 + d2 === 7) {
    d1 = 1 + c.rng.int(6);
    d2 = 1 + c.rng.int(6);
  }
  s.rolled = [d1, d2];
  const sum = d1 + d2;
  s.diceLog.push(sum);
  while (s.diceLog.length > DICE_KEEP) s.diceLog.shift();
  log(c, `${cur(c).name} rolls ${sum} (${d1}+${d2}).`);

  if (sum === 7) {
    const rollEntry = logAction(c, `${cur(c).name} rolls 7 (${d1}+${d2}) — robber moves, hands over 7 are cut`, "roll", {
      snap: snapBefore, show: "seven", payload: { sum },
    });
    s.phase = "main";
    startSevenSequence(c, s.cur, rollEntry.id);
    return;
  }
  const gains = produce(c, sum);
  logAction(c, `${cur(c).name} rolls ${sum} (${d1}+${d2}) — ${gains || "nobody produces"}`, "roll", { snap: snapBefore, payload: { sum } });
  s.phase = "main";
}

/** Pay out a roll. Returns the one-line summary of who got what. */
export function produce(c: Ctx, sum: number): string {
  const s = c.s;
  const owed = s.players.map(() => emptyBundle());
  const paid = s.players.map(() => emptyBundle());
  const sources: { hid: number; pid: number; r: keyof Bundle; n: number }[] = [];
  for (const hx of c.geo.hexes) {
    const t = s.terrain[hx.id];
    if (s.numbers[hx.id] !== sum || hx.id === s.robber || t === "desert") continue;
    for (const vid of hx.verts) {
      const owner = s.vOwner[vid];
      if (owner === null) continue;
      const n = s.vType[vid] === "city" ? 2 : 1;
      owed[owner][t] += n;
      sources.push({ hid: hx.id, pid: owner, r: t, n });
    }
  }
  const notes: string[] = [];
  // If the bank can't pay everyone for a resource, nobody gets it.
  for (const r of RES) {
    const claimants = s.players.filter((p) => owed[p.id][r] > 0);
    const demand = claimants.reduce((t, p) => t + owed[p.id][r], 0);
    if (demand === 0) continue;
    if (demand > s.bank[r]) {
      if (claimants.length > 1) { notes.push(`bank is short on ${RES_NAME[r]} — nobody collects it`); continue; }
      paid[claimants[0].id][r] += give(c, claimants[0], r, s.bank[r]);
      notes.push(`${claimants[0].name} takes the last ${RES_NAME[r]}`);
      continue;
    }
    for (const p of claimants) paid[p.id][r] += give(c, p, r, owed[p.id][r]);
  }
  const gains = s.players.map((p) => { const t = bundleText(paid[p.id]); return t ? `${p.name}: ${t}` : null; }).filter(Boolean).join(" · ");
  log(c, gains || "Nobody produces.");
  for (const n of notes) log(c, n);
  // Only what was actually paid flies: a resource the bank was short of never left it.
  const flown = sources.filter((src) => paid[src.pid][src.r] > 0).map((src) => ({ ...src, n: Math.min(src.n, paid[src.pid][src.r]) }));
  c.events.push({ type: "production", sources: flown, paid });
  return gains;
}

/* ── 7: discard, then robber ───────────────────────────────────────── */
export function startSevenSequence(c: Ctx, actor: number, jid: number): void {
  const s = c.s;
  s.seven = { actor, jid, queue: s.players.filter((p) => totalRes(p) > 7).map((p) => p.id) };
  stepSeven(c);
}
/** Trim the queue of hands no longer over the line, and move the robber when it empties. */
export function stepSeven(c: Ctx): void {
  const s = c.s;
  const sv = s.seven;
  if (!sv) return;
  if (s.phase === "over" || s.phase.startsWith("setup")) { s.seven = null; return; }
  while (sv.queue.length && totalRes(s.players[sv.queue[0]]) <= 7) sv.queue.shift();
  if (!sv.queue.length) {
    const actor = sv.actor;
    s.seven = null;
    beginRobberMove(c, actor, {});
  }
}
/** Attack discards still owed: drop any that an emptied hand no longer owes. */
export function settleAttackDue(c: Ctx): void {
  const s = c.s;
  while (s.attackDue.length) {
    const due = s.attackDue[0];
    const p = s.players[due.pid];
    const n = p ? Math.min(due.n, totalRes(p)) : 0;
    if (n > 0) break;
    s.attackDue.shift();
  }
}
/** Who owes a discard right now, and how many. The seven goes first. */
export function discardOwed(s: GameState): { pid: number; n: number; jid: number | null; kind: "seven" | "attack" } | null {
  if (s.seven && s.seven.queue.length) {
    const pid = s.seven.queue[0];
    return { pid, n: Math.floor(totalRes(s.players[pid]) / 2), jid: s.seven.jid, kind: "seven" };
  }
  if (s.attackDue.length) {
    const due = s.attackDue[0];
    const p = s.players[due.pid];
    return { pid: due.pid, n: Math.min(due.n, totalRes(p)), jid: due.jid, kind: "attack" };
  }
  return null;
}

export function performDiscard(c: Ctx, pid: number, bundle: Bundle): void {
  const s = c.s;
  const owed = discardOwed(s);
  if (!owed || owed.pid !== pid) refuse("no discard owed by this seat");
  const total = RES.reduce((t, r) => t + bundle[r], 0);
  if (total !== owed.n) refuse(`must discard exactly ${owed.n}`);
  const p = s.players[pid];
  for (const r of RES) if (bundle[r] < 0 || bundle[r] > p.res[r]) refuse("cannot discard what you do not hold");
  c.events.push({ type: "cards", from: pid, to: null, bundle: { ...bundle }, hidden: false });
  for (const r of RES) { p.res[r] -= bundle[r]; s.bank[r] += bundle[r]; }
  log(c, `${p.name} discards ${owed.n}.`);
  if (owed.kind === "seven") {
    if (s.seven && s.seven.queue[0] === pid) s.seven.queue.shift();
    stepSeven(c);
  } else {
    s.attackDue.shift();
    settleAttackDue(c);
  }
}

/* ── the robber ────────────────────────────────────────────────────── */
/* Robber moves QUEUE rather than overwrite each other: a seven and a Knight
   played while its discards were being paid are two moves, not one. */
export function beginRobberMove(c: Ctx, actor: number, opts: Partial<RobberMove>): void {
  const s = c.s;
  const move: RobberMove = { actor, knight: false, noDefuse: false, ...opts };
  if (s.select) { s.robberDue.push(move); return; }
  s.select = { kind: "robber", ...move };
  log(c, `${s.players[actor].name} must move the robber.`);
}
export function nextRobberMove(c: Ctx): boolean {
  const s = c.s;
  if (!s.robberDue.length) return false;
  const move = s.robberDue.shift()!;
  s.select = { kind: "robber", ...move };
  log(c, `${s.players[move.actor].name} must move the robber again.`);
  feed(c, `${s.players[move.actor].name} has a second robber move to make`, "attack");
  return true;
}

export function robberPlaced(c: Ctx, hid: number): void {
  const s = c.s;
  const sel = s.select;
  if (!sel || sel.kind !== "robber") refuse("no robber to place");
  if (hid === s.robber) refuse("the robber must move");
  const move: RobberMove = { actor: sel.actor, knight: sel.knight, noDefuse: sel.noDefuse, fromHex: s.robber };
  if (sel.credit !== undefined) move.credit = sel.credit;
  s.robber = hid;
  s.select = null;
  const hx = c.geo.hexes[hid];
  log(c, `${s.players[sel.actor].name} moves the robber onto the ${s.terrain[hid]}${s.numbers[hid] ? " " + s.numbers[hid] : ""}.`);
  const victims = s.players.filter(
    (q) => q.id !== sel.actor && totalRes(q) > 0 && hx.verts.some((v) => s.vOwner[v] === q.id),
  );
  if (victims.length === 0) { finishRobber(c, move); return; }
  // One player on the hex is not a choice.
  if (victims.length === 1) { doSteal(c, s.players[sel.actor], victims[0], move); return; }
  s.select = { kind: "victim", actor: sel.actor, candidates: victims.map((v) => v.id), move };
}

export function victimPicked(c: Ctx, target: number): void {
  const s = c.s;
  const sel = s.select;
  if (!sel || sel.kind !== "victim") refuse("no victim to choose");
  if (!sel.candidates.includes(target)) refuse("that player is not on the hex");
  s.select = null;
  doSteal(c, s.players[sel.actor], s.players[target], sel.move);
}

export function doSteal(c: Ctx, thief: Player, victim: Player, move: RobberMove): void {
  const pool: (keyof Bundle)[] = [];
  for (const r of RES) for (let i = 0; i < victim.res[r]; i++) pool.push(r);
  if (pool.length) {
    const r = c.rng.pick(pool);
    victim.res[r]--;
    thief.res[r]++;
    noteGain(c, thief, r, 1);
    const took = emptyBundle(); took[r] = 1;
    c.events.push({ type: "cards", from: victim.id, to: thief.id, bundle: took, hidden: true });
    // WHICH card was taken is never named to the table.
    log(c, `${thief.name} steals a resource card from ${victim.name}.`);
    move.stole = r;
    move.victim = victim.id;
  } else {
    log(c, `${victim.name} has nothing to steal.`);
  }
  finishRobber(c, move);
}

export function finishRobber(c: Ctx, move: RobberMove): void {
  const s = c.s;
  s.select = null;
  journalRobber(c, move);
  if (move.knight) {
    // The knight counts for whoever played the card, even if it was Defused.
    const p = s.players[move.credit !== undefined ? move.credit : move.actor];
    p.knights++;
    if (p.id === s.cur) s.turnRec.knights++;
    updateLargestArmy(c);
    checkVictory(c);
  }
  nextRobberMove(c);
}

/** One line for the whole robbery, answerable by anybody with a building on that hex. */
function journalRobber(c: Ctx, move: RobberMove): void {
  const s = c.s;
  if (move.fromHex === undefined) return;
  const thief = s.players[move.actor];
  const where = s.terrain[s.robber] + (s.numbers[s.robber] ? " " + s.numbers[s.robber] : "");
  const took = move.victim !== undefined ? ` and steals a resource card from ${s.players[move.victim].name}` : "";
  const ent = logAction(c, `${thief.name} moves the robber onto the ${where}${took}`, "attack", {
    actor: move.actor,
    target: move.victim === undefined ? null : move.victim,
    snap: snapAll(s),
    payload: { robber: true, hex: s.robber },
    noDefuse: move.noDefuse,
    show: "robbery",
  });
  ent.stolen = move.stole ?? null;
  ent.fromHex = move.fromHex;
}

/* ── turn boundaries ───────────────────────────────────────────────── */
export function doEndTurn(c: Ctx): void {
  const s = c.s;
  stopTurnTimer(c);
  const ended = s.turnCounter;
  s.trade = null;
  if (s.extraTurn) {
    s.extraTurn = false;
    beginHandover(c, ended);
    s.phase = "roll";
    s.rolled = null;
    s.seven = null;
    s.turnCounter++;
    s.turnRec = freshTurnRecord();
    log(c, `${cur(c).name} takes another turn.`);
    return;
  }
  beginHandover(c, ended);
  advancePlayer(c);
}

export function advancePlayer(c: Ctx): void {
  const s = c.s;
  stopTurnTimer(c);
  const n = s.players.length;
  let guard = 0;
  do {
    s.cur = (s.cur + s.dir + n) % n;
    guard++;
    if (cur(c).skipTokens > 0) {
      cur(c).skipTokens--;
      log(c, `${cur(c).name}'s turn is skipped.`);
      feed(c, `${cur(c).name}'s turn is skipped`, "info");
      continue;
    }
    break;
  } while (guard < n * 3);

  s.phase = "roll";
  s.rolled = null;
  s.seven = null;
  s.robberDue = [];
  s.turnCounter++;
  s.turnRec = freshTurnRecord();
  clearImplodeClock(c);
  s.trade = null;
  // Final sweep: a crossing can happen while the PREVIOUS turn was resolving.
  checkVictory(c);
}

/* ── what the table is waiting on ──────────────────────────────────── */
/** An answer the TABLE is owed: a discard, a robber to place, a pick to make. */
export function owesAnswer(s: GameState): boolean {
  if (s.seven) return true;
  if (s.attackDue.length) return true;
  if (s.forcedNope) return true;
  if (s.select && !s.phase.startsWith("setup")) return true;
  return false;
}

/* ── the ticks ─────────────────────────────────────────────────────── */
/** The host's clock. Carries the turn timer and the Imploding Kitten's twenty seconds. */
export function tick(c: Ctx, hidden = false): void {
  const s = c.s;
  implodeTick(c);
  if (!timerEnabled(s) || s.phase === "over") return;
  if (!s.turnTimerUntil) return;
  const now = c.now;
  const since = s.turnTickAt ? now - s.turnTickAt : TURN_TICK_MS;
  s.turnTickAt = now;
  const held = turnClockHeld(s, now, hidden);
  // Held: the deadline slides along in front of the hold. OR a late tick: time
  // that passed while nobody was running is handed back. Never both.
  if (held) s.turnTimerUntil += since;
  else if (since > TURN_TICK_SLACK) s.turnTimerUntil += since - TURN_TICK_MS;
  // A turn never has more than a turn on it.
  s.turnTimerUntil = Math.min(s.turnTimerUntil, now + s.turnSeconds * 1000);
  if (held) return;
  if (s.turnTimerUntil > now) return;
  s.turnTimerUntil = 0;
  log(c, `⏱ ${cur(c).name}'s turn timer expires.`);
  logAction(c, `⏱ ${cur(c).name} runs out of time — their turn ends`, "attack", {
    actor: s.cur, nopeable: false, notice: true, show: "timeout",
  });
  c.events.push({ type: "turnTimeout", pid: s.cur });
  doEndTurn(c);
}

function implodeTick(c: Ctx): void {
  const s = c.s;
  if (!implodeActive(s) || s.phase === "over" || !s.implodeUntil) return;
  if (implodeRevealing(s, c.now)) return;
  if (c.now < s.implodeUntil) return;
  clearImplodeClock(c);
  log(c, "The Imploding Kitten's 20 seconds are up.");
  feed(c, `⏳ ${cur(c).name}'s imploded turn runs out`, "big");
  s.implodeTurn = -1;
  if (!s.select && (s.phase === "main" || s.phase === "roll")) doEndTurn(c);
}

/* ── guards the reducer shares ─────────────────────────────────────── */
export function canRollNow(s: GameState, now: number): string | null {
  if (s.phase !== "roll") return "not the roll phase";
  if (owesAnswer(s)) return "finish the open window first";
  if (handoverActive(s, now)) return "the last turn is still open to an answer";
  return null;
}
