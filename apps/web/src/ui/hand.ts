/* The bottom bar: whose hand this is, their resources, their kitten cards,
   and the buttons for whatever their turn allows. */
import {
  RES, RES_NAME, KITTEN, OFF_TURN, canPlayToPile, cardIsPlayable, answersFor, canRollNow, discardOwed, owesAnswer,
  playableWhenDrawn, timerEnabled, totalRes, type GameState, type Card,
} from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { cardArt, has, resArt } from "../art";
import { Tap, tap } from "./tap";

export interface HandCallbacks {
  roll(): void;
  endTurn(): void;
  buy(): void;
  bank(): void;
  trade(): void;
  card(card: Card): void;
  cancelSelect(): void;
  /** Reopen the final table after the game. */
  standings(): void;
}

export function drawBottom(root: HTMLElement, s: GameState, view: number, now: number, isBot: (pid: number) => boolean, cb: HandCallbacks, spectator = false): void {
  clear(root);
  const p = s.players[view];
  const mine = s.cur === view && !spectator;

  const who = h("div", { class: "who" },
    h("b", { style: { color: p.color } }, p.name),
    h("i", null, spectator ? "watching" : mine && s.phase !== "over" ? "your turn" : s.phase === "over" ? "game over" : `${s.players[s.cur].name} is ${isBot(s.cur) ? "thinking…" : "playing"}`),
    timerEnabled(s) && s.turnTimerUntil ? timerEl(s, now) : null,
  );

  const res = h("div", { class: "resrow" }, RES.map((r) => h("div", { class: "chip" + (p.res[r] ? "" : " zero"), title: RES_NAME[r] },
    h("span", { class: "swatch", style: has(resArt(r)) ? { backgroundImage: `url(${resArt(r)})` } : { background: `var(--${r})` } }),
    h("span", null, RES_NAME[r]), h("b", null, String(p.res[r])))));

  const hand = h("div", { class: "hand" });
  // A card that has been played and is waiting on its aim has left the hand already.
  const selB = s.select;
  const aiming = selB && "actor" in selB && selB.actor === view
    ? (selB.kind === "seat" ? selB.cardId : selB.kind === "alter" && selB.purpose.kind === "play" ? selB.purpose.cardId : selB.kind === "favor" ? selB.cardId : null)
    : null;
  for (const c of p.cards) {
    if (c.id === aiming) continue;
    const def = KITTEN[c.key];
    const isVP = c.key === "vp";
    const locked = c.boughtTurn === s.turnCounter && !isVP && !playableWhenDrawn(c);
    const reaction = c.key === "nope" || c.key === "defuse";
    const live = !locked && !isVP && (reaction
      ? cardIsPlayable(s, c) && answersFor(s, c.key as "nope" | "defuse", view, now).length > 0
      : cardIsPlayable(s, c) && canPlayToPile(s, c.key, view));
    // Playable on somebody else's turn: the red "now" pip, as in JP's game.
    const offTurn = live && !reaction && s.cur !== view && OFF_TURN.has(c.key);
    let cls = "kc";
    if (isVP) cls += " dead vp";
    else if (locked) cls += " dead locked";
    else if (live) cls += reaction ? " answer" : offTurn ? " live offturn" : " live";
    else cls += reaction ? " reaction" : " dead";
    // The last line of the tooltip is what you DO with the card, so it has to be true of the card.
    const how = isVP ? "A point while it is in your hand — it is never played."
      : locked ? "Bought this turn — drag it to the discard pile from next turn."
      : "Drag it to the discard pile to play it.";
    const pip = locked ? h("span", { class: "pip" }, "next turn")
      : isVP ? h("span", { class: "pip now" }, "1 VP")
      : live && reaction ? h("span", { class: "pip now" }, "answer")
      : offTurn ? h("span", { class: "pip now" }, "now")
      : reaction ? h("span", { class: "pip" }, "react") : null;
    const art = has(cardArt(c.key, c.flavor)) ? cardArt(c.key, c.flavor) : null;
    hand.append(h("div", { class: cls, title: `${def.name}${c.flavor ? ` · ${c.flavor}` : ""} — ${def.text}\n${how}`, dataset: { idx: String(p.cards.indexOf(c)), card: String(c.id) }, style: art ? { backgroundImage: `url(${art})` } : null, onclick: () => cb.card(c) },
      pip,
      art ? "" : def.name + (c.flavor ? ` (${c.flavor})` : "")));
  }
  if (!p.cards.length) hand.append(h("i", { style: { color: "var(--dim)", fontSize: "12px" } }, "no kitten cards"));

  const actions = h("div", { class: "actions" });
  const sel = s.select;
  if (spectator) {
    actions.append(h("span", { class: "note" }, "You are watching. A seat opens the moment somebody leaves; the Online button shows the table."));
  } else if (s.phase === "over") {
    actions.append(h("span", { class: "note" }, `${s.players[s.winner!].name} wins.`), h("button", { onclick: cb.standings }, "Final standings"));
  } else if (s.phase.startsWith("setup")) {
    if (s.phase === "setup3") actions.append(h("span", { class: "note" }, s.roadsOwed && s.roadsOwed[view] > 0 ? `Place ${s.roadsOwed[view]} opening road${s.roadsOwed[view] === 1 ? "" : "s"} on your settlements.` : "Waiting for the others to place their roads."));
    else if (mine) actions.append(h("span", { class: "note" }, sel?.kind === "road" ? "Place a road touching that settlement." : `Place a settlement: ${tap} a spot, ${tap} again to confirm.`));
    else actions.append(h("span", { class: "note" }, `${s.players[s.cur].name} is placing.`));
  } else if (sel && "actor" in sel && sel.actor === view && sel.kind !== "victim" && sel.kind !== "favor") {
    const words = sel.kind === "robber" ? `Move the robber: ${tap} a hex, ${tap} again to confirm.` :
      sel.kind === "alter" ? (sel.first === null ? "Pick the first number token to swap." : `Pick the second token (${tap} the first again to un-pick).`) :
      sel.kind === "seat" ? `${Tap} the player to aim ${KITTEN[sel.key].name} at.` : "";
    actions.append(h("span", { class: "note" }, words));
    if ((sel.kind === "seat") || (sel.kind === "alter" && sel.purpose.kind === "play")) actions.append(h("button", { class: "sm", onclick: cb.cancelSelect }, "Cancel"));
  } else if (mine && owesAnswer(s) && s.phase !== "setup3") {
    // The buttons are gated anyway; this is so the bar never reads as a game that has stopped responding.
    const owedBy = discardOwed(s);
    const other = (pid: number) => s.players[pid].name;
    const why = sel && "actor" in sel && sel.actor !== view ? `waiting for ${other(sel.actor)}…`
      : sel ? "finish the move on the board"
      : s.seven && !s.seven.queue.includes(view) ? "waiting on the seven to be paid"
      : owedBy && owedBy.pid !== view ? `waiting for ${other(owedBy.pid)}…`
      : s.forcedNope && s.forcedNope.pid !== view ? `waiting for ${other(s.forcedNope.pid)}…`
      : "finish the open window first";
    actions.append(h("span", { class: "note owed" }, "⏳ ", why));
  } else if (mine) {
    if (s.phase === "roll") {
      const why = canRollNow(s, now);
      actions.append(h("button", { class: "primary", disabled: !!why, title: why ?? "", onclick: cb.roll }, "Roll dice"));
    } else {
      const owed = owesAnswer(s);
      actions.append(
        h("button", { disabled: !canBuyCards(s, view), title: "Any 3 different resources buys a kitten card", onclick: cb.buy }, "Buy cards"),
        h("button", { disabled: owed || totalRes(p) === 0, onclick: cb.bank }, "Bank"),
        h("button", { disabled: owed || !!s.trade, onclick: cb.trade }, "Trade"),
        h("button", { class: "primary", disabled: owed || !!s.select, onclick: cb.endTurn }, "End turn"),
      );
    }
  } else {
    // On a phone the name line has no room for the status, so the note carries it (`.st`, shown there only).
    const st = h("span", { class: "st" }, `${s.players[s.cur].name} is ${isBot(s.cur) ? "thinking…" : "playing."} `);
    actions.append(h("span", { class: "note" }, st, owesAnswer(s) ? "The table is waiting on an answer." : "You can throw a Nope, Attack or Exploding Kitten on anyone's turn."));
  }

  root.append(who, res, hand, actions);
}

/** Whether this seat can buy a kitten card right now: their turn's main phase, nothing owed, three different resources, cards left. */
export function canBuyCards(s: GameState, view: number): boolean {
  const p = s.players[view];
  return s.cur === view && s.phase === "main" && !owesAnswer(s) && RES.filter((r) => p.res[r] > 0).length >= 3 && s.deck.length > 0;
}

function timerEl(s: GameState, now: number): HTMLElement {
  const left = Math.max(0, (s.turnTimerUntil - now) / 1000);
  const pct = Math.min(100, Math.max(0, (left / s.turnSeconds) * 100));
  return h("span", { class: "turntimer" }, h("span", { class: "fill", style: { width: pct + "%" } }), h("span", { class: "txt" }, `⏱ ${Math.ceil(left)}s`));
}
