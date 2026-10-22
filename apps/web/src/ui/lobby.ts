/* The online lobby: connect, make or join a room, sit, add bots, start. */
import { MODES, type Mode, type BoardKey } from "@exploding-catan/engine";
import type { RoomConfig, RoomInfo } from "@exploding-catan/protocol";
import { h } from "./dom";
import { closeModal, openModal } from "./dialogs";
import { Net } from "../net";

const COLORS = ["#d94b4b", "#4b7fd9", "#e08a2e", "#e8e8e8", "#59b364", "#a86fd0"];

/** Step one: who you are and where the server is. */
export function connectDialog(net: Net, onConnected: () => void): void {
  const nameIn = h("input", { type: "text", maxlength: "16", placeholder: "Your name", value: Net.savedName() });
  const urlIn = h("input", { type: "text", placeholder: "wss://your-server", value: Net.defaultUrl(), style: { width: "260px" } });
  const status = h("p", { style: { color: "var(--dim)", fontSize: "12px", margin: "6px 0 0" } }, "");
  const body = h("div", null,
    h("label", null, "Name ", nameIn),
    h("label", { title: "The game server. Left as it is unless you are running your own." }, "Server ", urlIn),
    status,
  );
  openModal("Play online", body, [
    { label: "Cancel", fn: closeModal },
    { label: "Connect", cls: "primary", fn: async () => {
      const name = nameIn.value.trim();
      if (!name) { status.textContent = "A name, so the others know who you are."; return; }
      const url = urlIn.value.trim();
      if (!url) { status.textContent = "No server is configured for this page yet."; return; }
      status.textContent = "Connecting…";
      try { await net.connect(url, name); closeModal(); onConnected(); }
      catch (e) { status.textContent = e instanceof Error ? e.message : String(e); }
    } },
  ]);
  nameIn.focus();
}

/** Step two: a table to sit at. */
export function roomDialog(net: Net): void {
  const codeIn = h("input", { type: "text", maxlength: "4", placeholder: "CODE", style: { width: "90px", textTransform: "uppercase", letterSpacing: "3px", fontWeight: "700" } });
  let seats = 4;
  const cfg: RoomConfig = { mode: "normal", board: "auto", winPoints: 10, turnSeconds: 0 };
  const seg = <T extends string>(opts: { v: T; label: string; title?: string }[], cur: () => T, set: (v: T) => void) =>
    h("div", { class: "seg" }, opts.map((o) => { const b = h("button", { class: "sm" + (o.v === cur() ? " on" : ""), title: o.title ?? "", onclick: () => { set(o.v); for (const x of b.parentElement!.children) x.classList.toggle("on", x === b); } }, o.label); return b; }));
  const body = h("div", null,
    h("h4", { style: { margin: "0 0 6px" } }, "Join a table"),
    h("label", null, "Room code ", codeIn, h("button", { class: "primary", onclick: () => { if (codeIn.value.trim().length === 4) { closeModal(); net.join(codeIn.value); } } }, "Join")),
    h("hr", { style: { border: "0", borderTop: "1px solid var(--line)", margin: "14px 0" } }),
    h("h4", { style: { margin: "0 0 6px" } }, "Host a table"),
    h("label", null, "Seats ", seg([2, 3, 4, 5, 6].map((n) => ({ v: String(n), label: String(n) })), () => String(seats), (v) => { seats = Number(v); })),
    h("label", null, "Opening ", seg((Object.keys(MODES) as Mode[]).map((m) => ({ v: m, label: MODES[m].name, title: MODES[m].blurb })), () => cfg.mode, (v) => { cfg.mode = v; })),
    h("label", null, "Board ", seg([{ v: "auto", label: "Auto" }, { v: "small", label: "Base" }, { v: "large", label: "Extension" }] as { v: BoardKey | "auto"; label: string }[], () => cfg.board, (v) => { cfg.board = v; })),
    h("label", null, "Play to ", seg([8, 10, 12, 15].map((n) => ({ v: String(n), label: n + " VP" })), () => String(cfg.winPoints), (v) => { cfg.winPoints = Number(v); })),
    h("label", null, "Turn clock ", seg([0, 30, 45, 60, 90].map((n) => ({ v: String(n), label: n ? n + "s" : "off" })), () => String(cfg.turnSeconds), (v) => { cfg.turnSeconds = Number(v); })),
  );
  openModal(`Online as ${net.name}`, body, [
    { label: "Disconnect", fn: () => { closeModal(); net.disconnect(); } },
    { label: "Host", cls: "primary", fn: () => { closeModal(); net.create(seats, cfg); } },
  ]);
  codeIn.focus();
}

/** The table before the game starts (and after it ends): who sits where. */
export function lobbyDialog(net: Net, room: RoomInfo): void {
  const seatRows = room.seats.map((s) => {
    const label = s.bot ? "🤖 " + (s.name ?? "bot") : s.name ? (s.connected ? "" : "⌛ ") + s.name : h("i", { style: { color: "var(--dim)" } }, "empty");
    const row = h("div", { class: "counter" },
      h("span", { class: "lbl" }, h("span", { class: "swatch", style: { background: COLORS[s.seat], borderRadius: "50%" } }), h("b", null, label), s.you ? h("span", { style: { color: "var(--accent)", fontSize: "12px" } }, " (you)") : null),
    );
    if (!s.taken && room.seat !== s.seat) row.append(h("button", { class: "sm", onclick: () => net.sit(s.seat) }, "Sit here"));
    if (room.host && !s.taken) row.append(h("button", { class: "sm", onclick: () => net.bot(s.seat, true) }, "Add bot"));
    if (room.host && s.bot) row.append(h("button", { class: "sm", onclick: () => net.bot(s.seat, false) }, "Remove bot"));
    return row;
  });
  const empty = room.seats.filter((s) => !s.taken).length;
  const body = h("div", null,
    h("p", { class: "sub", style: { color: "var(--dim)", margin: "0 0 8px" } }, "Read the code out to everyone. They press Online, then Join."),
    h("div", { style: { fontSize: "34px", fontWeight: "800", letterSpacing: "8px", textAlign: "center", color: "var(--accent)", margin: "6px 0 12px", userSelect: "text" } }, room.code),
    seatRows,
    h("p", { style: { color: "var(--dim)", fontSize: "12px", marginTop: "10px" } },
      `${MODES[room.config.mode].name} · play to ${room.config.winPoints} · ${room.config.turnSeconds ? room.config.turnSeconds + "s turns" : "no clock"}`,
      room.over ? " · the game is over" : "",
      !room.host && !room.over ? " · waiting for the host to start" : ""),
  );
  openModal("Table " + room.code, body, [
    { label: "Leave", fn: () => { closeModal(); net.leave(); } },
    ...(room.seat !== null ? [{ label: "Stand up", fn: () => net.stand() }] : []),
    ...(room.host && room.over ? [{ label: "New game at this table", cls: "primary", fn: () => net.restart() }] : []),
    ...(room.host && !room.over ? [{ label: empty ? `Start (${empty} empty)` : "Start", cls: "primary", disabled: empty > 0, fn: () => net.start() }] : []),
  ]);
}
