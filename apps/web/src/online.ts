/* ══════════════════════════════════════════════════════════════════════
   ONLINE — the connection, the lobby flow, chat, and the server's clock
   ══════════════════════════════════════════════════════════════════════ */
import { PLAYER_COLORS } from "@exploding-catan/engine";
import type { RoomInfo } from "@exploding-catan/protocol";
import { Net } from "./net";
import { store } from "./store";
import { localBot, stopBots } from "./bots-host";
import { showEmote } from "./emotes";
import { $, clear, h } from "./ui/dom";
import { closeModal, modalOpen } from "./ui/dialogs";
import { connectDialog, lobbyDialog, roomDialog } from "./ui/lobby";
import { hint, onNoGame, requestRender } from "./screen";

const ONLINE_KEY = "exploding-catan:online";
let lobbyShowing = false;
const chatLines: { name: string; text: string; seat: number | null }[] = [];

/** The clock every window is judged by: the server's when online, else ours. */
export function clock(): number { return net.online ? net.now() : Date.now(); }
/** Online the room says who is a bot; locally the table does. */
export function isBot(seat: number): boolean { return net.online ? !!net.room?.seats[seat]?.bot : localBot(seat); }

/** Back to a local table: forget the room's state, show the saved game or the New Game dialog. */
export function goLocal(): void {
  stopBots();
  store.remote = null;
  store.clear();
  chatLines.length = 0;
  $("chatTab").hidden = true;
  try { localStorage.removeItem(ONLINE_KEY); } catch { /* fine */ }
  if (!store.restore()) onNoGame();
  else requestRender();
}
export function drawChat(): void {
  const log = $("chatlog");
  clear(log);
  for (const l of chatLines.slice(-80)) log.append(h("div", null, h("b", { style: { color: l.seat !== null ? PLAYER_COLORS[l.seat] : "var(--dim)" } }, l.name), l.text));
  log.scrollTop = log.scrollHeight;
}

export const net = new Net({
  room(room: RoomInfo | null) {
    if (!room) { if (lobbyShowing) { closeModal(); lobbyShowing = false; } goLocal(); if (net.connected) roomDialog(net); return; }
    stopBots();
    try { localStorage.setItem(ONLINE_KEY, "1"); } catch { /* fine */ }
    $("chatTab").hidden = false;
    store.remote = (a) => net.action(a);
    if (!room.started || room.over) {
      // The table, open until the host starts. Redrawn on every change.
      if (!room.over || !store.get() || lobbyShowing || !modalOpen()) { lobbyDialog(net, room); lobbyShowing = true; }
    } else if (lobbyShowing) { closeModal(); lobbyShowing = false; }
    if (!room.started) store.clear();
    requestRender();
  },
  state(s, events) { store.receive(s, events); },
  clock(p) { store.patchClock(p); },
  chat(seat, name, text) { chatLines.push({ seat, name, text }); drawChat(); if ($("chat").hidden) $("chatTab").classList.add("on"); },
  emote(seat, emoji) { showEmote(seat, emoji); },
  refused(error) { hint(error, true); },
  error(message) { hint(message, true); },
  connection(up) { const tag = $("netTag"); tag.hidden = !up && !net.url; tag.textContent = up ? "online" : "reconnecting…"; tag.className = up ? "" : "off"; },
});

/** The header button and the chat box. */
export function wireOnline(): void {
  $("onlineBtn").onclick = () => {
    if (net.online && net.room) { lobbyDialog(net, net.room); lobbyShowing = true; return; }
    if (net.connected) { roomDialog(net); return; }
    connectDialog(net, () => roomDialog(net));
  };
  ($("chatrow") as HTMLFormElement).onsubmit = (e) => {
    e.preventDefault();
    const input = $("chatin") as HTMLInputElement;
    const text = input.value.trim();
    if (text && net.online) { net.chat(text); input.value = ""; }
  };
}
/** Back into the room we were in, if the page was reloaded mid-game. */
export async function resumeOnline(): Promise<boolean> {
  let online = false;
  try { online = localStorage.getItem(ONLINE_KEY) === "1"; } catch { /* no */ }
  if (!online || !Net.defaultUrl() || !Net.savedName()) return false;
  try { await net.connect(Net.defaultUrl(), Net.savedName()); return true; } catch { return false; }
}
