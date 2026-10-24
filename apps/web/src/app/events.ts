/* ══════════════════════════════════════════════════════════════════════
   EVENTS — what one action's events mean on this screen
   ══════════════════════════════════════════════════════════════════════
   The engine says what happened; this turns it into flights, reveals,
   hints, sounds and, at the end, the standings. Runs BEFORE the render
   that moves things, so flights are measured against the old layout and
   holds are in place before a counter is drawn.
   ══════════════════════════════════════════════════════════════════════ */
import { KITTEN, discardOwed, type GameEvent, type GameState } from "@exploding-catan/engine";
import { store } from "../state/store";
import { clock, isBot } from "./online";
import { viewSeat } from "./focus";
import { feed, hint, ui } from "../state/screen";
import { openNewGame } from "./game";
import { afterShowcase, showcase } from "../ui/showcase";
import { standings } from "../ui/standings";
import { playEvents } from "../ui/fx";
import { sfx } from "../media/sfx";

/** Events from one action: flights, showcases, hints, sounds, the final table. */
export function onEvents(s: GameState, events: GameEvent[]): void {
  feed.take(events);
  // Flights are measured against the screen as it is BEFORE this render moves things.
  try { playEvents(s, events, viewSeat(s)); } catch { /* decoration only */ }
  const view = viewSeat(s), now = clock();
  const lineOf = (jid: number | null) => (jid === null ? "" : events.find((e): e is Extract<GameEvent, { type: "feed" }> => e.type === "feed" && e.jid === jid)?.text ?? "");
  for (const ev of events) {
    if (ev.type === "show") { showcase(s, ev.what, ev.pid, ev.jid, lineOf(ev.jid), view, now); soundFor(ev.what); }
    if (ev.type === "log") console.warn("engine:", ev.text);
    if (ev.type === "hint" && ev.seat === ui.seat) hint(ev.text);
    if (ev.type === "production" && ev.sources.length) sfx("slide");
    if (ev.type === "cards" && (ev.from !== null || ev.to !== null)) sfx("slide", { gain: 0.7 });
    if (ev.type === "kitten") sfx("draw");
    if (ev.type === "feed" && ev.kind === "buy" && /builds|upgrades/.test(ev.text)) sfx("build");
    if (ev.type === "feed" && ev.kind === "attack" && /moves the robber/.test(ev.text)) sfx("robber");
    if (ev.type === "feed" && ev.kind === "info" && / trades? /.test(ev.text)) sfx("trade");
    // The standings wait for the trophy to clear the middle of the board, ten seconds at the most.
    if (ev.type === "gameOver") { sfx("win"); afterShowcase(() => { const cur = store.get(); if (cur) standings(cur, () => openNewGame(true)); }, 10000); }
  }
  // A roll that was not a seven has no showcase; the dice still clatter.
  if (events.some((e) => e.type === "feed" && e.kind === "roll" && !/rolls 7 /.test(e.text))) sfx("dice");
  chimeIfMine(s);
}
/** The showcase kinds that have a sound of their own. */
function soundFor(what: string): void {
  switch (what) {
    case "seven": sfx("dice"); setTimeout(() => sfx("seven"), 350); break;
    case "nope": sfx("nope"); break;
    case "defuse": sfx("defuse"); break;
    case "explode": sfx("boom"); break;
    case "implode": sfx("implode"); setTimeout(() => sfx("boom", { rate: 0.8 }), 120); break;
    case "knight": sfx("knight"); break;
    case "win": break; // the gameOver event rings it
    case "winnoped": sfx("nope", { rate: 0.85 }); break;
    case "timeout": sfx("owed", { rate: 0.8 }); break;
    default: if (what in KITTEN) sfx("card"); // any other card played
  }
}
/* A chime when the table turns to the person at this screen: their turn
   begins, or an answer is owed by them. Once per such moment. */
let chimedFor = "";
function chimeIfMine(s: GameState): void {
  const view = viewSeat(s);
  if (isBot(view) || s.phase.startsWith("setup") && s.phase !== "setup3") { chimedFor = ""; return; }
  const owed = discardOwed(s);
  const waiting = (owed && owed.pid === view) || (s.forcedNope && s.forcedNope.pid === view) || (s.select && "actor" in s.select && s.select.actor === view && s.select.kind !== "seat" && s.select.kind !== "alter");
  const key = waiting ? `owed:${s.turnCounter}:${s.journal.length}` : s.cur === view && s.phase === "roll" ? `turn:${s.turnCounter}` : "";
  if (!key || key === chimedFor) { if (!key) chimedFor = ""; return; }
  chimedFor = key;
  sfx(waiting ? "owed" : "turn");
}

