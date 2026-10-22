/* ══════════════════════════════════════════════════════════════════════
   EXPLODING CATAN — the browser table
   ══════════════════════════════════════════════════════════════════════
   One state in the store, one render() that rebuilds every region from it.
   Hot-seat or against bots locally; online, the same screens draw the view
   the server sends. This file only wires the pieces together and boots.
   ══════════════════════════════════════════════════════════════════════ */
import { store } from "./store";
import { preload } from "./art";
import { $ } from "./ui/dom";
import { showRules } from "./ui/rules";
import { setManualSeat, setNoGameHandler, setRenderer, ui, manualSeat } from "./screen";
import { onEvents, paintClocks, render } from "./render";
import { installKeys } from "./input";
import { installDrag } from "./drag";
import { installBoardView } from "./boardview";
import { installEmoteTray, showEmote } from "./emotes";
import { chatSeen, drawChat, net, resumeOnline, wireOnline } from "./online";
import { BOT_PACE, pokeTaunts, scheduleBots } from "./bots-host";
import { hasSavedGame, openNewGame, resumeLocal } from "./game";
import { hideLanding, landingShowing, showLanding } from "./ui/landing";
import { connectDialog, roomDialog } from "./ui/lobby";
import { installMusic } from "./music";
import { installSfx } from "./sfx";

setRenderer(render);
/** The front door. With a game waiting, it offers to continue it. */
function landing(): void {
  const live = store.get();
  const saved = !live && hasSavedGame();
  showLanding({
    bots: () => { hideLanding(); openNewGame(!!live, "bots"); },
    passAndPlay: () => { hideLanding(); openNewGame(!!live, "humans"); },
    online: () => { hideLanding(); if (net.connected) roomDialog(net); else connectDialog(net, () => roomDialog(net)); },
    rules: showRules,
    resume: live ? () => hideLanding() : saved ? () => { hideLanding(); resumeLocal(); } : null,
    resumeLabel: live ? "Back to the table" : "Continue last game",
  });
}
setNoGameHandler(landing);

let lastCur = -1;
store.subscribe((s, events, action) => {
  // A game beginning (or arriving from the server) takes the landing away.
  if (s && action === null && landingShowing()) hideLanding();
  // Only the clocks moved: repaint them in place unless something they gate flipped.
  if (s && action && action.type === "tick" && !events.length && paintClocks(s)) return;
  if (s) onEvents(s, events);
  // A new turn starts with the screen on whoever is playing.
  if (s && s.cur !== lastCur) { lastCur = s.cur; if (manualSeat !== null) setManualSeat(null); }
  if (action && action.type !== "tick") ui.armed = null;
  render();
  // Anything a person did may have handed the bots something to do, or to say.
  if (action && action.type !== "tick") { pokeTaunts(); scheduleBots(BOT_PACE); }
});

$("newBtn").onclick = () => openNewGame(!!store.get());
// On a phone the header has no room for these two; the menu carries them.
$("menuNew").onclick = () => { $("menu").hidden = true; openNewGame(!!store.get()); };
$("menuOnline").onclick = () => { $("menu").hidden = true; $("onlineBtn").click(); };
$("homeBtn").onclick = () => { if (landingShowing()) hideLanding(); else landing(); };
$("rulesBtn").onclick = () => { $("menu").hidden = true; showRules(); };
$("sideBtn").onclick = () => { const side = $("side"); side.classList.toggle("open"); $("sideBtn").classList.toggle("on", side.classList.contains("open")); };
// The drawer (phones) closes on a tap anywhere outside it.
document.addEventListener("pointerdown", (ev) => {
  const side = $("side"), t = ev.target as Node;
  if (side.classList.contains("open") && !side.contains(t) && !$("sideBtn").contains(t) && !$("modal").contains(t)) { side.classList.remove("open"); $("sideBtn").classList.remove("on"); }
});
const PANES: Record<string, string> = { feed: "feed", log: "log", chat: "chat", dice: "dicepanel" };
for (const b of $("sidetabs").querySelectorAll("button")) b.onclick = () => {
  for (const x of $("sidetabs").querySelectorAll("button")) x.classList.toggle("on", x === b);
  for (const [tab, id] of Object.entries(PANES)) $(id).hidden = b.dataset.tab !== tab;
  if (b.dataset.tab === "chat") { drawChat(); chatSeen(); setTimeout(() => $("chatin").focus(), 0); }
  render();
};
// The settings menu: things set once, out of the way of the things pressed mid-game.
{
  const menu = $("menu"), btn = $("menuBtn");
  btn.onclick = () => { menu.hidden = !menu.hidden; };
  document.addEventListener("pointerdown", (ev) => { if (!menu.hidden && !menu.contains(ev.target as Node) && ev.target !== btn) menu.hidden = true; });
  if (document.fullscreenEnabled) {
    const fs = $("fsBtn");
    fs.hidden = false;
    fs.onclick = () => { menu.hidden = true; if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => { /* refused */ }); };
  }
}
installKeys();
installDrag();
installBoardView();
installMusic();
installSfx();
installEmoteTray((emoji) => { if (net.online) { if (net.seat !== null) net.emote(emoji); } else showEmote(ui.seat, emoji); });
wireOnline();

preload().then(async () => {
  if (await resumeOnline()) return;
  // A saved game resumes straight away; otherwise the front door.
  if (!resumeLocal()) landing();
});
