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

/** The feed, newest at the bottom. Lines that are still answerable are marked, and clickable. */
export function drawFeed(root: HTMLElement, s: GameState, feed: Feed, now: number, onEntry: (e: JournalEntry) => void): void {
  clear(root);
  const open = new Map<number, JournalEntry>();
  for (const e of s.journal) if (canNopeEntry(s, e, now)) open.set(e.id, e);
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

export function drawLog(root: HTMLElement, s: GameState): void {
  clear(root);
  for (const l of s.log.slice(-200)) root.append(h("div", null, l));
  root.scrollTop = root.scrollHeight;
}
