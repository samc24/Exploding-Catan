/* The strip at the board's top-left, as in JP's game. The log is its own
   toggle, on by default. The dice history, the chat and the emoji tray hang
   off the strip in the same place, so only one of the three is ever out:
   opening any of them puts the other two away. */
import { $ } from "./dom";

const PEGS: { btn: string; box: string }[] = [{ btn: "diceBtn", box: "dicepanel" }, { btn: "chatTab", box: "chat" }];

/** Put away whatever hangs off the strip (not the tray: that is the emotes' own). */
export function closePegs(): void {
  for (const { btn, box } of PEGS) { $(box).hidden = true; $(btn).classList.remove("on"); }
}

export function installColumn(cb: { chatOpened: () => void; changed: () => void }): void {
  $("logBtn").onclick = () => {
    const feed = $("feed");
    feed.hidden = !feed.hidden;
    $("logBtn").classList.toggle("on", !feed.hidden);
    if (!feed.hidden) feed.scrollTop = feed.scrollHeight;
    cb.changed();
  };
  for (const { btn, box } of PEGS) $(btn).onclick = () => {
    const open = $(box).hidden;
    closePegs();
    $("emojiTray").hidden = true;
    if (open) { $(box).hidden = false; $(btn).classList.add("on"); if (box === "chat") cb.chatOpened(); }
    cb.changed();
  };
}
