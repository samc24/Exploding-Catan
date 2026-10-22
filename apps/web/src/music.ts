/* The soundtrack: one track, looped for the whole session, with a volume
   slider. Browsers refuse sound before a click, so the file is not even
   fetched until the first click anywhere on the page, and playback begins
   then. The volume is remembered. */
import { $, h } from "./ui/dom";

const KEY = "exploding-catan:volume";
const SRC = "./music/theme.mp3";
const audio = new Audio();
audio.loop = true;
audio.preload = "none";
let volume = 0.4;
let armed = false;

function load(): void { try { const v = localStorage.getItem(KEY); if (v !== null) volume = Math.max(0, Math.min(1, Number(v))); } catch { /* default */ } }
function save(): void { try { localStorage.setItem(KEY, String(volume)); } catch { /* fine */ } }
function apply(): void {
  audio.volume = volume;
  if (volume === 0) { audio.pause(); return; }
  if (armed && audio.paused) { if (!audio.src) audio.src = SRC; audio.play().catch(() => { /* waits for a click */ }); }
}

export function installMusic(): void {
  load();
  const btn = $("musicBtn");
  const pop = $("musicPop");
  const slider = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(volume * 100)), title: "Volume",
    oninput: (e: Event) => { volume = Number((e.target as HTMLInputElement).value) / 100; save(); apply(); paint(); } });
  const label = h("span", null);
  pop.append(h("b", null, "Music"), slider, label);
  const paint = () => { label.textContent = volume === 0 ? "off" : `${Math.round(volume * 100)}%`; btn.textContent = volume === 0 ? "🔇" : "🎵"; };
  paint();
  btn.onclick = () => { pop.hidden = !pop.hidden; };
  document.addEventListener("pointerdown", (ev) => { if (!pop.hidden && !pop.contains(ev.target as Node) && ev.target !== btn) pop.hidden = true; });
  // The first click anywhere is the gesture the browser wants.
  const arm = () => { armed = true; apply(); document.removeEventListener("pointerdown", arm, true); document.removeEventListener("keydown", arm, true); };
  document.addEventListener("pointerdown", arm, true);
  document.addEventListener("keydown", arm, true);
}
/** For tests: what the slider is set to. */
export function currentVolume(): number { return volume; }
