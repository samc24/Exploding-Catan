/* Which screen this is. On a phone the left column is a drawer behind the
   header's Log button, so the emoji button, its tray and the direction tag
   move up into the header, where they can be reached with the drawer shut;
   on anything wider they live in the strip, as in JP's game. */
import { $ } from "../ui/dom";

export const PHONE_MQ = "(max-width:800px), (max-width:1000px) and (max-height:520px)";

function place(phone: boolean): void {
  const header = document.querySelector("header");
  if (!header) return;
  const btn = $("emojiBtn"), tray = $("emojiTray"), dir = $("dirTag");
  btn.textContent = phone ? "😏" : "Emoji";
  if (phone) {
    header.insertBefore(dir, $("modeTag"));
    header.insertBefore(btn, $("sideBtn"));
    header.insertBefore(tray, $("sideBtn"));
  } else {
    $("sidetabs").append(btn, dir, tray);
  }
}

export function installLayout(): void {
  let mq: MediaQueryList;
  try { mq = matchMedia(PHONE_MQ); } catch { return; }
  place(mq.matches);
  mq.addEventListener("change", (e) => place(e.matches));
}
