/* ══════════════════════════════════════════════════════════════════════
   SETTINGS — the two switches JP's header carries: Motion and Tips
   ══════════════════════════════════════════════════════════════════════
   Motion has three settings. `full` is the game as designed. `calm` keeps
   every reveal and every card but takes the travelling out: a card is shown
   where it left and where it landed. `off` moves nothing. Reduced motion
   asked for by the OS picks calm, never off: the flights and the reveals
   are information, not decoration, and a player who has asked for less
   movement has not asked to be told less. Remembered per machine.
   ══════════════════════════════════════════════════════════════════════ */
export type Motion = "full" | "calm" | "off";
const MOTION_KEY = "exploding-catan:motion";
const TIPS_KEY = "exploding-catan:tips";
const MODES: Motion[] = ["full", "calm", "off"];

function wantsLessMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
let mode: Motion = (() => {
  try { const saved = localStorage.getItem(MOTION_KEY) as Motion | null; if (saved && MODES.includes(saved)) return saved; } catch { /* no storage */ }
  return wantsLessMotion() ? "calm" : "full";
})();
let tips = (() => { try { return localStorage.getItem(TIPS_KEY) !== "off"; } catch { return true; } })();

export function motion(): Motion { return mode; }
/** Would an animation asked for right now be seen? Motion off, or a tab nobody is looking at, means no. */
export function fxWillPlay(): boolean { return mode !== "off" && !document.hidden; }
export function applyMotion(): void {
  document.body.classList.toggle("calmfx", mode === "calm");
  document.body.classList.toggle("nofx", mode === "off");
}
export function cycleMotion(): Motion {
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  try { localStorage.setItem(MOTION_KEY, mode); } catch { /* fine */ }
  applyMotion();
  return mode;
}
export const MOTION_LABEL: Record<Motion, string> = { full: "Motion: full", calm: "Motion: calm", off: "Motion: off" };
export const MOTION_TITLE: Record<Motion, string> = {
  full: "Cards fly from where they left to where they land. Click for calm.",
  calm: "Cards are shown where they came from and where they went, without travelling. Click to stop motion entirely.",
  off: "Nothing moves — reveals and cards still appear. Click for full motion.",
};
export const MOTION_HINT: Record<Motion, string> = {
  full: "Cards fly across the screen.",
  calm: "Cards are shown at both ends without travelling.",
  off: "Nothing moves. Cards and reveals still appear.",
};

/** Whether the one-line advice is wanted at all. Somebody who turned it off knows how to play. */
export function tipsOn(): boolean { return tips; }
export function toggleTips(): boolean {
  tips = !tips;
  try { localStorage.setItem(TIPS_KEY, tips ? "on" : "off"); } catch { /* fine */ }
  return tips;
}
