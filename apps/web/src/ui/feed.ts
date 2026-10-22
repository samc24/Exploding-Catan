import { canNopeEntry, type GameEvent, type GameState, type JournalEntry } from "@exploding-catan/engine";
import { clear, h } from "./dom";

export interface FeedLine { text: string; kind: string; jid: number | null; }
const KEEP = 80;

export class Feed {
  lines: FeedLine[] = [];
  take(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.type === "feed") this.lines.push({ text: ev.text, kind: ev.kind, jid: ev.jid ?? null });
      else if (ev.type === "amend") {
        const l = ev.jid === null ? this.lines[this.lines.length - 1] : this.lines.find((x) => x.jid === ev.jid);
        if (l) l.text += " — " + ev.text;
      }
    }
    while (this.lines.length > KEEP) this.lines.shift();
  }
  reset(): void { this.lines = []; }
}

/* Rebuilding the feed is cheap; the scrollTop write after it is not, because
   it forces the browser to lay out the whole freshly rebuilt page. So the feed
   is only rebuilt when its lines or their answerability changed. */
let lastSignature = "";
export function resetFeedSignature(): void { lastSignature = ""; }

/** The feed, newest at the bottom. Lines that are still answerable are marked, and clickable. */
export function drawFeed(root: HTMLElement, s: GameState, feed: Feed, now: number, onEntry: (e: JournalEntry) => void): void {
  const open = new Map<number, JournalEntry>();
  for (const e of s.journal) if (canNopeEntry(s, e, now)) open.set(e.id, e);
  const lastLine = feed.lines[feed.lines.length - 1];
  const signature = `${feed.lines.length}|${lastLine ? lastLine.text : ""}|${[...open.keys()].join(",")}`;
  if (signature === lastSignature && root.childElementCount === feed.lines.length) return;
  lastSignature = signature;
  clear(root);
  for (const l of feed.lines) {
    const e = l.jid !== null ? open.get(l.jid) : undefined;
    root.append(h("div", {
      class: "fl " + l.kind + (e ? " open" : ""),
      onclick: e ? () => onEntry(e) : null,
      title: e ? "Still answerable — click to answer with a Nope or Defuse" : null,
    }, l.text, e ? h("span", { class: "ans" }, "answerable") : null));
  }
  root.scrollTop = root.scrollHeight;
}

let lastLogLength = -1;
export function drawLog(root: HTMLElement, s: GameState): void {
  if (root.hidden && root.childElementCount) return; // nobody is looking; catch up when they do
  if (s.log.length === lastLogLength && root.childElementCount) return;
  lastLogLength = s.log.length;
  clear(root);
  for (const l of s.log.slice(-200)) root.append(h("div", null, l));
  root.scrollTop = root.scrollHeight;
}
