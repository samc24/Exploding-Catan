/* ══════════════════════════════════════════════════════════════════════
   ONLINE — the connection, the lobby flow, chat, and the server's clock
   ══════════════════════════════════════════════════════════════════════ */
import { PLAYER_COLORS } from "@exploding-catan/engine";
import type { RoomInfo } from "@exploding-catan/protocol";
import { Net } from "./net";
import { store } from "./store";
import { localBot, localHeard, stopBots } from "./bots-host";
import { showEmote } from "./emotes";
import { $, clear, h } from "./ui/dom";
import { closeModal, modalOpen } from "./ui/dialogs";
import { connectDialog, lobbyDialog, roomDialog } from "./ui/lobby";
import { feed, hint, onNoGame, requestRender } from "./screen";

const ONLINE_KEY = "exploding-catan:online";
let lobbyShowing = false;
const chatLines: { name: string; text: string; seat: number | null }[] = [];
let unread = 0;
function paintChatTab(): void {
  const tab = $("chatTab");
  tab.textContent = unread ? `Chat (${unread})` : "Chat";
  tab.classList.toggle("on", unread > 0 || tab.classList.contains("on") && !$("chat").hidden);
}
/** The chat pane was opened: nothing is unread any more. */
export function chatSeen(): void { unread = 0; paintChatTab(); }

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
  unread = 0;
  drawChat();
  document.body.classList.remove("online");
  try { localStorage.removeItem(ONLINE_KEY); } catch { /* fine */ }
  if (!store.restore()) onNoGame();
  else requestRender();
}
export function drawChat(): void {
  const log = $("chatlog");
  clear(log);
  if (!chatLines.length) log.append(h("div", { class: "sys" }, store.get() ? "Nothing said yet. The bots are listening." : "No game running."));
  for (const l of chatLines.slice(-80)) log.append(h("div", { style: { borderLeftColor: l.seat !== null ? PLAYER_COLORS[l.seat] : "var(--line)" } }, h("b", { style: { color: l.seat !== null ? PLAYER_COLORS[l.seat] : "var(--dim)" } }, l.name), l.text));
  log.scrollTop = log.scrollHeight;
}
/** A line said at the table, online or not: the chat window, the feed, and the unread count. */
function sayAtTable(seat: number | null, name: string, text: string): void {
  chatLines.push({ seat, name, text });
  drawChat();
  // Also a line in the game log, so talk is seen whatever tab is open.
  feed.add(`${name}: ${text}`, "chat", null, null);
  if ($("chat").hidden) { unread++; paintChatTab(); }
  requestRender();
}
/** Your portrait, changed mid-game: the server's business online, the table's locally. */
export function pickAvatar(seat: number, avatar: string): void {
  if (net.online) { if (avatar) net.preferAvatar(avatar); return; }
  store.dispatch({ type: "setAvatar", seat, avatar });
}

function backToTable(): void { if (net.connected && !net.room && !modalOpen()) roomDialog(net); }
export const net = new Net({
  room(room: RoomInfo | null) {
    if (!room) { if (lobbyShowing) { closeModal(); lobbyShowing = false; } goLocal(); if (net.connected) roomDialog(net); return; }
    stopBots();
    try { localStorage.setItem(ONLINE_KEY, "1"); } catch { /* fine */ }
    document.body.classList.add("online");
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
  chat(seat, name, text) { sayAtTable(seat, name, text); },
  // Mid-game it is a line in the feed, like JP's "X has left"; with no game on it is a word in the header.
  notice(text, kind) {
    if (store.get()) { feed.add(text, kind, null, store.get()!.turnCounter); requestRender(); }
    else hint(text, false, 8000);
  },
  emote(seat, emoji) { showEmote(seat, emoji); },
  // A refusal or error with no table to show for it (a wrong code, a lost request) brings the table dialog back.
  refused(error) { hint(error, true); backToTable(); },
  error(message) { hint(message, true); backToTable(); },
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
    if (!text) return;
    input.value = "";
    if (net.online) { net.chat(text); return; }
    // A local table: said by the seat at this screen; the bots hear it and may answer in kind.
    const s = store.get();
    if (!s) return;
    const seat = (window as unknown as { __viewSeat?: () => number }).__viewSeat?.() ?? s.cur;
    sayAtTable(seat, s.players[seat]?.name ?? "you", text);
    localHeard(seat);
  };
}
/** Back into the room we were in, if the page was reloaded mid-game. */
export async function resumeOnline(): Promise<boolean> {
  let online = false;
  try { online = localStorage.getItem(ONLINE_KEY) === "1"; } catch { /* no */ }
  if (!online || !Net.defaultUrl() || !Net.savedName()) return false;
  try { await net.connect(Net.defaultUrl(), Net.savedName()); } catch { return false; }
  // Connected, but if no room follows the server has forgotten us: stop trying on every load.
  setTimeout(() => { if (!net.room) { try { localStorage.removeItem(ONLINE_KEY); } catch { /* fine */ } } }, 4000);
  return true;
}
