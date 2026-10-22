/* ══════════════════════════════════════════════════════════════════════════
   THE AGENT — one bot's next action, read off the state
   ══════════════════════════════════════════════════════════════════════════
   decide() returns the single action this bot wants to take right now, or
   null when it has nothing to do. The driver chooses whose decision to apply;
   the host applies it through the engine like any other action. Nothing in
   here mutates the state.

   FAIRNESS: the bot reads only what a player at the table can see — piece
   positions, resource COUNTS, played knights, public VP, the journal — plus
   its own hand. It never inspects another hand or the deck. The test suite
   asserts this by permuting other hands and the deck and requiring the same
   decision.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  COST, KITTEN, RES, Rng, affordable, answersFor, canDefuseEntry, canNopeEntry, canNopeFor, canPlaceCity,
  canPlaceRoad, canPlaceSettlement, canPlayToPile, cardIsPlayable, canRollNow, discardOwed, entryById, geometry,
  isRobberEntry, nopeCancelsCard, openEntries, openEntry, openingRoadLegal, owesAnswer, playableWhenDrawn,
  publicVP, totalRes, tradeRate, type Action, type Bundle, type CardKey, type GameState, type Geometry,
  type JournalEntry, type Player, type Res,
} from "@exploding-catan/engine";
import {
  aboutToWin, bestExpansion, goal, goalCost, holdsTheWin, leaderId, pickAlterPair, pickCardPayment, pickRoad,
  pickRobberHex, planOptions, production, shortfall, surplus, threat, vertexValue, vertexValueFor, vpNearest,
} from "./eval";
import { W } from "./weights";

export interface Bot {
  seat: number;
  /** The bot's own dice, so a game of bots is a pure function of its seeds. */
  rng: Rng;
  lastTurn: number;
  offered: boolean;
  /** Who the card just played is for, decided before it was played. */
  aim: { cardId: number; target: number | null; want?: Bundle } | null;
}
export function createBot(seat: number, seed: number): Bot {
  return { seat, rng: new Rng(seed), lastTurn: -1, offered: false, aim: null };
}
const zero = (): Bundle => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

