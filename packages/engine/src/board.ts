/* ══════════════════════════════════════════════════════════════════════
   BOARD GEOMETRY
   ══════════════════════════════════════════════════════════════════════
   Pure and deterministic: the lattice depends only on which board is in
   play, so it is built once per board key and shared. Coordinates are kept
   because the renderer, the bots' "which way is the coast" and the port
   placement all read them; nothing about the rules depends on pixels.
   ══════════════════════════════════════════════════════════════════════ */
import { BOARD } from "./constants";
import type { BoardKey, Port, Terrain } from "./types";
import type { Rng } from "./rng";

export interface Hex { id: number; q: number; r: number; x: number; y: number; verts: number[]; edges: number[] }
export interface Vertex { id: number; x: number; y: number; hexes: number[]; edges: number[]; adj: number[] }
export interface Edge { id: number; v: [number, number]; hexes: number[] }
export interface Geometry {
  key: BoardKey;
  hexSize: number;
  turned: boolean;
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  /** Coastal edges in angular order, where ports may sit. */
  coast: number[];
}

function hexLayout(key: BoardKey): { q: number; r: number }[] {
  const set = BOARD[key];
  const out: { q: number; r: number }[] = [];
  if (!set.rows) {
    for (let q = -2; q <= 2; q++)
      for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) out.push({ q, r });
    return out;
  }
  const mid = (set.rows.length - 1) / 2;
  set.rows.forEach((n, i) => {
    const r = i - mid;
    const qmin = Math.round(-(n - 1) / 2 - r / 2);
    for (let k = 0; k < n; k++) out.push({ q: qmin + k, r });
  });
  return out;
}

function build(key: BoardKey): Geometry {
  const set = BOARD[key];
  const size = set.size;
  const turned = !!set.turned;
  const turnPt = (x: number, y: number) => (turned ? { x: -y, y: x } : { x, y });
  const turnDeg = turned ? 90 : 0;
  const axialCenter = (q: number, r: number) => turnPt(size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r);
  const cornerPoints = (cx: number, cy: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30 + turnDeg);
      pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
    }
    return pts;
  };

  const hexes: Hex[] = [];
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  const vKey = new Map<string, number>();
  const eKey = new Map<string, number>();

  for (const a of hexLayout(key)) {
    const c = axialCenter(a.q, a.r);
    hexes.push({ id: hexes.length, q: a.q, r: a.r, x: c.x, y: c.y, verts: [], edges: [] });
  }
  for (const h of hexes) {
    const pts = cornerPoints(h.x, h.y);
    const ids = pts.map((p) => {
      // Distinct corners sit ~size px apart, so 1px quantisation dedupes safely.
      const k = Math.round(p.x) + "," + Math.round(p.y);
      let id = vKey.get(k);
      if (id === undefined) {
        id = vertices.length;
        vKey.set(k, id);
        vertices.push({ id, x: p.x, y: p.y, hexes: [], edges: [], adj: [] });
      }
      return id;
    });
    h.verts = ids;
    for (const vid of ids) vertices[vid].hexes.push(h.id);
    for (let i = 0; i < 6; i++) {
      const a = ids[i], b = ids[(i + 1) % 6];
      const k = Math.min(a, b) + "-" + Math.max(a, b);
      let eid = eKey.get(k);
      if (eid === undefined) {
        eid = edges.length;
        eKey.set(k, eid);
        edges.push({ id: eid, v: [a, b], hexes: [] });
      }
      edges[eid].hexes.push(h.id);
      h.edges.push(eid);
      if (!vertices[a].edges.includes(eid)) vertices[a].edges.push(eid);
      if (!vertices[b].edges.includes(eid)) vertices[b].edges.push(eid);
      if (!vertices[a].adj.includes(b)) vertices[a].adj.push(b);
      if (!vertices[b].adj.includes(a)) vertices[b].adj.push(a);
    }
  }
  const midOf = (e: Edge) => {
    const a = vertices[e.v[0]], b = vertices[e.v[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const coast = edges
    .filter((e) => e.hexes.length === 1)
    .sort((a, b) => {
      const am = midOf(a), bm = midOf(b);
      return Math.atan2(am.y, am.x) - Math.atan2(bm.y, bm.x);
    })
    .map((e) => e.id);
  return { key, hexSize: size, turned, hexes, vertices, edges, coast };
}

const cache = new Map<BoardKey, Geometry>();
export function geometry(key: BoardKey): Geometry {
  let g = cache.get(key);
  if (!g) { g = build(key); cache.set(key, g); }
  return g;
}

/** Spread the ports around the coast, kinds shuffled. */
export function placePorts(geo: Geometry, rng: Rng): { vport: (Port | null)[]; eport: (Port | null)[] } {
  const n = BOARD[geo.key].ports;
  const kinds: Port[] = ["wood", "brick", "sheep", "wheat", "ore"];
  while (kinds.length < n) kinds.push("3:1");
  rng.shuffle(kinds);
  const vport: (Port | null)[] = geo.vertices.map(() => null);
  const eport: (Port | null)[] = geo.edges.map(() => null);
  for (let i = 0; i < n; i++) {
    const eid = geo.coast[Math.round((i * geo.coast.length) / n) % geo.coast.length];
    eport[eid] = kinds[i];
    for (const vid of geo.edges[eid].v) vport[vid] = kinds[i];
  }
  return { vport, eport };
}

/** Deal terrain and numbers, reshuffling until no two red numbers (6/8) touch. */
export function dealTerrain(geo: Geometry, rng: Rng): { terrain: Terrain[]; numbers: (number | null)[] } {
  const set = BOARD[geo.key];
  let terrain: Terrain[] = [];
  let numbers: (number | null)[] = [];
  for (let attempt = 0; attempt < 3000; attempt++) {
    const terr = rng.shuffle(set.terrain.slice());
    const nums = rng.shuffle(set.numbers.slice());
    let n = 0;
    terrain = geo.hexes.map((_, i) => terr[i]);
    numbers = geo.hexes.map((_, i) => (terr[i] === "desert" ? null : nums[n++]));
    if (!hasAdjacentReds(geo, numbers)) break;
  }
  return { terrain, numbers };
}

export function hasAdjacentReds(geo: Geometry, numbers: (number | null)[]): boolean {
  for (const h of geo.hexes) {
    if (numbers[h.id] !== 6 && numbers[h.id] !== 8) continue;
    for (const o of geo.hexes) {
      if (o.id === h.id) continue;
      if (numbers[o.id] !== 6 && numbers[o.id] !== 8) continue;
      const shared = h.verts.filter((v) => o.verts.includes(v)).length;
      if (shared >= 2) return true;
    }
  }
  return false;
}
