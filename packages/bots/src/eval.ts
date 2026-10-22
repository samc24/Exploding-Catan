/* ══════════════════════════════════════════════════════════════════════════
   EVALUATION — what the board is worth, read from PUBLIC information only
   ══════════════════════════════════════════════════════════════════════════
   Nothing in here looks inside another hand or at the deck. The bot's own
   hand is the one private thing it is entitled to, and only agent.ts reads it.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  COST, LIMIT, RES, canPlaceCity, canPlaceSettlement, longestRoadFor, publicVP, totalRes, totalVP,
  type Bundle, type BuildKind, type GameState, type Geometry, type Player, type Res,
} from "@exploding-catan/engine";
import { W } from "./weights";

export function pips(n: number | null | undefined): number {
  return n === null || n === undefined ? 0 : 6 - Math.abs(7 - n);
}
const resWeight = (t: Res): number => W[t] ?? 1;

/** Production value of a vertex, plus a bonus for how many DIFFERENT resources it touches. */
export function vertexValue(s: GameState, geo: Geometry, vid: number): number {
  const v = geo.vertices[vid];
  let score = 0;
  const kinds: Partial<Record<Res, number>> = {};
  for (const hid of v.hexes) {
    const t = s.terrain[hid];
    if (t === "desert") continue;
    const p = pips(s.numbers[hid]);
    score += p * W.pip * resWeight(t);
    kinds[t] = (kinds[t] ?? 0) + p;
  }
  score += Object.keys(kinds).length * W.diversity;
  const port = s.vport[vid];
  if (port === "3:1") score += W.portGeneric;
  else if (port) score += W.portSpecific * (kinds[port] ? 1.6 : 0.5);
  return score;
}

/** What a player already produces, in pips per resource. */
export function production(s: GameState, geo: Geometry, pid: number): Bundle {
  const out: Bundle = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  geo.vertices.forEach((v, vid) => {
    if (s.vOwner[vid] !== pid) return;
    const mult = s.vType[vid] === "city" ? 2 : 1;
    for (const hid of v.hexes) {
      const t = s.terrain[hid];
      if (t === "desert") continue;
      out[t] += pips(s.numbers[hid]) * mult;
    }
  });
  return out;
}

/** A spot is worth more when it covers resources we are short of. `have` is
    the player's production, passed in by callers that score many spots. */
export function vertexValueFor(s: GameState, geo: Geometry, vid: number, pid: number, have = production(s, geo, pid)): number {
  let score = vertexValue(s, geo, vid);
  for (const hid of geo.vertices[vid].hexes) {
    const t = s.terrain[hid];
    if (t === "desert") continue;
    if (have[t] === 0) score += W.diversity * 1.4; // brand-new resource
  }
  return score;
}

/** How threatening is this player? Visible VP plus a guess at hidden Ferals from hand SIZE. */
export function threat(s: GameState, q: Player): number {
  const hiddenGuess = q.cards.length * 0.35;
  return (publicVP(s, q) + hiddenGuess) * 10 + totalRes(q) * 0.3 + q.knights * 0.8 + q.cards.length * 0.5;
}
export function leaderId(s: GameState, exceptId: number): number | null {
  let best: number | null = null, bs = -1e9;
  for (const q of s.players) {
    if (q.id === exceptId) continue;
    const t = threat(s, q);
    if (t > bs) { bs = t; best = q.id; }
  }
  return best;
}

/** Breadth-first walk out from a player's road network. Opponent buildings block. */
export function expansionMap(s: GameState, geo: Geometry, pid: number): Map<number, number> {
  const dist = new Map<number, number>();
  const q: number[] = [];
  geo.edges.forEach((e, eid) => {
    if (s.eOwner[eid] !== pid) return;
    for (const vid of e.v) if (!dist.has(vid)) { dist.set(vid, 0); q.push(vid); }
  });
  geo.vertices.forEach((v, vid) => {
    if (s.vOwner[vid] === pid && !dist.has(vid)) { dist.set(vid, 0); q.push(vid); }
  });
  while (q.length) {
    const at = q.shift()!;
    const v = geo.vertices[at];
    if (s.vOwner[at] !== null && s.vOwner[at] !== pid) continue;
    for (const eid of v.edges) {
      if (s.eOwner[eid] !== null && s.eOwner[eid] !== pid) continue;
      const e = geo.edges[eid];
      const other = e.v[0] === at ? e.v[1] : e.v[0];
      if (!dist.has(other)) { dist.set(other, dist.get(at)! + 1); q.push(other); }
    }
  }
  return dist;
}