/** The next action for this bot, or null if nothing is wanted of it right now. */
export function decide(bot: Bot, s: GameState, now: number): Action | null {
  const geo = geometry(s.board);
  const me = s.players[bot.seat];
  if (!me || s.phase === "over") return null;
  const seat = bot.seat;

  // ── setup ──
  if (s.phase === "setup1" || s.phase === "setup2") {
    if (s.cur !== seat || !s.select) return null;
    if (s.select.kind === "settlement") { const vid = setupSettlement(s, geo, seat); return vid === null ? null : { type: "placeSettlement", seat, vid }; }
    if (s.select.kind === "road") { const eid = setupRoad(s, geo, seat, s.select.fromVertex); return eid === null ? null : { type: "placeRoad", seat, eid }; }
    return null;
  }
  if (s.phase === "setup3") {
    if (!s.roadsOwed || !(s.roadsOwed[seat] > 0)) return null;
    const eid = openingRoad(s, geo, seat);
    return eid === null ? null : { type: "placeRoad", seat, eid };
  }

  // ── obligations: a discard, the forced Nope, a reply to an offer ──
  const owed = discardOwed(s);
  if (owed && owed.pid === seat) {
    // A seven can be answered instead of paid — see answerSeven.
    const ans = answerSeven(bot, s, geo, me);
    if (ans) return ans;
    return { type: "discard", seat, bundle: chooseDiscard(s, geo, me, owed.n) };
  }
  if (s.forcedNope && s.forcedNope.pid === seat) return { type: "nopeTurn", seat };
  if (s.trade && s.trade.from !== seat && s.trade.replies[seat] === "wait")
    return { type: "answerTrade", seat, accept: considerTrade(s, geo, s.players[s.trade.from], me, s.trade.offer, s.trade.want) };

  // ── board picks owed to this bot ──
  const sel = s.select;
  if (sel && "actor" in sel && sel.actor === seat) {
    if (sel.kind === "robber") {
      const hid = pickRobberHex(s, geo, seat, () => { const alt = geo.hexes.filter((h) => h.id !== s.robber); return bot.rng.pick(alt).id; });
      return { type: "pickHex", seat, hid };
    }
    if (sel.kind === "victim") {
      const victims = sel.candidates.map((id) => s.players[id]).sort((a, b) => threat(s, b) - threat(s, a));
      return { type: "pickVictim", seat, target: victims[0].id };
    }
    if (sel.kind === "alter") {
      const numbered = geo.hexes.filter((h) => s.numbers[h.id] !== null);
      const pair = pickAlterPair(s, geo, seat) ?? [numbered[0].id, numbered[1].id];
      return { type: "pickHex", seat, hid: sel.first === null ? pair[0] : (pair[1] === sel.first ? pair[0] : pair[1]) };
    }
    if (sel.kind === "seat") {
      const target = bot.aim && bot.aim.cardId === sel.cardId ? bot.aim.target : null;
      return { type: "pickSeat", seat, target: target ?? leaderId(s, seat) ?? (seat + 1) % s.players.length };
    }
    if (sel.kind === "favor") {
      const want = bot.aim && bot.aim.want ? bot.aim.want : favorWant(s, geo, me);
      return { type: "favorDemand", seat, want };
    }
  }

  // ── reactions, on anybody's turn ──
  const react = reaction(bot, s, geo, me, now);
  if (react) return react;

  // ── my own turn ──
  if (s.cur !== seat) return null;
  if (s.phase === "roll") return canRollNow(s, now) ? null : { type: "roll", seat };
  if (s.phase !== "main" || owesAnswer(s)) return null;
  if (bot.lastTurn !== s.turnCounter) { bot.lastTurn = s.turnCounter; bot.offered = false; bot.aim = null; }

  // An offer of ours is on the table: deal with the first taker, or withdraw.
  if (s.trade && s.trade.from === seat) {
    const yes = Object.entries(s.trade.replies).find(([, r]) => r === "yes");
    if (yes) return { type: "acceptTrade", seat, with: Number(yes[0]) };
    const waiting = Object.values(s.trade.replies).some((r) => r === "wait");
    return waiting ? null : { type: "cancelTrade", seat };
  }
  return step(bot, s, geo, me, now);
}

/* ── setup choices ─────────────────────────────────────────────────── */
function setupSettlement(s: GameState, geo: Geometry, pid: number): number | null {
  let best: { vid: number; score: number } | null = null;
  for (const v of geo.vertices) {
    if (!canPlaceSettlement(s, geo, v.id, pid, true)) continue;
    const score = vertexValue(s, geo, v.id) + (s.phase === "setup2" ? vertexValueFor(s, geo, v.id, pid) * 0.5 : 0);
    if (!best || score > best.score) best = { vid: v.id, score };
  }
  return best ? best.vid : null;
}
function setupRoad(s: GameState, geo: Geometry, pid: number, fromVertex: number): number | null {
  const legal = geo.edges.filter((e) => canPlaceRoad(s, geo, e.id, pid, fromVertex));
  let best: { id: number; score: number } | null = null;
  for (const e of legal) {
    const other = e.v[0] === fromVertex ? e.v[1] : e.v[0];
    let score = 0;
    for (const nb of geo.vertices[other].adj) {
      if (s.vOwner[nb] !== null) continue;
      score = Math.max(score, vertexValue(s, geo, nb));
    }
    if (!best || score > best.score) best = { id: e.id, score };
  }
  return best ? best.id : null;
}
function openingRoad(s: GameState, geo: Geometry, pid: number): number | null {
  const legal = geo.edges.filter((e) => openingRoadLegal(s, geo, e.id, pid));
  let best: { id: number; score: number } | null = null;
  for (const e of legal) {
    let score = 0;
    for (const end of e.v) {
      if (s.vOwner[end] === pid) continue;
      for (const nb of geo.vertices[end].adj) {
        if (s.vOwner[nb] !== null) continue;
        score = Math.max(score, vertexValue(s, geo, nb));
      }
    }
    if (!best || score > best.score) best = { id: e.id, score };
  }
  return best ? best.id : null;
}

