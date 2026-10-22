import { answersFor, canNopeEntry, type GameEvent, type GameState, type JournalEntry } from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { tap } from "./tap";

export interface FeedLine { text: string; kind: string; jid: number | null; }
/** Chat lines ride in the feed too; they are never answerable. */
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

/** The lines THIS seat could answer right now, and with which card. */
export function answerable(s: GameState, view: number, now: number): { nope: Set<number>; defuse: Set<number> } {
  const p = s.players[view];
  const has = (k: string) => !!p && p.cards.some((c) => c.key === k);
  const jids = (key: "nope" | "defuse") => new Set(answersFor(s, key, view, now).flatMap((a) => ("jid" in a ? [a.jid] : [])));
  return { nope: has("nope") ? jids("nope") : new Set(), defuse: has("defuse") ? jids("defuse") : new Set() };
}

/** The feed, newest at the bottom. A line this seat holds an answer to says
    which card answers it, and is clickable (and a drop target). */
export function drawFeed(root: HTMLElement, s: GameState, feed: Feed, view: number, now: number, onEntry: (e: JournalEntry) => void): void {
  const open = new Map<number, JournalEntry>();
  for (const e of s.journal) if (canNopeEntry(s, e, now)) open.set(e.id, e);
  const mine = answerable(s, view, now);
  const lastLine = feed.lines[feed.lines.length - 1];
  const signature = `${view}|${feed.lines.length}|${lastLine ? lastLine.text : ""}|${[...open.keys()].join(",")}|${[...mine.nope].join(",")}|${[...mine.defuse].join(",")}`;
  if (signature === lastSignature && root.childElementCount === feed.lines.length) return;
  lastSignature = signature;
  clear(root);
  for (const l of feed.lines) {
    const e = l.jid !== null ? open.get(l.jid) : undefined;
    const withNope = e ? mine.nope.has(e.id) : false, withDefuse = e ? mine.defuse.has(e.id) : false;
    const badge = withNope && withDefuse ? "Nope · Defuse" : withNope ? "Nope" : withDefuse ? "Defuse" : e ? "open" : null;
    root.append(h("div", {
      class: "fl " + l.kind + (e ? " open" : "") + (withNope || withDefuse ? " mine" : ""),
      dataset: e ? { jid: String(e.id) } : undefined,
      onclick: e ? () => onEntry(e) : null,
      title: withNope || withDefuse ? `You hold an answer to this: ${tap}, or drop the card here` : e ? "Still open to an answer" : null,
    }, l.text, badge ? h("span", { class: "ans" + (withNope || withDefuse ? "" : " faint") }, badge) : null));
  }
  root.scrollTop = root.scrollHeight;
}

/* A phone shows the last `n` lines at the board's foot; the strip is only rebuilt when they change. */
let lastTicker = "";
export function drawTicker(root: HTMLElement, feed: Feed, n: number): void {
  const lines = n > 0 ? feed.lines.slice(-n) : [];
  const signature = lines.map((l) => l.kind + ":" + l.text).join("\n");
  if (signature === lastTicker && root.childElementCount === lines.length) return;
  lastTicker = signature;
  clear(root);
  for (const l of lines) root.append(h("div", { class: "tl " + l.kind }, l.text));
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
