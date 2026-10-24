/* ══════════════════════════════════════════════════════════════════════
   TRADING — with the bank, and an open offer to the table
   ══════════════════════════════════════════════════════════════════════ */
import { RES, bundleText, bundleTotal } from "./constants";
import { give, hasBundle, log, noteGain, player, refuse, take, tradeRate, type Ctx } from "./state";
import { logAction, snapAll } from "./journal";
import type { Bundle } from "./types";

const WANT_CAP = 6;

/** `give` is in LOTS at the player's rate; `get` in single cards. Lots and cards must match. */
export function bankTrade(c: Ctx, seat: number, giveLots: Bundle, get: Bundle): void {
  const s = c.s;
  const p = player(c, seat);
  const lots = bundleTotal(giveLots), units = bundleTotal(get);
  if (lots < 1 || lots !== units) refuse("lots and cards must match");
  const spend: Bundle = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const r of RES) {
    if (giveLots[r] < 0 || get[r] < 0) refuse("bad trade");
    spend[r] = giveLots[r] * tradeRate(s, p, r);
    if (spend[r] > p.res[r]) refuse(`not enough ${r} to give`);
  }
  // What goes out comes back in first, so the bank can always pay.
  for (const r of RES) if (get[r] > s.bank[r] + spend[r]) refuse(`the bank is out of ${r}`);
  const snapBefore = snapAll(s);
  for (const r of RES) if (spend[r]) take(c, p, r, spend[r]);
  for (const r of RES) if (get[r]) give(c, p, r, get[r]);
  log(c, `${p.name} trades with the bank.`);
  logAction(c, `${p.name} trades ${bundleText(spend)} to the bank for ${bundleText(get)}`, "info", {
    actor: seat, snap: snapBefore,
  });
}

export function offerTrade(c: Ctx, seat: number, offer: Bundle, want: Bundle): void {
  const s = c.s;
  const p = player(c, seat);
  if (s.trade) refuse("an offer is already on the table");
  const any = RES.some((r) => offer[r] > 0) || RES.some((r) => want[r] > 0);
  if (!any) refuse("offer something");
  for (const r of RES) {
    if (offer[r] < 0 || want[r] < 0 || want[r] > WANT_CAP) refuse("bad offer");
    if (offer[r] > p.res[r]) refuse(`you do not hold ${offer[r]} ${r}`);
  }
  const replies: Record<number, "wait" | "cant"> = {};
  for (const q of s.players) {
    if (q.id === seat) continue;
    replies[q.id] = hasBundle(q, want) ? "wait" : "cant";
  }
  s.trade = { from: seat, offer: { ...offer }, want: { ...want }, replies, since: c.now };
  // Kept in the log, not the feed: an offer is not an action.
  log(c, `${p.name} offers ${bundleText(offer) || "nothing"} for ${bundleText(want) || "nothing"}.`);
}

export function answerTrade(c: Ctx, seat: number, accept: boolean): void {
  const t = c.s.trade;
  if (!t) refuse("no offer to answer");
  if (seat === t.from) refuse("that is your own offer");
  if (t.replies[seat] !== "wait") refuse("you have already answered");
  t.replies[seat] = accept ? "yes" : "no";
}

/** The offerer picks who to deal with, from those who accepted. One offer, one deal. */
export function acceptTrade(c: Ctx, seat: number, withSeat: number): void {
  const s = c.s;
  const t = s.trade;
  if (!t || t.from !== seat) refuse("no offer of yours is open");
  if (t.replies[withSeat] !== "yes") refuse("they have not accepted");
  const p = player(c, seat), q = player(c, withSeat);
  // Both sides are checked for the goods first, since a Nope may have moved them.
  if (!hasBundle(q, t.want)) { t.replies[withSeat] = "cant"; refuse("they no longer have what you want"); }
  if (!hasBundle(p, t.offer)) { s.trade = null; refuse("you no longer have what you offered"); }
  const snapBefore = snapAll(s);
  for (const r of RES) {
    p.res[r] -= t.offer[r]; q.res[r] += t.offer[r]; noteGain(c, q, r, t.offer[r]);
    q.res[r] -= t.want[r]; p.res[r] += t.want[r]; noteGain(c, p, r, t.want[r]);
  }
  c.events.push({ type: "cards", from: p.id, to: q.id, bundle: { ...t.offer }, hidden: false });
  c.events.push({ type: "cards", from: q.id, to: p.id, bundle: { ...t.want }, hidden: false });
  log(c, `${p.name} ⇄ ${q.name}: gave ${bundleText(t.offer) || "nothing"} for ${bundleText(t.want) || "nothing"}.`);
  logAction(c, `${p.name} trades ${bundleText(t.offer) || "nothing"} to ${q.name} for ${bundleText(t.want) || "nothing"}`, "info", {
    actor: seat, target: withSeat, snap: snapBefore,
  });
  s.trade = null;
}

export function cancelTrade(c: Ctx, seat: number): void {
  const t = c.s.trade;
  if (!t || t.from !== seat) refuse("no offer of yours is open");
  c.s.trade = null;
}
