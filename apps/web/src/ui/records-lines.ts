/* One-line summaries from the record book, for the standings and the lobby. */
import { lineup, personal, type GameRecord } from "@exploding-catan/protocol";
export { personal };
/** "This lineup: Sameer 3 · JP 2 over 5 games", or null when they have not played together. */
export function lineupLine(all: GameRecord[], names: string[]): string | null {
  if (names.length < 2) return null;
  const l = lineup(all, names);
  if (!l.games) return null;
  return `This lineup: ${names.map((n) => `${n} ${l.wins[n] ?? 0}`).join(" · ")} over ${l.games} game${l.games === 1 ? "" : "s"}`;
}
