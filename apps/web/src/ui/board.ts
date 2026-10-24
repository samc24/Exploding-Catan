/* ══════════════════════════════════════════════════════════════════════
   THE BOARD — an SVG rebuilt from the state on every render
   ══════════════════════════════════════════════════════════════════════ */
import {
  geometry, canPlaceSettlement, canPlaceRoad, canPlaceCity, affordable, openingRoadLegal, owesAnswer,
  type GameState, type Geometry,
} from "@exploding-catan/engine";
import { clear, svg } from "./dom";
import { has, hexArt } from "../art";
import { COARSE } from "./tap";

export interface BoardCallbacks {
  vertex(vid: number): void;
  edge(eid: number): void;
  hex(hid: number): void;
}
export interface BoardUI {
  /** The seat this screen is acting for. */
  seat: number;
  /** Two-click confirm: what the first click armed. */
  armed: { kind: string; id: number } | null;
  /** Watching only: nothing on the board is clickable. */
  spectator?: boolean;
  /** The view: 1 is the whole board; pan is in board units. */
  zoom: number;
  panX: number;
  panY: number;
}

const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export function drawBoard(root: SVGSVGElement, s: GameState, ui: BoardUI, cb: BoardCallbacks): void {
  const geo = geometry(s.board);
  clear(root);
  const R = geo.hexSize;
  const xs = geo.vertices.map((v) => v.x), ys = geo.vertices.map((v) => v.y);
  const pad = R * 0.9;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const w = maxX - minX, hgt = maxY - minY, z = Math.max(1, ui.zoom || 1);
  const vw = w / z, vh = hgt / z;
  const vx = minX + (w - vw) / 2 + (ui.panX || 0), vy = minY + (hgt - vh) / 2 + (ui.panY || 0);
  root.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  root.dataset.extent = JSON.stringify({ w, h: hgt, x: minX, y: minY });
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const defs = svg("defs");
  root.append(defs);
  const hexLayer = svg("g"), portLayer = svg("g"), roadLayer = svg("g"), pieceLayer = svg("g"), spotLayer = svg("g");
  root.append(hexLayer, portLayer, roadLayer, pieceLayer, spotLayer);

  // ── hexes and tokens ──
  for (const hx of geo.hexes) {
    const pts = hx.verts.map((v) => `${geo.vertices[v].x},${geo.vertices[v].y}`).join(" ");
    const t = s.terrain[hx.id];
    const g = svg("g", { class: "hexg", onclick: () => cb.hex(hx.id) });
    const poly = svg("polygon", { points: pts, class: "hex" + (hx.id === s.robber ? " robbed" : ""), fill: `var(--${t})` });
    g.append(poly);
    if (has(hexArt(t))) {
      const cid = `clip${hx.id}`;
      defs.append(svg("clipPath", { id: cid }, svg("polygon", { points: pts })));
      const size = R * 2.02;
      const img = svg("image", {
        href: hexArt(t), x: hx.x - size / 2, y: hx.y - size / 2, width: size, height: size,
        "clip-path": `url(#${cid})`, preserveAspectRatio: "xMidYMid slice",
        transform: geo.turned ? `rotate(90 ${hx.x} ${hx.y})` : null,
        style: hx.id === s.robber ? { filter: "brightness(.55)" } : null,
      });
      g.append(img, svg("polygon", { points: pts, fill: "none", class: "hex" }));
    }
    const n = s.numbers[hx.id];
    if (n !== null) {
      const red = n === 6 || n === 8;
      const tok = svg("g", { class: "tok" },
        svg("circle", { cx: hx.x, cy: hx.y, r: R * 0.33 }),
        svg("text", { x: hx.x, y: hx.y - 2, class: red ? "red" : "" }, String(n)),
      );
      const pips = PIPS[n] ?? 0;
      for (let i = 0; i < pips; i++)
        tok.append(svg("circle", { class: "pips", cx: hx.x + (i - (pips - 1) / 2) * 4.2, cy: hx.y + R * 0.19, r: 1.4, fill: red ? "#c0392b" : "#333" }));
      g.append(tok);
    }
    if (hx.id === s.robber) {
      // On the token, not beside it: the token says which number is blocked, and the robber says it is.
      g.append(svg("g", { class: "robber" },
        svg("ellipse", { cx: hx.x, cy: hx.y + R * 0.1, rx: 6.5, ry: 9 }),
        svg("circle", { cx: hx.x, cy: hx.y - R * 0.12, r: 5 }),
      ));
    }
    hexLayer.append(g);
  }

  // ── ports ──
  s.eport.forEach((port, eid) => {
    if (!port) return;
    const e = geo.edges[eid];
    const a = geo.vertices[e.v[0]], b = geo.vertices[e.v[1]];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(mx, my) || 1;
    const px = mx * (1 + 22 / len), py = my * (1 + 22 / len);
    const g = svg("g", { class: "port" });
    g.append(svg("line", { x1: a.x, y1: a.y, x2: px, y2: py, stroke: "#5a6a85", "stroke-dasharray": "3 3" }));
    g.append(svg("line", { x1: b.x, y1: b.y, x2: px, y2: py, stroke: "#5a6a85", "stroke-dasharray": "3 3" }));
    g.append(svg("circle", { cx: px, cy: py, r: 12, fill: port === "3:1" ? "#1c2129" : `var(--${port})` }));
    g.append(svg("text", { x: px, y: py }, port === "3:1" ? "3:1" : "2:1"));
    portLayer.append(g);
  });

  // ── roads ──
  s.eOwner.forEach((o, eid) => {
    if (o === null) return;
    const e = geo.edges[eid];
    const a = geo.vertices[e.v[0]], b = geo.vertices[e.v[1]];
    roadLayer.append(svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "road", stroke: "#0e1116", "stroke-width": 10 }));
    roadLayer.append(svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "road", stroke: s.players[o].color }));
  });

  // ── buildings ──
  s.vOwner.forEach((o, vid) => {
    if (o === null) return;
    const v = geo.vertices[vid];
    const col = s.players[o].color;
    if (s.vType[vid] === "city") {
      pieceLayer.append(svg("path", {
        class: "piece", fill: col,
        d: `M${v.x - 11},${v.y + 8} v-10 l6,-6 l6,6 v-8 l5,-5 l5,5 v18 z`,
      }));
    } else {
      pieceLayer.append(svg("path", {
        class: "piece", fill: col,
        d: `M${v.x - 8},${v.y + 7} v-8 l8,-8 l8,8 v8 z`,
      }));
    }
  });

  // ── clickable spots for the acting seat ──
  spots(s, geo, ui, cb, spotLayer);
}

