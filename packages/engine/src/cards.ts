/* ══════════════════════════════════════════════════════════════════════
   KITTEN CARDS — buying, drawing, playing, aiming and resolving
   ══════════════════════════════════════════════════════════════════════ */
import { KITTEN, OFF_TURN, RES, TARGETED, bundleText, emptyBundle } from "./constants";
import {
  cardsFromPool, feed, findCard, heldBack, log, noteGain, player, refuse, removeCardById, totalRes, type Ctx,
} from "./state";
import { implodeActive, logAction, snapAll } from "./journal";
import { beginRobberMove, owesAnswer, settleAttackDue } from "./turn";
import { startImplodeClock } from "./clock";
import { checkVictory } from "./victory";
import type { Bundle, Card, CardKey, CardPlay, GameState, Player } from "./types";

/* ── buying ────────────────────────────────────────────────────────── */
export function buyCards(c: Ctx, p: Player, spend: Bundle): number {
  const s = c.s;
  for (const r of RES) if (spend[r] < 0 || spend[r] > p.res[r]) refuse("cannot spend what you do not hold");
  const res = cardsFromPool(spend);
  const n = Math.min(res.cards, s.deck.length);
  if (n < 1) refuse("any 3 different resources buys a card");
  for (const r of RES) { p.res[r] -= res.spent[r]; s.bank[r] += res.spent[r]; }
  c.events.push({ type: "cards", from: p.id, to: null, bundle: res.spent, hidden: false });
  for (let k = 0; k < n; k++) drawKitten(c, p);
  return n;
}

export function drawKitten(c: Ctx, p: Player): void {
  const s = c.s;
  if (!s.deck.length) { log(c, "The kitten deck is empty."); return; }
  const snapBefore = snapAll(s);
  const card = s.deck.pop()!;

  if (card.key === "implode") {
    // Fires the instant it is drawn — never enters a hand.
    log(c, `${p.name} draws the Imploding Kitten!`);
    let stolen = 0;
    for (const q of s.players) {
      if (q.id === p.id) continue;
      for (const r of RES) { p.res[r] += q.res[r]; stolen += q.res[r]; q.res[r] = 0; }
    }
    s.discard.push(card);
    s.implodeTurn = s.turnCounter;
    s.implodeBy = p.id;
    startImplodeClock(c);
    log(c, `Every other player's hand implodes into ${p.name} — ${stolen} cards taken.`);
    log(c, `${p.name}'s turn cannot be Noped, but ends in 20 seconds.`);
    logAction(c, `💥 ${p.name} draws the Imploding Kitten — takes ${stolen} resources from everyone`, "big", {
      actor: p.id, snap: snapBefore, nopeable: false, show: "implode", pileCard: card,
    });
    checkVictory(c);
    return;
  }

  card.boughtTurn = s.turnCounter;
  p.cards.push(card);
  c.events.push({ type: "kitten", pid: p.id, card: { ...card } });
  if (p.id === s.cur) s.turnRec.drawn.push(card.id);
  log(c, `${p.name} buys a kitten card.`);
  // Never name the card to the table.
  logAction(c, `${p.name} buys a kitten card (${s.deck.length} left)`, "buy", { actor: p.id, snap: snapBefore });
  if (card.key === "vp") checkVictory(c);
}

/* ── may it be played? ─────────────────────────────────────────────── */
export function playableWhenDrawn(card: Card): boolean {
  return card.key === "defuse";
}
export function cardIsPlayable(s: GameState, card: Card): boolean {
  if (card.key === "hidden") return false; // somebody else's, seen from here
  if (card.boughtTurn === s.turnCounter && !playableWhenDrawn(card)) return false;
  if (KITTEN[card.key].kind === "vp") return false;
  if (s.phase === "over" || s.phase.startsWith("setup")) return false;
  return true;
}
/** May this card be played to the pile at all, by this player, right now? */
export function canPlayToPile(s: GameState, key: CardKey, me: number): boolean {
  if (s.phase === "over" || s.phase.startsWith("setup")) return false;
  const def = KITTEN[key];
  if (!def || key === "hidden") return false;
  if (def.kind === "vp") return false;
  if (heldBack(s, key)) return false;
  if (def.kind === "response") return false; // answered, not played
  if (owesAnswer(s)) return false;
  if (me === s.cur) return true;
  // Nothing interrupts an imploded turn. Not one thing.
  if (implodeActive(s)) return false;
  return OFF_TURN.has(key);
}

