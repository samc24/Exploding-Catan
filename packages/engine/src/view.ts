/* ══════════════════════════════════════════════════════════════════════
   VIEWS — what one seat is allowed to see
   ══════════════════════════════════════════════════════════════════════
   The host (or server) holds the whole state. Each seat is sent its own
   cards and placeholders for everyone else's, no deck, no snapshots, and
   nothing a robbery kept between the two people it was between.
   ══════════════════════════════════════════════════════════════════════ */
import type { Card, GameEvent, GameState, JournalEntry, PileEntry, Player } from "./types";

export interface PlayerView extends Omit<Player, "cards"> {
  cards: (Card | { key: "hidden"; id: number })[];
  cardCount: number;
}
export type JournalView = Omit<JournalEntry, "snap" | "stolen" | "fromHex" | "redo"> & { open?: boolean };

export interface GameView {
  seat: number | null;
  players: PlayerView[];
  deckCount: number;
  pile: PileEntry[];
  journal: JournalView[];
  state: Omit<GameState, "players" | "deck" | "discard" | "journal" | "rng" | "seed" | "log" | "pile">;
}

const HIDDEN_KEYS = new Set(["kitten"]);

/** Redact a state for one seat. `null` is a spectator who sees nothing private. */
export function viewFor(s: GameState, seat: number | null): GameView {
  const players: PlayerView[] = s.players.map((p) => {
    const mine = p.id === seat || s.revealed;
    return {
      ...p,
      cards: mine ? p.cards.map((c) => ({ ...c })) : p.cards.map((c) => ({ key: "hidden" as const, id: c.id })),
      cardCount: p.cards.length,
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { players: _p, deck, discard: _d, journal, rng: _r, seed: _s, log: _l, pile, ...rest } = s;
  return {
    seat,
    players,
    deckCount: deck.length,
    pile: pile.map((p) => ({ ...p })),
    journal: journal.slice(-24).map((e) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { snap, stolen, fromHex, redo, ...pub } = e;
      return { ...pub, open: !!snap };
    }),
    state: rest,
  };
}

/** Redact one action's events for one seat. A drawn card is only named to its owner. */
export function eventsFor(events: GameEvent[], seat: number | null): GameEvent[] {
  return events.flatMap((ev) => {
    if (ev.type === "kitten" && ev.pid !== seat) return [{ ...ev, card: { key: "hidden", id: ev.card.id } as unknown as Card }];
    if (ev.type === "cards" && ev.hidden && ev.from !== seat && ev.to !== seat)
      return [{ ...ev, bundle: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 } }];
    if (ev.type === "hint" && ev.seat !== seat) return [];
    return [ev];
  });
}
export { HIDDEN_KEYS };
