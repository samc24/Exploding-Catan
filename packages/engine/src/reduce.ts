/* ══════════════════════════════════════════════════════════════════════
   THE REDUCER — one action in, a new state and its events out
   ══════════════════════════════════════════════════════════════════════
   applyAction never mutates the state it is given. It clones, runs the
   rule on the clone, and returns the clone; a rule that refuses throws,
   and the caller gets the original state back untouched. The clock comes
   in as an argument so that nothing in here ever reads the wall.
   ══════════════════════════════════════════════════════════════════════ */
import { geometry } from "./board";
import { Rng } from "./rng";
import { RuleError, affordable, canPlaceCity, canPlaceRoad, canPlaceSettlement, cur, player, type Ctx } from "./state";
import { implodeRevealing } from "./journal";
import {
  buildCity, buildRoad, buildSettlement, canRollNow, doEndTurn, doRoll, openingRoadLegal, owesAnswer, performDiscard,
  placeOpeningRoad, placeSetupRoad, placeSetupSettlement, robberPlaced, startTurnTimer, tick, victimPicked,
} from "./turn";
import { alterPicked, buyCards, cancelSelect, favorDemanded, playCard, seatPicked } from "./cards";
import { defuseEntry, nopeLine, nopeTurnNow } from "./answers";
import { acceptTrade, answerTrade, bankTrade, cancelTrade, offerTrade } from "./trade";
import type { Action, ApplyResult, GameState, SeatAction } from "./types";

/** One action in, a new state and its events out. A RuleError is a refusal
    and leaves the caller's state untouched; anything else is a bug and is
    thrown, so a server never plays on past a crash it mistook for a "no". */
export function applyAction(state: GameState, action: Action, now: number): ApplyResult {
  const s: GameState = structuredClone(state);
  const c: Ctx = { s, geo: geometry(s.board), now, events: [], rng: new Rng(s.rng) };
  try {
    dispatch(c, action);
    s.rng = c.rng.state;
    return { ok: true, state: s, events: c.events };
  } catch (err) {
    if (err instanceof RuleError) return { ok: false, error: err.message };
    throw err;
  }
}

function dispatch(c: Ctx, a: Action): void {
  const s = c.s;
  if (a.type === "tick") { tick(c, !!a.hidden); return; }
  if (s.phase === "over") throw new RuleError("the game is over");
  player(c, a.seat);
  // The Imploding Kitten is still landing: nobody may act.
  if (implodeRevealing(s, c.now)) throw new RuleError("the Imploding Kitten is landing");
  seatAction(c, a);
}

function mustBeTurn(c: Ctx, seat: number): void {
  if (c.s.cur !== seat) throw new RuleError("not your turn");
}
function mustBeMainFree(c: Ctx, seat: number): void {
  mustBeTurn(c, seat);
  if (c.s.phase !== "main") throw new RuleError("roll first");
  if (owesAnswer(c.s)) throw new RuleError("finish the open window first");
}