/* ── forced discards ───────────────────────────────────────────────── */
/** Shed whatever is furthest from our goal, keeping diversity: cards need three different types. */
export function chooseDiscard(s: GameState, geo: Geometry, p: Player, n: number): Bundle {
  const cost = goalCost(goal(s, geo, p));
  const pick = zero();
  let left = n;
  const order = RES.slice().sort((a, b) => {
    const ka = cost[a] ?? 0, kb = cost[b] ?? 0;
    if (ka !== kb) return ka - kb;
    return p.res[b] - p.res[a];
  });
  for (const r of order) while (left > 0 && pick[r] < p.res[r] - (p.res[r] > 1 ? 1 : 0)) { pick[r]++; left--; }
  for (const r of order) while (left > 0 && pick[r] < p.res[r]) { pick[r]++; left--; }
  return pick;
}

/* ── reactions ─────────────────────────────────────────────────────── */
/** Is this journal entry worth a Nope? Cancel a win, or protect the hand that is about to win. Nothing else. */
function nopeJournalDecision(s: GameState, geo: Geometry, p: Player, e: JournalEntry): boolean {
  const actor = s.players[e.actor];
  if (actor && actor.id !== p.id && aboutToWin(s, actor)) return true;
  if (!holdsTheWin(s, geo, p)) return false;
  if (e.kind === "roll") return e.show === "seven" && !!s.seven && s.seven.queue.includes(p.id);
  if (e.card) {
    if (e.target !== p.id) return false;
    const k = e.card.key;
    return k === "explode" || k === "attack" || k === "favor";
  }
  return false;
}
function defuseRobbery(s: GameState, p: Player, e: JournalEntry): boolean {
  const thief = s.players[e.actor];
  return e.target === p.id || (!!thief && publicVP(s, thief) >= 7);
}
const holdsKey = (p: Player, k: CardKey) => p.cards.some((c) => c.key === k);

function reaction(bot: Bot, s: GameState, geo: Geometry, p: Player, now: number): Action | null {
  const seat = bot.seat;
  const hasNope = holdsKey(p, "nope"), hasDefuse = holdsKey(p, "defuse");
  if (!hasNope && !hasDefuse) return null;
  if (s.phase.startsWith("setup")) return null;
  // Our win has just been taken off us. Answer it, every time, ahead of everything else.
  if (hasNope) {
    const mine = openEntries(s, now).find((x) => x.wonBy === seat && canNopeFor(s, x, seat, now));
    if (mine && nopeCancelsCard(s, geo, mine, seat, now)) return { type: "nope", seat, jid: mine.id };
  }
  const e = openEntry(s, now);
  if (!e) return null;
  if (hasDefuse && canDefuseEntry(s, geo, e, seat, now)) {
    if (isRobberEntry(e)) { if (defuseRobbery(s, p, e)) return { type: "defuse", seat, jid: e.id }; }
    else if (e.kind !== "roll") {
      const k = e.card ? e.card.key : null;
      if (k === "explode" || k === "attack" || k === "favor" || k === "alter") return { type: "defuse", seat, jid: e.id };
    }
  }
  if (hasNope && canNopeFor(s, e, seat, now) && nopeJournalDecision(s, geo, p, e)) {
    if (nopeCancelsCard(s, geo, e, seat, now)) return { type: "nope", seat, jid: e.id };
    if (e.actor !== seat && e.actor === s.cur && !s.phase.startsWith("setup")) return { type: "nopeTurn", seat };
  }
  return null;
}

