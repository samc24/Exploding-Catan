import { describe, expect, it } from "vitest";
import { addRecord, lineup, lineups, pairs, personal, recordOf, type GameRecord } from "../src/records";

const game = (players: string[], winner: string, at: number, bots = 0): GameRecord => ({ at, players, winner, winnerIsBot: false, bots, points: 10, mode: "normal" });

describe("records", () => {
  const log = [
    game(["Sameer", "JP"], "Sameer", 1),
    game(["Sameer", "JP"], "JP", 2),
    game(["sameer ", "jp"], "sameer ", 3), // the same two people, typed differently
    game(["Sameer", "JP", "Ben"], "Ben", 4),
    game(["Sameer"], "Blue (bot)", 5, 3),
  ];
  log[4].winnerIsBot = true;

  it("a nickname is the identity, whatever the spelling", () => {
    expect(personal(log, "SAMEER")).toEqual({ name: "SAMEER", games: 5, wins: 2, losses: 3 });
    expect(personal(log, "jp")).toEqual({ name: "jp", games: 4, wins: 1, losses: 3 });
  });
  it("a lineup is exactly these people, with or without bots, and counts who won", () => {
    const two = lineup(log, ["JP", "Sameer"]);
    expect(two.games).toBe(3);
    expect(two.wins).toEqual({ Sameer: 2, JP: 1 });
    expect(lineup(log, ["Sameer", "JP", "Ben"]).wins).toEqual({ Ben: 1 });
    expect(lineup(log, ["Sameer"]).games).toBe(1);
    expect(lineup(log, ["Sameer"]).wins).toEqual({}); // a bot took it
  });
  it("head to head counts the games both were in", () => {
    const [sj] = pairs(log, ["Sameer", "JP"]);
    expect(sj).toEqual({ a: "Sameer", b: "JP", games: 4, aWins: 2, bWins: 1 });
    expect(pairs(log, ["Sameer", "JP", "Ben"]).length).toBe(3);
  });
  it("lists every lineup seen, most played first", () => {
    const all = lineups(log);
    expect(all.map((l) => l.games)).toEqual([3, 1, 1]);
  });
  it("a line is written from the seats, people only, and nothing when there were none", () => {
    const rec = recordOf([{ name: "Ann", bot: false }, { name: "Blue (bot)", bot: true }], 1, 10, "normal", 99)!;
    expect(rec.players).toEqual(["Ann"]); expect(rec.winnerIsBot).toBe(true); expect(rec.bots).toBe(1);
    expect(recordOf([{ name: "Red (bot)", bot: true }], 0, 10, "normal")).toBeNull();
    expect(addRecord([], rec).length).toBe(1);
  });
});