/* ── playing ───────────────────────────────────────────────────────── */
export function playCard(c: Ctx, ownerId: number, cardId: number): void {
  const s = c.s;
  const p = player(c, ownerId);
  const card = findCard(p, cardId);
  if (!card) refuse("no such card in hand");
  if (!cardIsPlayable(s, card)) refuse("that card cannot be played now");
  const def = KITTEN[card.key];
  // The fast tracks' first round holds the two attacks back (see openingRound). The card does not light up; this is for whoever tries anyway.
  if (heldBack(s, card.key)) refuse(`${def.name} waits until everybody has had a turn`);
  if (!canPlayToPile(s, card.key, ownerId)) refuse(`${def.name} cannot be played now`);

  if (def.kind === "target") {
    s.select = { kind: "seat", actor: ownerId, cardId: card.id, key: card.key };
    return;
  }
  if (def.kind === "board") {
    s.select = { kind: "alter", actor: ownerId, first: null, purpose: { kind: "play", cardId: card.id } };
    log(c, `${p.name} is choosing two number tokens to swap.`);
    return;
  }
  playResolved(c, { card, actor: ownerId, target: null, payload: {} });
}

/** May this seat be chosen for whatever is currently being aimed? */
export function seatPickable(s: GameState, pid: number): boolean {
  const sel = s.select;
  if (!sel || sel.kind !== "seat") return false;
  if (pid === sel.actor) return false;
  if (s.phase === "over" || s.phase.startsWith("setup")) return false;
  if (implodeActive(s) && sel.actor !== s.cur) return false;
  return pid >= 0 && pid < s.players.length;
}

export function seatPicked(c: Ctx, target: number): void {
  const s = c.s;
  const sel = s.select;
  if (!sel || sel.kind !== "seat") refuse("nothing is being aimed");
  if (!seatPickable(s, target)) refuse("that seat cannot be chosen");
  const actor = s.players[sel.actor];
  const card = findCard(actor, sel.cardId);
  s.select = null;
  if (!card) return; // the hand moved under the question
  if (card.key === "favor") {
    s.select = { kind: "favor", actor: sel.actor, target, cardId: card.id, synthetic: false };
    return;
  }
  playResolved(c, { card, actor: sel.actor, target, payload: {} });
}

export function favorDemanded(c: Ctx, want: Bundle): void {
  const s = c.s;
  const sel = s.select;
  if (!sel || sel.kind !== "favor") refuse("no Favor is being named");
  const total = RES.reduce((t, r) => t + want[r], 0);
  if (total !== 3 || RES.some((r) => want[r] < 0)) refuse("name exactly 3 cards");
  s.select = null;
  if (sel.synthetic) {
    playResolved(c, { card: { key: "favor", id: -1, flavor: null, boughtTurn: -1, synthetic: true }, actor: sel.actor, target: sel.target, payload: { want: { ...want } } }, { quiet: true });
    return;
  }
  const actor = s.players[sel.actor];
  const card = sel.cardId === null ? undefined : findCard(actor, sel.cardId);
  if (!card) return;
  playResolved(c, { card, actor: sel.actor, target: sel.target, payload: { want: { ...want } } });
}

/** Alter the Future: two tokens, picked one at a time. Picking the first again un-picks it. */
export function alterPicked(c: Ctx, hid: number): void {
  const s = c.s;
  const sel = s.select;
  if (!sel || sel.kind !== "alter") refuse("no numbers are being swapped");
  if (s.numbers[hid] === null || s.numbers[hid] === undefined) refuse("that hex has no number");
  if (sel.first === null) { sel.first = hid; return; }
  if (sel.first === hid) { sel.first = null; return; }
  const a = sel.first, b = hid;
  s.select = null;
  if (sel.purpose.kind === "play") {
    const actor = s.players[sel.actor];
    const card = findCard(actor, sel.purpose.cardId);
    if (!card) return;
    playResolved(c, { card, actor: sel.actor, target: null, payload: { hexes: [a, b] } });
  } else {
    playResolved(c, { card: { key: "alter", id: -1, flavor: null, boughtTurn: -1, synthetic: true }, actor: sel.actor, target: null, payload: { hexes: [a, b] } }, { quiet: true });
  }
}

export function cancelSelect(c: Ctx, seat: number): void {
  const s = c.s;
  const sel = s.select;
  if (!sel) return;
  // Only a pick that was the player's own choice to start can be thought
  // better of. A robber, a victim or a reflected Defuse is owed.
  if (sel.kind === "seat" && sel.actor === seat) { s.select = null; return; }
  if (sel.kind === "alter" && sel.actor === seat && sel.purpose.kind === "play") { s.select = null; return; }
  if (sel.kind === "favor" && sel.actor === seat && !sel.synthetic) { s.select = null; return; }
  refuse("that cannot be cancelled");
}

/* ── resolution ────────────────────────────────────────────────────── */
export function describeCard(c: Ctx, base: CardPlay): string {
  const s = c.s;
  const who = s.players[base.actor].name;
  if (base.card.key === "favor" && base.payload.want) {
    const asked = bundleText(base.payload.want);
    return `${who} plays Favor on ${s.players[base.target!].name}${asked ? ` — asks for ${asked}` : ""}`;
  }
  if (base.card.key === "alter" && base.payload.hexes) {
    const [ha, hb] = base.payload.hexes;
    return `${who} plays Alter the Future: swap ${s.numbers[ha]} (${s.terrain[ha]}) ⇄ ${s.numbers[hb]} (${s.terrain[hb]})`;
  }
  const flav = base.card.flavor ? ` (${base.card.flavor})` : "";
  const tgt = base.target === null ? "" : ` on ${s.players[base.target].name}`;
  return `${who} plays ${KITTEN[base.card.key].name}${flav}${tgt}`;
}

