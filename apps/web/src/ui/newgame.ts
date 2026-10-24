import { IMPLODE_REVEAL_MS, MODES, PLAYER_COLORS, PLAYER_NAMES, type GameConfig, type Mode, type BoardKey } from "@exploding-catan/engine";
import { h } from "./dom";
import { seg as segRow } from "./controls";
import { closeModal, openModal } from "./dialogs";
import { avatarGrid, freeAvatar, portrait } from "./avatars";

const KEY = "exploding-catan:newgame";
interface Saved { names: string[]; avatars: string[]; bots: boolean[]; n: number; mode: Mode; board: BoardKey | "auto"; win: number; timer: number }
const DEFAULT: Saved = { names: ["", "", "", "", "", ""], avatars: [], bots: [false, true, true, true, true, true], n: 4, mode: "normal", board: "auto", win: 10, timer: 0 };

export type Preset = "bots" | "humans" | null;
export function newGameDialog(onStart: (cfg: GameConfig, botSeats: number[], seed?: number) => void, canCancel: boolean, preset: Preset = null, online = false): void {
  let st: Saved = DEFAULT;
  try { st = { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Saved>) }; } catch { /* defaults */ }
  if (!Array.isArray(st.bots) || st.bots.length < 6) st.bots = DEFAULT.bots.slice();
  if (!Array.isArray(st.avatars)) st.avatars = [];
  let picking: number | null = null;
  // The way in from the landing page decides who sits down; the form still lets it be changed.
  if (preset === "bots") st.bots = [false, true, true, true, true, true];
  if (preset === "humans") st.bots = [false, false, false, false, false, false];
  const render = () => {
    // A bot is dealt a face of its own, never the one a person at this table chose. "" is None.
    const avatarOf = (i: number) => st.avatars[i] !== undefined && st.avatars[i] !== null ? st.avatars[i] : (st.bots[i] ? freeAvatar(i, st.avatars.filter(Boolean)) : freeAvatar(i, []));
    const names = h("div", null, Array.from({ length: st.n }, (_, i) => [h("label", null,
      h("button", { class: "facebtn", title: "Choose a portrait", onclick: () => { picking = picking === i ? null : i; render(); } }, portrait(avatarOf(i), PLAYER_COLORS[i], st.names[i] || PLAYER_NAMES[i], 32)),
      h("input", { type: "text", maxlength: "16", placeholder: PLAYER_NAMES[i], value: st.names[i] ?? "", oninput: (e: Event) => { st.names[i] = (e.target as HTMLInputElement).value; } }),
      h("button", { class: "sm" + (st.bots[i] ? " on" : ""), title: "Let a bot play this seat", onclick: () => { st.bots[i] = !st.bots[i]; render(); } }, st.bots[i] ? "🤖 bot" : "👤 human"),
    ), picking === i ? h("div", { class: "pickwrap" }, avatarGrid(avatarOf(i), (a) => { st.avatars[i] = a; picking = null; render(); })) : null]));
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
      h("label", { class: "allbots" }, h("input", { type: "checkbox", checked: st.bots.slice(0, st.n).every(Boolean) ? "checked" : null, onchange: (e: Event) => { const on = (e.target as HTMLInputElement).checked; st.bots = st.bots.map(() => on); render(); } }), " All bots"),
      h("label", { class: "slider" }, h("span", null, "Points to win ", h("b", { id: "ngWin" }, String(st.win))),
        h("input", { type: "range", min: "3", max: "20", value: String(st.win), oninput: (e: Event) => { st.win = Number((e.target as HTMLInputElement).value); const b = document.getElementById("ngWin"); if (b) b.textContent = String(st.win); } })),
      h("label", { class: "slider" }, h("span", null, "Turn timer ", h("b", { id: "ngTimer" }, st.timer ? `${st.timer} seconds` : "Off")),
        h("input", { type: "range", min: "0", max: "9", step: "1", value: String(st.timer ? Math.round((st.timer - 20) / 10) + 1 : 0), oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); st.timer = v ? 10 + v * 10 : 0; const b = document.getElementById("ngTimer"); if (b) b.textContent = st.timer ? `${st.timer} seconds` : "Off"; } })),
      h("p", { class: "sub", style: { color: "var(--dim)", fontSize: "12px", margin: "4px 0 0" } }, "The board, win target and timer are independent of player count."),
      online ? h("div", { class: "warnbox", style: { marginTop: "8px" } }, "You are playing in an online game. Starting one here leaves that table.") : null,
      h("label", { title: "The same seed deals the same board and deck" }, "Seed ", seedIn),
    );
    const btns = [
      ...(canCancel ? [{ label: "Cancel", fn: closeModal }] : []),
      { label: "Start game", cls: "primary", fn: () => {
        localStorage.setItem(KEY, JSON.stringify(st));
        const cfg: GameConfig = {
          players: Array.from({ length: st.n }, (_, i) => ({ name: (st.names[i] || "").trim() || PLAYER_NAMES[i], avatar: avatarOf(i) })),
          mode: st.mode, winPoints: st.win, turnSeconds: st.timer, implodeRevealMs: IMPLODE_REVEAL_MS,
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