/** What the board is still worth to us: every spot we could still settle, discounted by distance. */
export function reachValue(s: GameState, geo: Geometry, pid: number, have = production(s, geo, pid)): number {
  const dist = expansionMap(s, geo, pid);
  let total = 0;
  for (const v of geo.vertices) {
    const d = dist.get(v.id);
    if (d === undefined || d > W.roadReachMax) continue;
    if (!canPlaceSettlement(s, geo, v.id, pid, true)) continue;
    total += vertexValueFor(s, geo, v.id, pid, have) * Math.pow(W.expansionDecay, d);
  }
  return total;
}

/** Does this road lead anywhere? Call with the edge already simulated as ours. */
export function roadGoesSomewhere(s: GameState, geo: Geometry, eid: number, pid: number): boolean {
  const e = geo.edges[eid];
  for (const vid of e.v) {
    const o = s.vOwner[vid];
    if (o !== null && o !== pid) continue;
    if (o === null && canPlaceSettlement(s, geo, vid, pid, true)) return true;
    for (const nid of geo.vertices[vid].edges) {
      if (nid === eid) continue;
      if (s.eOwner[nid] === null) return true;
    }
  }
  return false;
}

export interface Expansion { vid: number; dist: number; score: number }
/** Best place we could eventually settle, and how many roads away it is. */
export function bestExpansion(s: GameState, geo: Geometry, pid: number): Expansion | null {
  const dist = expansionMap(s, geo, pid);
  const have = production(s, geo, pid);
  let best: Expansion | null = null;
  for (const v of geo.vertices) {
    const d = dist.get(v.id);
    if (d === undefined || d > 4) continue;
    if (!canPlaceSettlement(s, geo, v.id, pid, true)) continue;
    const score = vertexValueFor(s, geo, v.id, pid, have) * Math.pow(W.expansionDecay, d);
    if (!best || score > best.score) best = { vid: v.id, dist: d, score };
  }
  return best;
}

/* ── resource planning ─────────────────────────────────────────────── */
export type Goal = BuildKind | "card";
export interface Plan { kind: Goal; value: number; need: number; eff: number }

export function shortfall(p: Player, cost: Partial<Bundle>): { need: Partial<Bundle>; total: number } {
  const need: Partial<Bundle> = {};
  let total = 0;
  for (const r of Object.keys(cost) as Res[]) {
    const miss = Math.max(0, (cost[r] ?? 0) - p.res[r]);
    if (miss) { need[r] = miss; total += miss; }
  }
  return { need, total };
}
export function uniqueCount(p: Player): number {
  return RES.filter((r) => p.res[r] > 0).length;
}

/** What is this bot saving for? Each option scored by value against resources still to find. */
export function planOptions(s: GameState, geo: Geometry, p: Player): Plan[] {
  const options: Plan[] = [];
  const cityV = geo.vertices.filter((v) => canPlaceCity(s, v.id, p.id));
  if (p.cities < LIMIT.city && cityV.length) {
    const best = cityV.reduce((a, b) => (vertexValue(s, geo, b.id) > vertexValue(s, geo, a.id) ? b : a));
    options.push({ kind: "city", value: W.vpValue + vertexValue(s, geo, best.id) * 0.45, need: shortfall(p, COST.city).total, eff: 0 });
  }
  const exp = bestExpansion(s, geo, p.id);
  if (p.settlements < LIMIT.settlement && exp) {
    if (exp.dist === 0) {
      options.push({ kind: "settlement", value: W.vpValue * W.cityBias + exp.score * 0.6, need: shortfall(p, COST.settlement).total, eff: 0 });
    } else if (p.roads < LIMIT.road) {
      options.push({ kind: "road", value: (W.vpValue + exp.score * 0.5) / (exp.dist + 1), need: shortfall(p, COST.road).total, eff: 0 });
    }
  }
  const push = publicVP(s, p) >= W.cardPushVP;
  options.push({ kind: "card", value: W.cardValue * (push ? W.cardPushMult : 1), need: Math.max(0, 3 - uniqueCount(p)), eff: 0 });
  for (const o of options) o.eff = o.value / (1 + o.need * W.needPenalty);
  options.sort((a, b) => b.eff - a.eff);
  return options;
}
/** The plan at the top of the list. Callers that already have the list pass it. */
export function goal(s: GameState, geo: Geometry, p: Player, plans = planOptions(s, geo, p)): Goal {
  return plans[0].kind;
}
export function goalCost(g: Goal): Partial<Bundle> {
  if (g === "card") return { wood: 1, brick: 1, sheep: 1 };
  return COST[g];
}
/** Which three resources to spend on a card without breaking the build plan. */
export function pickCardPayment(p: Player, g: Goal): Res[] | null {
  const cost: Partial<Bundle> = g === "card" ? {} : COST[g];
  const avail = RES.filter((r) => p.res[r] > 0);
  if (avail.length < 3) return null;
  avail.sort((a, b) => ((cost[a] ?? 0) - (cost[b] ?? 0)) || (p.res[b] - p.res[a]));
  const pay = avail.slice(0, 3);
  if (g !== "card") for (const r of pay) if (p.res[r] - 1 < (cost[r] ?? 0)) return null;
  return pay;
}
/** Resources we hold beyond what our goal needs. */
export function surplus(p: Player, g: Goal): Partial<Bundle> {
  const cost = goalCost(g);
  const out: Partial<Bundle> = {};
  for (const r of RES) {
    const spare = p.res[r] - (cost[r] ?? 0);
    if (spare > 0) out[r] = spare;
  }
  return out;
}
/** How close are we to something that actually scores? Roads and cards do not count. */
export function vpNearest(s: GameState, geo: Geometry, p: Player, plans = planOptions(s, geo, p)): number {
  const scoring = plans.filter((o) => o.kind === "settlement" || o.kind === "city");
  return scoring.length ? Math.min(...scoring.map((o) => o.need)) : 99;
}
/** Can this hand finish the game on this bot's own turn? Its own hidden points are its to see. */
export function holdsTheWin(s: GameState, geo: Geometry, p: Player, plans = planOptions(s, geo, p)): boolean {
  return vpNearest(s, geo, p, plans) === 0 && totalVP(s, p) + 1 >= s.winPoints;
}
/** Has this player VISIBLY reached the target? */
export function aboutToWin(s: GameState, q: Player): boolean {
  return publicVP(s, q) >= s.winPoints;
}

