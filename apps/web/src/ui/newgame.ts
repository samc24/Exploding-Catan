import { MODES, PLAYER_COLORS, PLAYER_NAMES, type GameConfig, type Mode, type BoardKey } from "@exploding-catan/engine";
import { defaultAvatar } from "@exploding-catan/protocol";
import { h } from "./dom";
import { seg as segRow } from "./controls";
import { closeModal, openModal } from "./dialogs";

const KEY = "exploding-catan:newgame";
interface Saved { names: string[]; bots: boolean[]; n: number; mode: Mode; board: BoardKey | "auto"; win: number; timer: number }
const DEFAULT: Saved = { names: ["", "", "", "", "", ""], bots: [false, true, true, true, true, true], n: 4, mode: "normal", board: "auto", win: 10, timer: 0 };

export type Preset = "bots" | "humans" | null;
export function newGameDialog(onStart: (cfg: GameConfig, botSeats: number[], seed?: number) => void, canCancel: boolean, preset: Preset = null): void {
  let st: Saved = DEFAULT;
  try { st = { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Saved>) }; } catch { /* defaults */ }
  if (!Array.isArray(st.bots) || st.bots.length < 6) st.bots = DEFAULT.bots.slice();
  // The way in from the landing page decides who sits down; the form still lets it be changed.
  if (preset === "bots") st.bots = [false, true, true, true, true, true];
  if (preset === "humans") st.bots = [false, false, false, false, false, false];
  const render = () => {
    const names = h("div", null, Array.from({ length: st.n }, (_, i) => h("label", null,
      h("span", { class: "swatch", style: { background: PLAYER_COLORS[i], borderRadius: "50%" } }),
      h("input", { type: "text", maxlength: "16", placeholder: PLAYER_NAMES[i], value: st.names[i] ?? "", oninput: (e: Event) => { st.names[i] = (e.target as HTMLInputElement).value; } }),
      h("button", { class: "sm" + (st.bots[i] ? " on" : ""), title: "Let a bot play this seat", onclick: () => { st.bots[i] = !st.bots[i]; render(); } }, st.bots[i] ? "🤖 bot" : "👤 human"),
    )));
    // Some choices change what the dialog shows (player count, the mode blurb), so set() redraws.
    const seg = <T extends string>(opts: { v: T; label: string; title?: string }[], cur: T, set: (v: T) => void) =>
      segRow(opts, () => cur, (v) => { set(v); render(); });
    const seedIn = h("input", { type: "text", placeholder: "random", style: { width: "110px" } });
    const body = h("div", null,
      h("label", null, "Players ", seg([2, 3, 4, 5, 6].map((n) => ({ v: String(n), label: String(n) })), String(st.n), (v) => { st.n = Number(v); })),
      names,
      h("label", null, "Opening ", seg((Object.keys(MODES) as Mode[]).map((m) => ({ v: m, label: MODES[m].name, title: MODES[m].blurb })), st.mode, (v) => { st.mode = v; })),
      h("p", { style: { color: "var(--dim)", fontSize: "12px", margin: "0 0 8px" } }, MODES[st.mode].blurb),
      h("label", null, "Board ", seg([{ v: "auto", label: "Auto" }, { v: "small", label: "Base (19 hexes)" }, { v: "large", label: "Extension (30 hexes)" }] as { v: BoardKey | "auto"; label: string }[], st.board, (v) => { st.board = v; })),
      h("label", null, "Play to ", seg([8, 10, 12, 15].map((n) => ({ v: String(n), label: n + " VP" })), String(st.win), (v) => { st.win = Number(v); })),
      h("label", null, "Turn clock ", seg([0, 30, 45, 60, 90].map((n) => ({ v: String(n), label: n ? n + "s" : "off" })), String(st.timer), (v) => { st.timer = Number(v); })),
      h("label", { title: "The same seed deals the same board and deck" }, "Seed ", seedIn),
    );
    const btns = [
      ...(canCancel ? [{ label: "Cancel", fn: closeModal }] : []),
      { label: "Start game", cls: "primary", fn: () => {
        localStorage.setItem(KEY, JSON.stringify(st));
        const cfg: GameConfig = {
          players: Array.from({ length: st.n }, (_, i) => ({ name: (st.names[i] || "").trim() || PLAYER_NAMES[i], avatar: defaultAvatar(i) })),
          mode: st.mode, winPoints: st.win, turnSeconds: st.timer, implodeRevealMs: 2500,
        };
        if (st.board !== "auto") cfg.board = st.board;
        const raw = seedIn.value.trim();
        const seed = raw ? (/^\d+$/.test(raw) ? Number(raw) >>> 0 : hash(raw)) : undefined;
        closeModal();
        const botSeats = Array.from({ length: st.n }, (_, i) => i).filter((i) => st.bots[i]);
        onStart(cfg, botSeats, seed);
      } },
    ];
    openModal(preset === "bots" ? "Play against bots" : preset === "humans" ? "Pass and play" : "New game", body, btns);
  };
  render();
}
function hash(s: string): number {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return x;
}
