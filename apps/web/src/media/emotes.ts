/* Emotes: for a few seconds the emoji sits big over the player's portrait on
   their seat card, as in JP's game: no bubble, just the glyph with a shadow.
   The strip is rebuilt on every render, so a repaint mid-pop RESUMES the
   animation where it was rather than replaying the pop. */
import { EMOJIS } from "@exploding-catan/protocol";
import { $, h } from "../ui/dom";

const EMOTE_MS = 3400;
const bubbles = new Map<number, { emoji: string; since: number }>();
export function showEmote(seat: number, emoji: string): void {
  bubbles.set(seat, { emoji, since: Date.now() });
  paintBubbles();
  setTimeout(paintBubbles, EMOTE_MS + 100);
}
/** Put the live emotes back on the seat cards' portraits. */
export function paintBubbles(): void {
  const now = Date.now();
  for (const [seat, b] of bubbles) if (b.since + EMOTE_MS < now) bubbles.delete(seat);
  const seats = $("seats").children;
  for (let i = 0; i < seats.length; i++) {
    const el = seats[i] as HTMLElement;
    const face = el.querySelector(".portrait") ?? el;
    const old = face.querySelector(".emo");
    const b = bubbles.get(i);
    if (!b) { old?.remove(); continue; }
    if (old && old.textContent === b.emoji) continue;
    old?.remove();
    // A negative delay starts the animation part-way through: the markup carries the start time.
    face.append(h("span", { class: "emo", style: { animationDelay: `-${now - b.since}ms` } }, b.emoji));
  }
}
/** The tray under the header button. `send` is what a chosen emoji does. */
export function installEmoteTray(send: (emoji: string) => void): void {
  const tray = $("emojiTray");
  let lastAt = 0;
  for (const e of EMOJIS) tray.append(h("button", { title: "Throw this", onclick: () => {
    tray.hidden = true;
    if (Date.now() - lastAt < 1500) return;
    lastAt = Date.now();
    send(e);
  } }, e));
  $("emojiBtn").onclick = () => { tray.hidden = !tray.hidden; };
  document.addEventListener("pointerdown", (ev) => { if (!tray.hidden && !tray.contains(ev.target as Node) && ev.target !== $("emojiBtn")) tray.hidden = true; });
}
