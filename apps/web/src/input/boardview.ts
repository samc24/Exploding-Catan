/* Zoom and pan: buttons, the wheel, a pinch, and dragging the board's
   background. Pure screen state; a drag that moved swallows the click it
   would end on. The wheel and the pinch zoom about the point under them. */
import { requestRender, ui } from "../state/screen";
import { $ } from "../ui/dom";

const MAX = 3;
let panning: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
/** Fingers on the board, by pointer id, for the pinch. */
const fingers = new Map<number, { x: number; y: number }>();
let pinch: { dist: number; zoom: number } | null = null;
let swallowUntil = 0;

interface Extent { w: number; h: number; x: number; y: number }
function extent(): Extent {
  try { return JSON.parse(($("board") as HTMLElement).dataset.extent || "") as Extent; } catch { return { w: 1, h: 1, x: 0, y: 0 }; }
}
const clampZoom = (z: number) => Math.max(1, Math.min(MAX, z));
function clampPan(): void {
  const { w, h } = extent();
  const z = ui.zoom;
  const maxX = (w - w / z) / 2, maxY = (h - h / z) / 2;
  ui.panX = Math.max(-maxX, Math.min(maxX, ui.panX));
  ui.panY = Math.max(-maxY, Math.min(maxY, ui.panY));
}
function zoomBy(f: number): void {
  ui.zoom = clampZoom(ui.zoom * f);
  if (ui.zoom === 1) { ui.panX = 0; ui.panY = 0; }
  clampPan();
  requestRender();
}
/** Zoom to `z` keeping the board point under the screen point (cx, cy) where it is. */
function zoomAt(z: number, cx: number, cy: number): void {
  const svg = $("board") as unknown as SVGSVGElement;
  const ctm = svg.getScreenCTM();
  const nz = clampZoom(z);
  if (!ctm || nz === 1) { ui.zoom = nz; if (nz === 1) { ui.panX = 0; ui.panY = 0; } clampPan(); requestRender(); return; }
  const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
  const vb = svg.viewBox.baseVal;
  const fx = (p.x - vb.x) / vb.width, fy = (p.y - vb.y) / vb.height;
  const { w, h, x: minX, y: minY } = extent();
  const vw = w / nz, vh = h / nz;
  ui.zoom = nz;
  ui.panX = p.x - fx * vw - minX - (w - vw) / 2;
  ui.panY = p.y - fy * vh - minY - (h - vh) / 2;
  clampPan();
  requestRender();
}
function resetZoom(): void { ui.zoom = 1; ui.panX = 0; ui.panY = 0; requestRender(); }

export function installBoardView(): void {
  const svg = $("board");
  $("zoomIn").onclick = () => zoomBy(1.25);
  $("zoomOut").onclick = () => zoomBy(1 / 1.25);
  $("zoomReset").onclick = resetZoom;
  svg.addEventListener("wheel", (ev) => { ev.preventDefault(); zoomAt(ui.zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX, ev.clientY); }, { passive: false });
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "touch") {
      fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (fingers.size === 2) {
        const [a, b] = [...fingers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: ui.zoom };
        panning = null;
        return;
      }
    }
    if (ev.button !== 0 || ui.zoom === 1) return;
    panning = { x: ev.clientX, y: ev.clientY, px: ui.panX, py: ui.panY, moved: false };
  });
  svg.addEventListener("pointermove", (ev) => {
    if (fingers.has(ev.pointerId)) fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt(pinch.zoom * (d / pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      swallowUntil = Date.now() + 400;
      return;
    }
    if (!panning) return;
    const dx = ev.clientX - panning.x, dy = ev.clientY - panning.y;
    if (!panning.moved && Math.hypot(dx, dy) < 6) return;
    panning.moved = true;
    svg.classList.add("panning");
    const { w } = extent();
    const unitsPerPx = (w / ui.zoom) / svg.clientWidth;
    ui.panX = panning.px - dx * unitsPerPx;
    ui.panY = panning.py - dy * unitsPerPx;
    clampPan();
    requestRender();
  });
  // Two taps on bare board put the view back. Two taps on a spot are a placement (arm, confirm), never a reset.
  let lastTap: { t: number; x: number; y: number } | null = null;
  svg.addEventListener("pointerup", (ev) => {
    if (ev.pointerType !== "touch" || pinch || panning?.moved) { lastTap = null; return; }
    const onSpot = ev.target instanceof Element && !!ev.target.closest(".spot");
    const now = Date.now();
    if (!onSpot && lastTap && now - lastTap.t < 320 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 30) {
      lastTap = null;
      if (ui.zoom !== 1) { resetZoom(); swallowUntil = Date.now() + 400; }
      return;
    }
    lastTap = onSpot ? null : { t: now, x: ev.clientX, y: ev.clientY };
  });
  const stop = (ev: PointerEvent) => {
    fingers.delete(ev.pointerId);
    if (fingers.size < 2 && pinch) { pinch = null; swallowUntil = Date.now() + 400; }
    if (panning?.moved) swallowUntil = Date.now() + 300;
    panning = null;
    svg.classList.remove("panning");
  };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);
  svg.addEventListener("click", (ev) => { if (Date.now() < swallowUntil) { ev.stopPropagation(); ev.preventDefault(); } }, true);
}