/** Spend a card on the seven rather than pay it: a Defuse spares this hand, a Nope rethrows. */
function answerSeven(bot: Bot, s: GameState, geo: Geometry, p: Player): Action | null {
  if (!s.seven) return null;
  const e = entryById(s, s.seven.jid);
  if (!e || !canNopeEntry(s, e, 0)) return null;
  if (Math.floor(totalRes(p) / 2) < W.sevenAnswerCut) return null;
  const fresh = (k: CardKey) => p.cards.some((c) => c.key === k && (c.boughtTurn !== s.turnCounter || playableWhenDrawn(c)));
  if (fresh("defuse") && canDefuseEntry(s, geo, e, bot.seat, 0)) return { type: "defuse", seat: bot.seat, jid: e.id };
  if (fresh("nope") && holdsTheWin(s, geo, p) && canNopeFor(s, e, bot.seat, 0)) return { type: "nope", seat: bot.seat, jid: e.id };
  return null;
}

/** Three cards to demand with a Favor: what we are missing, then what we produce least. */
export function favorWant(s: GameState, geo: Geometry, p: Player): Bundle {
  const want = zero();
  const miss = shortfall(p, goalCost(goal(s, geo, p)));
  let left = 3;
  for (const r of Object.keys(miss.need) as Res[]) {
    const t = Math.min(miss.need[r] ?? 0, left);
    want[r] += t; left -= t;
    if (!left) break;
  }
  if (left) {
    const prod = production(s, geo, p.id);
    for (const r of RES.slice().sort((a, b) => prod[a] - prod[b])) { if (!left) break; want[r]++; left--; }
  }
  return want;
}

/* ── trading ───────────────────────────────────────────────────────── */
/** `to` is us. We receive `offer`, we give `want`. */
export function considerTrade(s: GameState, geo: Geometry, from: Player, to: Player, offer: Bundle, want: Bundle): boolean {
  const p = to;
  for (const r of RES) if (p.res[r] < want[r]) return false;
  const cost = goalCost(goal(s, geo, p));
  const missBefore = shortfall(p, cost).total;
  const after = zero();
  for (const r of RES) after[r] = p.res[r] + offer[r] - want[r];
  const missAfter = RES.reduce((t, r) => t + Math.max(0, (cost[r] ?? 0) - after[r]), 0);
  const uniqBefore = RES.filter((r) => p.res[r] > 0).length;
  const uniqAfter = RES.filter((r) => after[r] > 0).length;
  let gain = (missBefore - missAfter) * 2 + (uniqAfter - uniqBefore) * 1.2;
  const totalIn = RES.reduce((t, r) => t + offer[r], 0), totalOut = RES.reduce((t, r) => t + want[r], 0);
  gain += (totalIn - totalOut) * 0.5;
  if (publicVP(s, from) >= 8) gain -= 3;
  if (publicVP(s, from) >= 9) return false;
  return gain > 0;
}

