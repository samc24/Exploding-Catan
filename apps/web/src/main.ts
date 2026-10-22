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
import { feed, setManualSeat, setNoGameHandler, setRenderer, ui, manualSeat } from "./screen";
import { onEvents, paintClocks, render } from "./render";
import { installKeys } from "./input";
import { installEmoteTray, showEmote } from "./emotes";
import { drawChat, net, resumeOnline, wireOnline } from "./online";
import { BOT_PACE, restoreBots, scheduleBots } from "./bots-host";
import { openNewGame } from "./game";

setRenderer(render);
setNoGameHandler(() => openNewGame(false));

let lastCur = -1;
store.subscribe((s, events, action) => {
  // Only the clocks moved: repaint them in place unless something they gate flipped.
  if (s && action && action.type === "tick" && !events.length && paintClocks(s)) return;
  if (s) onEvents(s, events);
  // A new turn starts with the screen on whoever is playing.
  if (s && s.cur !== lastCur) { lastCur = s.cur; if (manualSeat !== null) setManualSeat(null); }
  if (action && action.type !== "tick") ui.armed = null;
  render();
  // Anything a person did may have handed the bots something to do.
  if (action && action.type !== "tick") scheduleBots(BOT_PACE);
});

$("newBtn").onclick = () => openNewGame(!!store.get());
$("rulesBtn").onclick = showRules;
$("sideBtn").onclick = () => { const side = $("side"); side.classList.toggle("open"); $("sideBtn").classList.toggle("on", side.classList.contains("open")); };
for (const b of $("sidetabs").querySelectorAll("button")) b.onclick = () => {
  for (const x of $("sidetabs").querySelectorAll("button")) x.classList.toggle("on", x === b);
  $("feed").hidden = b.dataset.tab !== "feed";
  $("log").hidden = b.dataset.tab !== "log";
  $("chat").hidden = b.dataset.tab !== "chat";
  if (b.dataset.tab === "chat") { drawChat(); setTimeout(() => $("chatin").focus(), 0); }
};
installKeys();
installEmoteTray((emoji) => { if (net.online) { if (net.seat !== null) net.emote(emoji); } else showEmote(ui.seat, emoji); });
wireOnline();

preload().then(async () => {
  if (await resumeOnline()) return;
  if (store.restore()) {
    const s = store.get()!;
    restoreBots();
    feed.lines = s.journal.slice(-30).map((e) => ({ text: e.text, kind: e.kind, jid: e.id }));
    render();
    scheduleBots(800);
  } else openNewGame(false);
});
