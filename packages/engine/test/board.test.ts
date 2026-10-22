import { describe, expect, it } from "vitest";
import { createGame, geometry, hasAdjacentReds, Rng, BOARD } from "../src";
import { cfg } from "./helpers";

describe("geometry", () => {
  it("builds the base board: 19 hexes, 54 vertices, 72 edges, 30 coastal edges", () => {
    const g = geometry("small");
    expect(g.hexes.length).toBe(19);
    expect(g.vertices.length).toBe(54);
    expect(g.edges.length).toBe(72);
    expect(g.coast.length).toBe(30);
  });
  it("builds the 5-6 player board: 30 hexes, 80 vertices, 109 edges", () => {
    const g = geometry("large");
    expect(g.hexes.length).toBe(30);
    expect(g.vertices.length).toBe(80);
    expect(g.edges.length).toBe(109);
  });
  it("every hex has six corners and six sides, shared with neighbours", () => {
    const g = geometry("small");
    for (const h of g.hexes) { expect(h.verts.length).toBe(6); expect(h.edges.length).toBe(6); }
    const inner = g.edges.filter((e) => e.hexes.length === 2).length;
    expect(inner).toBe(72 - 30);
  });
});

describe("dealing", () => {
  it("never puts two red numbers next to each other", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = createGame(cfg(4), seed);
      expect(hasAdjacentReds(geometry(s.board), s.numbers)).toBe(false);
    }
  });
  it("uses every terrain and number token exactly once", () => {
    const s = createGame(cfg(4), 7);
    expect([...s.terrain].sort()).toEqual([...BOARD.small.terrain].sort());
    expect(s.numbers.filter((n) => n !== null).sort((a, b) => a! - b!)).toEqual([...BOARD.small.numbers].sort((a, b) => a - b));
  });
  it("places 9 ports on the small board and 11 on the large", () => {
    expect(createGame(cfg(4), 3).eport.filter(Boolean).length).toBe(9);
    expect(createGame(cfg(5), 3).eport.filter(Boolean).length).toBe(11);
  });
  it("picks the large board for five players unless told otherwise", () => {
    expect(createGame(cfg(5), 1).board).toBe("large");
    expect(createGame(cfg(4), 1).board).toBe("small");
    expect(createGame(cfg(3, { board: "large" }), 1).board).toBe("large");
  });
});

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.int(1000)).toBe(b.int(1000));
  });
  it("creates identical games from identical seeds", () => {
    expect(createGame(cfg(4), 99)).toEqual(createGame(cfg(4), 99));
    expect(createGame(cfg(4), 99)).not.toEqual(createGame(cfg(4), 100));
  });
});