/** A bank trade — but ONLY when it completes a build this turn. */
function tryBankTrade(s: GameState, geo: Geometry, p: Player): Action | null {
  for (const plan of planOptions(s, geo, p)) {
    if (plan.kind === "card") continue;
    const cost = goalCost(plan.kind);
    const miss = shortfall(p, cost);
    if (miss.total !== 1) continue;
    const need = Object.keys(miss.need)[0] as Res;
    if (s.bank[need] <= 0) continue;
    for (const r of RES) {
      if (r === need) continue;
      const rate = tradeRate(s, p, r);
      if (p.res[r] - rate < (cost[r] ?? 0)) continue;
      const give = zero(); give[r] = 1;
      const get = zero(); get[need] = 1;
      return { type: "bankTrade", seat: p.id, give, get };
    }
  }
  return null;
}
/** Offer a 1-for-1 to the table. Never feed whoever is about to win. */
function tryPlayerTrade(s: GameState, geo: Geometry, p: Player): Action | null {
  const g = goal(s, geo, p);
  const miss = shortfall(p, goalCost(g));
  if (!miss.total) return null;
  const spare = surplus(p, g);
  const spareList = RES.filter((r) => (spare[r] ?? 0) >= 1);
  if (!spareList.length) return null;
  const lead = leaderId(s, p.id);
  const partners = s.players
    .filter((q) => q.id !== p.id && totalRes(q) > 0)
    .filter((q) => !(q.id === lead && publicVP(s, q) >= 8));
  if (!partners.length) return null;
  for (const need of Object.keys(miss.need) as Res[]) {
    for (const give of spareList) {
      if (give === need) continue;
      // Somebody at the table could pay it (counts are public).
      if (!partners.some((q) => q.res[need] >= 1)) continue;
      const offer = zero(); offer[give] = 1;
      const want = zero(); want[need] = 1;
      return { type: "offerTrade", seat: p.id, offer, want };
    }
  }
  return null;
}
/** Last resort when holding too many cards: convert the deepest pile toward the plan. */
function dumpSurplus(s: GameState, geo: Geometry, p: Player): Action | null {
  const g = goal(s, geo, p);
  const cost: Partial<Bundle> = g === "card" ? {} : COST[g];
  const piles = RES.slice().sort((a, b) => p.res[b] - p.res[a]);
  for (const r of piles) {
    const rate = tradeRate(s, p, r);
    if (p.res[r] < rate) continue;
    if ((cost[r] ?? 0) > 0 && p.res[r] - rate < (cost[r] ?? 0)) continue;
    let want: Res | null = null;
    for (const n of Object.keys(cost) as Res[]) if (p.res[n] < (cost[n] ?? 0) && s.bank[n] > 0) { want = n; break; }
    if (!want) want = RES.filter((x) => x !== r && s.bank[x] > 0).sort((a, b) => p.res[a] - p.res[b])[0] ?? null;
    if (!want) continue;
    const give = zero(); give[r] = 1;
    const get = zero(); get[want] = 1;
    return { type: "bankTrade", seat: p.id, give, get };
  }
  return null;
}

/* ── cards ─────────────────────────────────────────────────────────── */
interface Play { card: { id: number; key: CardKey }; target: number | null; want?: Bundle }
/** Which card to play, and at whom: hit whoever is closest to winning, unless we want cards they hold. */
function pickCardPlay(bot: Bot, s: GameState, geo: Geometry, p: Player): Play | null {
  const playable = p.cards.filter((c) => {
    const d = KITTEN[c.key];
    return d.kind !== "vp" && d.kind !== "response" && cardIsPlayable(s, c) && canPlayToPile(s, c.key, p.id);
  });
  if (!playable.length) return null;
  const lead = leaderId(s, p.id);
  const richest = s.players.filter((q) => q.id !== p.id).sort((a, b) => totalRes(b) - totalRes(a))[0];
  const miss = shortfall(p, goalCost(goal(s, geo, p)));
  const has = (k: CardKey) => playable.find((c) => c.key === k);

  const robberOnUs = geo.hexes[s.robber].verts.some((v) => s.vOwner[v] === p.id);
  const kn = has("knight");
  if (kn && (robberOnUs || p.knights >= 2 || bot.rng.next() < 0.5)) return { card: kn, target: null };

  const fav = has("favor");
  if (fav && miss.total > 0 && richest && totalRes(richest) >= 3) {
    const want = zero();
    let left = 3;
    for (const r of Object.keys(miss.need) as Res[]) { const t = Math.min(miss.need[r] ?? 0, left); want[r] += t; left -= t; if (!left) break; }
    if (left) { const prod = production(s, geo, p.id); for (const r of RES.slice().sort((a, b) => prod[a] - prod[b])) { if (!left) break; want[r]++; left--; } }
    return { card: fav, target: richest.id, want };
  }
  const exp = has("explode");
  if (exp && lead !== null && totalRes(s.players[lead]) >= 4) return { card: exp, target: lead };
  const atk = has("attack");
  if (atk && lead !== null && totalRes(s.players[lead]) >= 3) return { card: atk, target: lead };
  const skip = has("skip");
  if (skip && lead !== null && publicVP(s, s.players[lead]) >= 6) return { card: skip, target: lead };
  const rev = has("reverse");
  if (rev) return { card: rev, target: null };
  const alt = has("alter");
  if (alt && pickAlterPair(s, geo, p.id)) return { card: alt, target: null };
  return null;
}

