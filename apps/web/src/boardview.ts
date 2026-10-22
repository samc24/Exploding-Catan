/* Zoom and pan: buttons, the wheel, and dragging the board's background.
   Pure screen state; a drag that moved swallows the click it would end on. */
import { requestRender, ui } from "./screen";
import { $ } from "./ui/dom";

const MAX = 3;
let panning: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
let swallowUntil = 0;

function extent(): { w: number; h: number } {
  try { return JSON.parse(($("board") as HTMLElement).dataset.extent || "") as { w: number; h: number }; } catch { return { w: 1, h: 1 }; }
}
function clampPan(): void {
  const { w, h } = extent();
  const z = ui.zoom;
  const maxX = (w - w / z) / 2, maxY = (h - h / z) / 2;
  ui.panX = Math.max(-maxX, Math.min(maxX, ui.panX));
  ui.panY = Math.max(-maxY, Math.min(maxY, ui.panY));
}
export function zoomBy(f: number): void {
  ui.zoom = Math.max(1, Math.min(MAX, ui.zoom * f));
  if (ui.zoom === 1) { ui.panX = 0; ui.panY = 0; }
  clampPan();
  requestRender();
}
export function resetZoom(): void { ui.zoom = 1; ui.panX = 0; ui.panY = 0; requestRender(); }

export function installBoardView(): void {
  const svg = $("board");
  $("zoomIn").onclick = () => zoomBy(1.25);
  $("zoomOut").onclick = () => zoomBy(1 / 1.25);
  $("zoomReset").onclick = resetZoom;
  svg.addEventListener("wheel", (ev) => { ev.preventDefault(); zoomBy(ev.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || ui.zoom === 1) return;
    panning = { x: ev.clientX, y: ev.clientY, px: ui.panX, py: ui.panY, moved: false };
  });
  svg.addEventListener("pointermove", (ev) => {
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
  const stop = () => { if (panning?.moved) swallowUntil = Date.now() + 300; panning = null; svg.classList.remove("panning"); };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);
  svg.addEventListener("click", (ev) => { if (Date.now() < swallowUntil) { ev.stopPropagation(); ev.preventDefault(); } }, true);
}
