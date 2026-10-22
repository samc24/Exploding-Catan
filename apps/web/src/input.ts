/* ══════════════════════════════════════════════════════════════════════
   INPUT — what a click on the board, a card or a log line means
   ══════════════════════════════════════════════════════════════════════ */
import { KITTEN, answersFor, type Card, type GameState, type JournalEntry } from "@exploding-catan/engine";
import { store } from "./store";
import { clock } from "./online";
import { act, hint, panelCb, requestRender, ui } from "./screen";
import { h } from "./ui/dom";
import { closeModal, modalOpen, openModal } from "./ui/dialogs";
import type { BoardCallbacks } from "./ui/board";

/** The board's two-click confirm: arm on the first click, act on the second. */
function armOr(kind: string, id: number, go: () => void): void {
  if (ui.armed && ui.armed.kind === kind && ui.armed.id === id) { ui.armed = null; go(); return; }
  ui.armed = { kind, id };
  requestRender();
}
export const boardCb: BoardCallbacks = {
  vertex(vid) {
    const s = store.get()!, me = ui.seat;
    if (s.phase.startsWith("setup")) { armOr("free", vid, () => act({ type: "placeSettlement", seat: me, vid })); return; }
    const city = s.vOwner[vid] === me && s.vType[vid] === "settlement";
    armOr(city ? "city" : "settlement", vid, () => act({ type: city ? "placeCity" : "placeSettlement", seat: me, vid }));
  },
  edge(eid) {
    const s = store.get()!, me = ui.seat;
    armOr(s.phase.startsWith("setup") ? "free" : "road", eid, () => act({ type: "placeRoad", seat: me, eid }));
  },
  hex(hid) {
    const s = store.get()!, me = ui.seat;
    const sel = s.select;
    if (sel && sel.kind === "robber" && sel.actor === me) { armOr("robber", hid, () => act({ type: "pickHex", seat: me, hid })); return; }
    if (sel && sel.kind === "alter" && sel.actor === me) {
      // The first token can be un-picked by clicking it again, so only the second needs confirming.
      if (sel.first === null || sel.first === hid) { act({ type: "pickHex", seat: me, hid }); return; }
      armOr("alterb", hid, () => act({ type: "pickHex", seat: me, hid }));
      return;
    }
    if (ui.armed) { ui.armed = null; requestRender(); }
  },
};

/** A card in the hand was clicked. */
export function onCard(c: Card): void {
  const me = ui.seat;
  if (c.key === "vp") { hint("A Feral Kitten is a point, never a play."); return; }
  if (c.key === "nope" || c.key === "defuse") { offerAnswers(c.key, me); return; }
  act({ type: "playCard", seat: me, cardId: c.id });
}
/** A reaction card: do the one thing it can do, or ask which. */
function offerAnswers(key: "nope" | "defuse", me: number): void {
  const s = store.get()!;
  const answers = answersFor(s, key, me, clock());
  if (!answers.length) { hint(`Nothing your ${KITTEN[key].name} can answer right now.`); return; }
  const go = (a: (typeof answers)[number]) => {
    closeModal();
    if ("turn" in a) act({ type: "nopeTurn", seat: me });
    else act({ type: key, seat: me, jid: a.jid });
  };
  if (answers.length === 1 && !("turn" in answers[0]) && !isOwnRoll(s, answers[0].jid, me)) { go(answers[0]); return; }
  openModal(`What are you ${key === "defuse" ? "Defusing" : "Noping"}?`,
    h("p", { style: { color: "var(--dim)" } }, `Your ${KITTEN[key].name} can answer ${answers.length > 1 ? "more than one thing right now. Newest first." : "this:"}`),
    [...answers.map((a) => ({ label: a.label, cls: "turn" in a ? "warn" : "", fn: () => go(a) })), { label: "Keep the card", fn: closeModal }]);
}
function isOwnRoll(s: GameState, jid: number, me: number): boolean {
  const e = s.journal.find((x) => x.id === jid);
  return !!e && e.kind === "roll" && e.actor === me;
}
/** An answerable log line was clicked. */
export function onEntry(e: JournalEntry): void {
  const s = store.get()!, me = ui.seat;
  const p = s.players[me];
  const hasNope = p.cards.some((c) => c.key === "nope"), hasDef = p.cards.some((c) => c.key === "defuse");
  const nope = hasNope ? answersFor(s, "nope", me, clock()).filter((a) => "jid" in a && a.jid === e.id) : [];
  const def = hasDef ? answersFor(s, "defuse", me, clock()).filter((a) => "jid" in a && a.jid === e.id) : [];
  if (!nope.length && !def.length) { hint("You hold nothing that answers that line."); return; }
  openModal("Answer this?", h("p", null, e.text), [
    ...(def.length ? [{ label: "🛡 Defuse it", fn: () => { closeModal(); act({ type: "defuse", seat: me, jid: e.id }); } }] : []),
    ...(nope.length ? [{ label: "🚫 Nope it", cls: "warn", fn: () => { closeModal(); act({ type: "nope", seat: me, jid: e.id }); } }] : []),
    { label: "Leave it", fn: closeModal },
  ]);
}
/** Escape backs out of whatever is most recent. */
export function installKeys(): void {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modalOpen()) { closeModal(); return; }
    if (ui.armed) { ui.armed = null; requestRender(); return; }
    if (panelCb.composer) { panelCb.composer = null; requestRender(); return; }
    const s = store.get();
    if (s && s.select && (s.select.kind === "seat" || (s.select.kind === "alter" && s.select.purpose.kind === "play"))) act({ type: "cancelSelect", seat: ui.seat });
  });
}