function seatAction(c: Ctx, a: SeatAction): void {
  const s = c.s;
  switch (a.type) {
    case "placeSettlement": {
      mustBeTurn(c, a.seat);
      if (s.select && s.select.kind === "settlement") {
        if (!canPlaceSettlement(s, c.geo, a.vid, s.cur, true)) throw new RuleError("not a legal spot");
        placeSetupSettlement(c, a.vid);
        return;
      }
      mustBeMainFree(c, a.seat);
      if (!affordable(cur(c), "settlement")) throw new RuleError("cannot afford a settlement");
      if (!canPlaceSettlement(s, c.geo, a.vid, s.cur, false)) throw new RuleError("not a legal spot");
      buildSettlement(c, a.vid);
      return;
    }
    case "placeCity": {
      mustBeMainFree(c, a.seat);
      if (!affordable(cur(c), "city")) throw new RuleError("cannot afford a city");
      if (!canPlaceCity(s, a.vid, s.cur)) throw new RuleError("not your settlement");
      buildCity(c, a.vid);
      return;
    }
    case "placeRoad": {
      if (s.phase === "setup3") {
        if (!s.roadsOwed || !(s.roadsOwed[a.seat] > 0)) throw new RuleError("you owe no road");
        if (!openingRoadLegal(s, c.geo, a.eid, a.seat)) throw new RuleError("an opening road goes on a bare settlement of yours");
        placeOpeningRoad(c, a.eid, a.seat);
        return;
      }
      mustBeTurn(c, a.seat);
      const sel = s.select;
      if (sel && sel.kind === "road") {
        if (!canPlaceRoad(s, c.geo, a.eid, s.cur, sel.fromVertex)) throw new RuleError("the road must touch the settlement you just placed");
        placeSetupRoad(c, a.eid);
        return;
      }
      mustBeMainFree(c, a.seat);
      if (!affordable(cur(c), "road")) throw new RuleError("cannot afford a road");
      if (!canPlaceRoad(s, c.geo, a.eid, s.cur, null)) throw new RuleError("not a legal spot");
      buildRoad(c, a.eid);
      return;
    }
    case "roll": {
      mustBeTurn(c, a.seat);
      const why = canRollNow(s, c.now);
      if (why) throw new RuleError(why);
      startTurnTimer(c);
      doRoll(c);
      return;
    }
    case "endTurn": {
      mustBeTurn(c, a.seat);
      if (s.phase !== "main") throw new RuleError("roll first");
      if (owesAnswer(s)) throw new RuleError("finish the open window first");
      if (s.select) throw new RuleError("finish or cancel the current board action first");
      doEndTurn(c);
      return;
    }
    case "buyCards":
      mustBeMainFree(c, a.seat);
      buyCards(c, cur(c), a.spend);
      return;
    case "bankTrade":
      mustBeMainFree(c, a.seat);
      bankTrade(c, a.seat, a.give, a.get);
      return;
    case "offerTrade":
      mustBeMainFree(c, a.seat);
      offerTrade(c, a.seat, a.offer, a.want);
      return;
    case "answerTrade":
      answerTrade(c, a.seat, a.accept);
      return;
    case "acceptTrade":
      mustBeMainFree(c, a.seat);
      acceptTrade(c, a.seat, a.with);
      return;
    case "cancelTrade":
      cancelTrade(c, a.seat);
      return;
    case "playCard":
      playCard(c, a.seat, a.cardId);
      return;
    case "pickSeat": {
      const sel = s.select;
      if (!sel || sel.kind !== "seat" || sel.actor !== a.seat) throw new RuleError("nothing of yours is being aimed");
      seatPicked(c, a.target);
      return;
    }
    case "pickHex": {
      const sel = s.select;
      if (!sel) throw new RuleError("nothing to place");
      if (sel.kind === "robber") {
        if (sel.actor !== a.seat) throw new RuleError("not your robber to move");
        robberPlaced(c, a.hid);
        return;
      }
      if (sel.kind === "alter") {
        if (sel.actor !== a.seat) throw new RuleError("not your swap to make");
        alterPicked(c, a.hid);
        return;
      }
      throw new RuleError("nothing to place on the board");
    }
    case "pickVictim": {
      const sel = s.select;
      if (!sel || sel.kind !== "victim" || sel.actor !== a.seat) throw new RuleError("no victim of yours to choose");
      victimPicked(c, a.target);
      return;
    }
    case "favorDemand": {
      const sel = s.select;
      if (!sel || sel.kind !== "favor" || sel.actor !== a.seat) throw new RuleError("no Favor of yours to name");
      favorDemanded(c, a.want);
      return;
    }
    case "discard":
      performDiscard(c, a.seat, a.bundle);
      return;
    case "nope":
      nopeLine(c, a.jid, a.seat);
      return;
    case "nopeTurn":
      nopeTurnNow(c, a.seat);
      return;
    case "defuse":
      defuseEntry(c, a.jid, a.seat);
      return;
    case "cancelSelect":
      cancelSelect(c, a.seat);
      return;
    case "setAvatar":
      player(c, a.seat).avatar = String(a.avatar).slice(0, 40);
      return;
    case "reorderHand": {
      const p = player(c, a.seat);
      if (a.from < 0 || a.from >= p.cards.length) throw new RuleError("no such card");
      const card = p.cards.splice(a.from, 1)[0];
      if (a.to === null || a.to > p.cards.length) p.cards.push(card);
      else p.cards.splice(a.to > a.from ? a.to - 1 : a.to, 0, card);
      return;
    }
  }
}