/* ── one atomic step of a turn ─────────────────────────────────────── */
function step(bot: Bot, s: GameState, geo: Geometry, p: Player, _now: number): Action | null {
  const seat = p.id;
  // 1. cards first — attacks and Reverse are best used before we commit resources.
  const play = pickCardPlay(bot, s, geo, p);
  if (play) {
    bot.aim = { cardId: play.card.id, target: play.target, ...(play.want ? { want: play.want } : {}) };
    return { type: "playCard", seat, cardId: play.card.id };
  }
  // 2. build in value order
  if (affordable(p, "city")) {
    const cities = geo.vertices.filter((v) => canPlaceCity(s, v.id, seat)).sort((a, b) => vertexValue(s, geo, b.id) - vertexValue(s, geo, a.id));
    if (cities.length) return { type: "placeCity", seat, vid: cities[0].id };
  }
  if (affordable(p, "settlement")) {
    const setts = geo.vertices.filter((v) => canPlaceSettlement(s, geo, v.id, seat, false)).sort((a, b) => vertexValueFor(s, geo, b.id, seat) - vertexValueFor(s, geo, a.id, seat));
    if (setts.length) return { type: "placeSettlement", seat, vid: setts[0].id };
  }
  const g = goal(s, geo, p);
  const held = totalRes(p);
  const nearest = vpNearest(s, geo, p);
  const flush = (held >= W.handLimit && nearest > W.closeToVP) || held >= W.handHardCap;
  const pushCards = publicVP(s, p) >= W.cardPushVP;
  // 3. a bank trade that finishes a build right now
  const bank = tryBankTrade(s, geo, p);
  if (bank) return bank;
  // 4. one trade offer per turn
  if (!bot.offered) {
    bot.offered = true;
    const offer = tryPlayerTrade(s, geo, p);
    if (offer) return offer;
  }
  // 5. roads — only ones that reach a settlement site or build Longest Road
  if (affordable(p, "road")) {
    const cands = geo.edges.filter((e) => canPlaceRoad(s, geo, e.id, seat, null)).map((e) => e.id);
    const eid = pickRoad(s, geo, seat, cands);
    if (eid !== null) return { type: "placeRoad", seat, eid };
  }
  // 6. kitten cards — hard in the 5+ VP band, and whenever we hold too much to survive a 7
  const canBuy = RES.filter((r) => p.res[r] > 0).length >= 3 && s.deck.length > 0;
  if (canBuy && (flush || pushCards || nearest >= 3)) {
    const pay3 = pickCardPayment(p, flush || pushCards ? "card" : g);
    if (pay3) { const spend = zero(); for (const r of pay3) spend[r] = 1; return { type: "buyCards", seat, spend }; }
  }
  // 7. hard floor: a turn must never end on a mountain of cards
  if (held >= W.handLimit) {
    if (canBuy) { const pay3 = pickCardPayment(p, "card"); if (pay3) { const spend = zero(); for (const r of pay3) spend[r] = 1; return { type: "buyCards", seat, spend }; } }
    const dump = dumpSurplus(s, geo, p);
    if (dump) return dump;
  }
  if (s.select) return null;
  return { type: "endTurn", seat };
}

export { answersFor, bestExpansion };