function spots(s: GameState, geo: Geometry, ui: BoardUI, cb: BoardCallbacks, layer: SVGGElement): void {
  const me = ui.seat;
  const sel = s.select;
  const armed = (kind: string, id: number) => ui.armed && ui.armed.kind === kind && ui.armed.id === id;

  const vertexSpot = (vid: number, kind: string) => {
    const v = geo.vertices[vid];
    layer.append(svg("circle", { cx: v.x, cy: v.y, r: COARSE ? 13 : 9, class: "spot" + (armed(kind, vid) ? " armed" : ""), onclick: (ev: Event) => { ev.stopPropagation(); cb.vertex(vid); } }));
  };
  const edgeSpot = (eid: number, kind: string) => {
    const e = geo.edges[eid];
    const a = geo.vertices[e.v[0]], b = geo.vertices[e.v[1]];
    const dx = b.x - a.x, dy = b.y - a.y;
    layer.append(svg("line", {
      x1: a.x + dx * 0.22, y1: a.y + dy * 0.22, x2: b.x - dx * 0.22, y2: b.y - dy * 0.22,
      class: "spot road" + (armed(kind, eid) ? " armed" : ""), onclick: (ev: Event) => { ev.stopPropagation(); cb.edge(eid); },
    }));
  };
  const hexSpot = (hid: number, kind: string) => {
    const hx = geo.hexes[hid];
    const pts = hx.verts.map((v) => `${geo.vertices[v].x},${geo.vertices[v].y}`).join(" ");
    layer.append(svg("polygon", { points: pts, class: "spot hexpick" + (armed(kind, hid) ? " armed" : ""), onclick: (ev: Event) => { ev.stopPropagation(); cb.hex(hid); } }));
  };

  if (s.phase === "over" || ui.spectator) return;

  // Setup placements belong to the current seat only.
  if (s.phase === "setup1" || s.phase === "setup2") {
    if (s.cur !== me) return;
    if (sel?.kind === "settlement") for (const v of geo.vertices) if (canPlaceSettlement(s, geo, v.id, me, true)) vertexSpot(v.id, "free");
    if (sel?.kind === "road") for (const e of geo.edges) if (canPlaceRoad(s, geo, e.id, me, sel.fromVertex)) edgeSpot(e.id, "free");
    return;
  }
  if (s.phase === "setup3") {
    if (s.roadsOwed && s.roadsOwed[me] > 0) for (const e of geo.edges) if (openingRoadLegal(s, geo, e.id, me)) edgeSpot(e.id, "free");
    return;
  }

  // Board picks owed to this seat.
  if (sel && sel.kind === "robber" && sel.actor === me) {
    for (const hx of geo.hexes) if (hx.id !== s.robber) hexSpot(hx.id, "robber");
    return;
  }
  if (sel && sel.kind === "alter" && sel.actor === me) {
    for (const hx of geo.hexes) if (s.numbers[hx.id] !== null) {
      if (sel.first === hx.id) hexSpot(hx.id, "alterfirst-armed");
      else hexSpot(hx.id, "alterb");
    }
    // The first pick is drawn armed.
    if (sel.first !== null) {
      const hx = geo.hexes[sel.first];
      const pts = hx.verts.map((v) => `${geo.vertices[v].x},${geo.vertices[v].y}`).join(" ");
      layer.append(svg("polygon", { points: pts, class: "spot hexpick armed", style: { pointerEvents: "none" } }));
    }
    return;
  }

  // Ordinary building: your turn, main phase, nothing owed.
  if (s.cur !== me || s.phase !== "main" || owesAnswer(s) || s.select) return;
  const p = s.players[me];
  if (affordable(p, "city")) for (const v of geo.vertices) if (canPlaceCity(s, v.id, me)) vertexSpot(v.id, "city");
  if (affordable(p, "settlement")) for (const v of geo.vertices) if (canPlaceSettlement(s, geo, v.id, me, false)) vertexSpot(v.id, "settlement");
  if (affordable(p, "road")) for (const e of geo.edges) if (canPlaceRoad(s, geo, e.id, me, null)) edgeSpot(e.id, "road");
}
