/* ══════════════════════════════════════════════════════════════════════
   SFX — short sounds for what just happened
   ══════════════════════════════════════════════════════════════════════
   Kenney's CC0 packs (see public/sfx/README.md), decoded once through the
   Web Audio API after the first click (browsers refuse sound before one)
   and played with a little pitch jitter so repeats do not sound stamped.
   Effects have their own volume, remembered separately from the music.
   ══════════════════════════════════════════════════════════════════════ */
import { $, h } from "./ui/dom";

export type Sfx =
  | "dice" | "seven" | "card" | "draw" | "slide" | "trade" | "build" | "robber" | "knight"
  | "nope" | "defuse" | "boom" | "implode" | "turn" | "owed" | "win" | "arm" | "drop";
/** Several files for one sound are picked from at random. */
const FILES: Record<Sfx, string[]> = {
  dice: ["dice1", "dice2", "dice3"], seven: ["seven"], card: ["card1", "card2", "card3", "card4"], draw: ["draw"], slide: ["slide"],
  trade: ["trade"], build: ["build"], robber: ["robber"], knight: ["knight"], nope: ["nope"], defuse: ["defuse"], boom: ["boom"],
  implode: ["implode"], turn: ["turn"], owed: ["owed"], win: ["win"], arm: ["arm"], drop: ["drop"],
};
/** Relative loudness per sound, so the mix sits together. */
const GAIN: Partial<Record<Sfx, number>> = { arm: 0.35, drop: 0.5, slide: 0.5, draw: 0.7, card: 0.8, build: 0.8, boom: 1, implode: 1, win: 0.9, turn: 0.7, owed: 0.7 };

const KEY = "exploding-catan:effects";
let volume = 0.6;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const lastAt = new Map<Sfx, number>();

function load(): void { try { const v = localStorage.getItem(KEY); if (v !== null) volume = Math.max(0, Math.min(1, Number(v))); } catch { /* default */ } }
function save(): void { try { localStorage.setItem(KEY, String(volume)); } catch { /* fine */ } }

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}
function fetchBuffer(name: string): Promise<AudioBuffer | null> {
  const have = buffers.get(name);
  if (have) return Promise.resolve(have);
  let p = loading.get(name);
  if (!p) {
    p = fetch(`./sfx/${name}.m4a`).then((r) => r.arrayBuffer()).then((b) => ensure()!.decodeAudioData(b)).then((buf) => { buffers.set(name, buf); return buf; }).catch(() => null);
    loading.set(name, p);
  }
  return p;
}

/** Play a sound now. Quiet when the volume is zero or before the first click. */
export function sfx(name: Sfx, opts: { gain?: number; rate?: number } = {}): void {
  if (volume === 0) return;
  const c = ensure();
  if (!c || c.state !== "running") return;
  // The same sound twice within a few frames is one sound.
  const now = performance.now();
  if (now - (lastAt.get(name) ?? 0) < 60) return;
  lastAt.set(name, now);
  const files = FILES[name];
  const file = files[Math.floor(Math.random() * files.length)];
  void fetchBuffer(file).then((buf) => {
    if (!buf || !c || !master) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    const g = c.createGain();
    g.gain.value = (GAIN[name] ?? 0.8) * (opts.gain ?? 1);
    src.connect(g).connect(master);
    src.start();
  });
}
export function setEffectsVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v)); save();
  if (master) master.gain.value = volume;
}
export function effectsVolume(): number { return volume; }

/** The slider row in the settings menu, and the first-click unlock. */
export function installSfx(): void {
  load();
  const row = $("sfxRow");
  const icon = h("span", { class: "micon" }, "🔔");
  const label = h("span", null);
  const slider = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(volume * 100)), title: "Effects volume",
    oninput: (e: Event) => { setEffectsVolume(Number((e.target as HTMLInputElement).value) / 100); paint(); sfx("arm"); } });
  const paint = () => { label.textContent = volume === 0 ? "off" : `${Math.round(volume * 100)}%`; icon.textContent = volume === 0 ? "🔕" : "🔔"; };
  paint();
  row.append(icon, h("b", null, "Effects"), slider, label);
  const unlock = () => {
    const c = ensure();
    if (c && c.state === "suspended") void c.resume();
    // Warm the common ones so the first roll is not late.
    for (const f of ["dice1", "card1", "arm", "turn"]) void fetchBuffer(f);
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}