/** Choose a road by simulating it: does it open ground or lengthen our run? */
export function pickRoad(s: GameState, geo: Geometry, pid: number, candidates: number[]): number | null {
  if (!candidates.length) return null;
  const have = production(s, geo, pid); // roads do not change what we produce
  const reachBefore = reachValue(s, geo, pid, have);
  const lenBefore = longestRoadFor(s, geo, pid);
  const holder = s.longestRoad.owner;
  let rivalLen = 4;
  for (const q of s.players) {
    if (q.id === pid) continue;
    rivalLen = Math.max(rivalLen, longestRoadFor(s, geo, q.id));
  }
  const contesting = holder === pid ? rivalLen >= lenBefore - 1 : lenBefore >= rivalLen - 2;
  let best: { id: number; score: number } | null = null;
  for (const eid of candidates) {
    const sim: GameState = { ...s, eOwner: s.eOwner.slice() };
    sim.eOwner[eid] = pid;
    const reachAfter = reachValue(sim, geo, pid, have);
    const lenAfter = longestRoadFor(sim, geo, pid);
    const goes = roadGoesSomewhere(sim, geo, eid, pid);
    const opened = reachAfter - reachBefore;
    const lengthen = lenAfter - lenBefore;
    if (opened <= 0 && lengthen <= 0) continue; // pure branch — never build
    let score = opened * W.roadOpens + lengthen * (contesting ? 45 : 15);
    if (!goes) score = score * 0.25 - 10;
    if (contesting && lenAfter > rivalLen) score += 60;
    if (score <= 0) continue;
    if (!best || score > best.score) best = { id: eid, score };
  }
  return best ? best.id : null;
}

/** Where to put the robber: costs the leader the most and costs us nothing. */
export function pickRobberHex(s: GameState, geo: Geometry, pid: number, fallback: () => number): number {
  let best: { id: number; score: number } | null = null;
  for (const h of geo.hexes) {
    if (h.id === s.robber) continue;
    if (h.verts.some((v) => s.vOwner[v] === pid)) continue;
    let score = 0;
    for (const vid of h.verts) {
      const o = s.vOwner[vid];
      if (o === null || o === pid) continue;
      const mult = s.vType[vid] === "city" ? 2 : 1;
      const q = s.players[o];
      score += pips(s.numbers[h.id]) * mult * (1 + threat(s, q) / 100) * W.leaderWeight;
      score += totalRes(q) * 0.15;
    }
    if (!best || score > best.score) best = { id: h.id, score };
  }
  return best ? best.id : fallback();
}

/** Alter the Future: a high number onto one of our hexes, a low one onto theirs. */
export function pickAlterPair(s: GameState, geo: Geometry, pid: number): [number, number] | null {
  const numbered = geo.hexes.filter((h) => s.numbers[h.id] !== null);
  const mine = numbered.filter((h) => h.verts.some((v) => s.vOwner[v] === pid));
  const yours = numbered.filter((h) => h.verts.some((v) => s.vOwner[v] !== null && s.vOwner[v] !== pid) && !h.verts.some((v) => s.vOwner[v] === pid));
  if (!mine.length || !yours.length) return [numbered[0].id, numbered[1].id];
  mine.sort((a, b) => pips(s.numbers[a.id]) - pips(s.numbers[b.id]));
  yours.sort((a, b) => pips(s.numbers[b.id]) - pips(s.numbers[a.id]));
  if (pips(s.numbers[yours[0].id]) <= pips(s.numbers[mine[0].id])) return null;
  return [mine[0].id, yours[0].id];
}
