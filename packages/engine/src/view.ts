/* ══════════════════════════════════════════════════════════════════════
   VIEWS — what one seat is allowed to see
   ══════════════════════════════════════════════════════════════════════
   The host (or server) holds the whole state. Each seat is sent its own
   cards and face-down placeholders for everyone else's, a deck of the right
   length with nothing in it, no snapshots, no dice, and nothing a robbery
   kept between the two people it was between.

   The result is still a GameState, so every query the UI makes (what is
   answerable, who owes what, what is legal) works on it unchanged. The one
   thing it cannot do is rewind: snapshots are replaced by an empty marker
   that keeps "this line is still open" true. A client never applies an
   action to a view; it sends the action to whoever holds the real state.
   ══════════════════════════════════════════════════════════════════════ */
import type { Card, GameEvent, GameState, JournalEntry, Snapshot } from "./types";

/** Stands in for a snapshot on the wire. Truthy, empty, never restored. */
export const REDACTED_SNAP = Object.freeze({}) as unknown as Snapshot;

export const hiddenCard = (id = -1): Card => ({ id, key: "hidden", flavor: null, boughtTurn: -2 });

export function redactEntry(e: JournalEntry): JournalEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { snap, stolen, fromHex, ...pub } = e;
  return { ...pub, snap: snap ? REDACTED_SNAP : null } as JournalEntry;
}

/** Redact a state for one seat. `null` is a spectator who sees nothing private. */
export function viewFor(s: GameState, seat: number | null): GameState {
  const players = s.players.map((p) => {
    const mine = p.id === seat || s.revealed;
    return { ...p, cards: mine ? p.cards.map((c) => ({ ...c })) : p.cards.map(() => hiddenCard()) };
  });
  return {
    ...s,
    seed: 0,
    rng: 0,
    players,
    deck: s.deck.map(() => hiddenCard()),
    discard: s.discard.map((c) => ({ ...c })),
    pile: s.pile.map((p) => ({ ...p, card: { ...p.card } })),
    journal: s.journal.slice(-40).map(redactEntry),
    // A trade in flight names only counts; nothing private travels in it.
    trade: s.trade ? { ...s.trade, replies: { ...s.trade.replies } } : null,
  };
}

/** Redact one action's events for one seat. A drawn card is only named to its owner. */
export function eventsFor(events: GameEvent[], seat: number | null): GameEvent[] {
  return events.flatMap((ev) => {
    if (ev.type === "kitten" && ev.pid !== seat) return [{ ...ev, card: hiddenCard(ev.card.id) }];
    if (ev.type === "cards" && ev.hidden && ev.from !== seat && ev.to !== seat)
      return [{ ...ev, bundle: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 } }];
    if (ev.type === "hint" && ev.seat !== seat) return [];
    return [ev];
  });
}
