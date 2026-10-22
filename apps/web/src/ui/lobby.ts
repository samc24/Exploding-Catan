/* The online lobby: connect, make or join a room, sit, add bots, start. */
import { MODES, PLAYER_COLORS, type Mode, type BoardKey } from "@exploding-catan/engine";
import { NAME_MAX, type RoomConfig, type RoomInfo } from "@exploding-catan/protocol";
import { h } from "./dom";
import { seg } from "./controls";
import { closeModal, openModal } from "./dialogs";
import { avatarGrid, portrait } from "./avatars";
import { Net } from "../net";

/** Step one: who you are and where the server is. */
export function connectDialog(net: Net, onConnected: () => void): void {
  const nameIn = h("input", { type: "text", maxlength: String(NAME_MAX), placeholder: "Your name", value: Net.savedName() });
  const urlIn = h("input", { type: "text", placeholder: "wss://your-server", value: Net.defaultUrl(), style: { width: "260px" } });
  const status = h("p", { style: { color: "var(--dim)", fontSize: "12px", margin: "6px 0 0" } }, "");
  // With a server built into the page, all anyone types is a name (and then a room code). The
  // address stays a click away for someone running their own.
  const serverRow = h("label", { title: "The game server. Left as it is unless you are running your own." }, "Server ", urlIn);
  const builtIn = !!Net.configuredUrl();
  if (builtIn) serverRow.hidden = true;
  const change = h("p", { style: { color: "var(--dim)", fontSize: "12px", margin: "6px 0 0" } }, "Playing on our server. ",
    h("a", { href: "#", onclick: (ev: Event) => { ev.preventDefault(); serverRow.hidden = false; change.hidden = true; urlIn.focus(); } }, "Use another"));
  if (!builtIn) change.hidden = true;
  const body = h("div", null,
    h("label", null, "Name ", nameIn),
    serverRow,
    change,
    status,
  );
  // A free host sleeps when idle and takes most of a minute to wake. Knock on
  // the door as the dialog opens, so by the time a name is typed it is up.
  if (builtIn) {
    const http = Net.configuredUrl().replace(/^ws/, "http").replace(/\/$/, "") + "/health";
    status.textContent = "Waking the server…";
    const t0 = Date.now();
    fetch(http, { cache: "no-store" }).then((r) => { if (status.textContent === "Waking the server…") status.textContent = r.ok ? (Date.now() - t0 > 3000 ? "The server is awake." : "") : "The server answered oddly; try anyway."; })
      .catch(() => { if (status.textContent === "Waking the server…") status.textContent = "The server is not answering yet. Give it a minute and press Connect."; });
  }
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
export function lobbyDialog(net: Net, room: RoomInfo): void { lobbyDialogWith(net, room, false); }
function lobbyDialogWith(net: Net, room: RoomInfo, pickingNow: boolean): void {
  let picking = pickingNow;
  const seatRows = room.seats.map((s) => {
    const label = s.bot ? (s.name ?? "bot") : s.name ? (s.connected ? "" : "⌛ ") + s.name : h("i", { style: { color: "var(--dim)" } }, "empty seat");
    const face = portrait(s.avatar, PLAYER_COLORS[s.seat], s.name ?? "?", 36);
    const row = h("div", { class: "seatrow" + (s.you ? " you" : "") },
      s.you ? h("button", { class: "facebtn", title: "Choose your portrait", onclick: () => { picking = !picking; redraw(); } }, face) : face,
      h("span", { class: "lbl" }, h("b", null, label), s.bot ? h("span", { class: "tag" }, "bot") : null, s.you ? h("span", { class: "tag you" }, "you") : null),
    );
    if (!s.taken && room.seat !== s.seat) row.append(h("button", { class: "sm", onclick: () => net.sit(s.seat) }, "Sit here"));
    if (room.host && !s.taken) row.append(h("button", { class: "sm", onclick: () => net.bot(s.seat, true) }, "Add bot"));
    if (room.host && s.bot) row.append(h("button", { class: "sm", onclick: () => net.bot(s.seat, false) }, "Remove bot"));
    return row;
  });
  const empty = room.seats.filter((s) => !s.taken).length;
  const me = room.seats.find((s) => s.you);
  const redraw = () => lobbyDialogWith(net, room, picking);
  const body = h("div", null,
    h("p", { class: "sub", style: { color: "var(--dim)", margin: "0 0 8px" } }, "Read the code out to everyone. They press Play online, then Join."),
    h("div", { class: "roomcode", style: { userSelect: "text" } }, room.code),
    seatRows,
    picking && me ? h("div", { class: "pickwrap" }, h("p", { class: "sub" }, "Your portrait"), avatarGrid(me.avatar, (a) => { net.setAvatar(a); picking = false; })) : null,
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