export interface PlayOpts {
  /** Resolve without a journal entry of its own: part of somebody's reaction. */
  quiet?: boolean;
  noDefuse?: boolean;
}

/** Play a card. Nothing pauses: it resolves now and is journalled so that a
    Nope or Defuse can undo it afterwards. */
export function playResolved(c: Ctx, base: CardPlay, opts: PlayOpts = {}): void {
  const s = c.s;
  const snap = opts.quiet ? null : snapAll(s); // taken while the card is still held
  const owner = s.players[base.actor];
  if (!base.card.synthetic) {
    const taken = removeCardById(owner, base.card.id);
    if (taken) s.discard.push(taken);
  }
  const aggressive = TARGETED.has(base.card.key) || base.card.key === "alter";
  const text = describeCard(c, base);
  if (!opts.quiet) {
    logAction(c, text, aggressive ? "attack" : "info", {
      actor: base.actor, target: base.target, card: base.card, payload: base.payload, snap, show: base.card.key, log: true,
    });
  } else {
    feed(c, text, aggressive ? "attack" : "info");
    log(c, text + ".");
  }
  resolveCard(c, base, opts);
}

function resolveCard(c: Ctx, action: CardPlay, opts: PlayOpts): void {
  const s = c.s;
  const actor = s.players[action.actor];
  const target = action.target === null ? null : s.players[action.target];

  switch (action.card.key) {
    case "skip":
      target!.skipTokens++;
      log(c, `${actor.name} skips ${target!.name}'s next turn.`);
      break;

    case "explode": {
      const gone = { ...target!.res };
      let n = 0;
      c.events.push({ type: "cards", from: target!.id, to: null, bundle: gone, hidden: false });
      for (const r of RES) { n += target!.res[r]; s.bank[r] += target!.res[r]; target!.res[r] = 0; }
      log(c, `💥 ${actor.name} explodes ${target!.name} — ${n} resources returned to the bank.`);
      c.events.push({
        type: "amend",
        jid: opts.quiet ? null : lastJournalId(s),
        text: n ? `${target!.name} loses ${n} card${n === 1 ? "" : "s"} to the bank (${bundleText(gone)})` : `${target!.name} had nothing to lose`,
      });
      break;
    }

    case "attack": {
      const n = Math.min(3, totalRes(target!));
      if (n === 0) { log(c, `${target!.name} has nothing to drop.`); break; }
      log(c, `${target!.name} must drop ${n} resource${n === 1 ? "" : "s"}.`);
      // Owed as STATE, not as an open dialog.
      const je = s.journal[s.journal.length - 1];
      const jid = je && je.card && je.card.key === "attack" && je.target === target!.id ? je.id : null;
      s.attackDue.push({ pid: target!.id, n, jid });
      settleAttackDue(c);
      break;
    }

    case "favor": {
      const want = action.payload.want ?? emptyBundle();
      const handed = emptyBundle();
      const got: string[] = [];
      for (const r of RES) {
        const n = Math.min(want[r], target!.res[r]);
        if (n > 0) {
          target!.res[r] -= n; actor.res[r] += n; noteGain(c, actor, r, n);
          handed[r] = n; got.push(`${n} ${r}`);
        }
      }
      c.events.push({ type: "cards", from: target!.id, to: actor.id, bundle: handed, hidden: false });
      const asked = bundleText(want);
      log(c, got.length
        ? `${target!.name} owes ${actor.name} a favor: ${bundleText(handed)} (asked for ${asked}).`
        : `${target!.name} had none of what ${actor.name} asked for (${asked}).`);
      feed(c, got.length
        ? `${actor.name} takes ${bundleText(handed)} from ${target!.name}`
        : `${target!.name} has none of it — ${actor.name} gets nothing`, got.length ? "attack" : "info");
      break;
    }

    case "knight":
      beginRobberMove(c, actor.id, { knight: true, noDefuse: !!opts.noDefuse });
      break;

    case "alter": {
      const [ha, hb] = action.payload.hexes!;
      const na = s.numbers[ha], nb = s.numbers[hb];
      s.numbers[ha] = nb; s.numbers[hb] = na;
      log(c, `The swap takes effect: ${na} ⇄ ${nb}.`);
      break;
    }

    case "reverse":
      s.dir = s.dir === 1 ? -1 : 1;
      s.extraTurn = true;
      log(c, `${actor.name} plays Reverse — another turn, then order flips to ${s.dir === 1 ? "clockwise" : "counter-clockwise"}.`);
      break;
  }
  checkVictory(c);
}

function lastJournalId(s: GameState): number | null {
  return s.journal.length ? s.journal[s.journal.length - 1].id : null;
}
