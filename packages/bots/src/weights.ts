/* Tunable weights — the vector self-play tuning will optimise. */
export const W = {
  pip: 1.0, // value of one pip of production
  diversity: 2.6, // per distinct resource at a spot: a card costs any 3 DIFFERENT
  portSpecific: 1.3,
  portGeneric: 1.1,
  ore: 1.15, // cities win games
  wheat: 1.2, // cities and kitten cards
  sheep: 0.85,
  wood: 0.95,
  brick: 1.0,
  expansionDecay: 0.55, // value of a spot n roads away
  cityBias: 1.35, // prefer upgrading over sprawling
  leaderWeight: 1.0, // how hard to punish the leader
  vpValue: 12.0, // what one victory point is worth in plan scoring
  cardValue: 4.0, // a kitten card is a lottery ticket next to a build
  needPenalty: 1.2, // how much each still-missing resource discounts a plan
  handLimit: 7, // spend down below this — a 7 halves anything above it
  closeToVP: 1, // "very close" = this many resources short of a build
  cardPushVP: 5, // from here on, kitten cards are worth chasing hard
  cardPushMult: 2.8,
  roadReachMax: 3, // never build toward a spot further away than this
  roadOpens: 2.2, // per point of settle-value a road opens up
  handHardCap: 9, // above this, spend no matter what else is pending
  sevenAnswerCut: 5, // cards a seven must be about to take before answering it
};
export type Weights = typeof W;
