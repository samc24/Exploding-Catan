import { answersFor, canNopeEntry, type GameEvent, type GameState, type JournalEntry } from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { tap } from "./tap";
import { tint } from "./text";
import { cardArt, has } from "../media/art";

export interface FeedLine { text: string; kind: string; jid: number | null; turn: number | null; seq: number }
/** Chat lines ride in the feed too; they are never answerable. */
const KEEP = 80;
let seq = 0;

export class Feed {
  lines: FeedLine[] = [];
  take(events: GameEvent[]): void {
    for (const ev of events) {
      if (ev.type === "feed") this.add(ev.text, ev.kind, ev.jid ?? null, ev.turn ?? null);
      else if (ev.type === "amend") {
        const l = ev.jid === null ? this.lines[this.lines.length - 1] : this.lines.find((x) => x.jid === ev.jid);
        if (l) l.text += " — " + ev.text;
      }
    }
  }
  add(text: string, kind: string, jid: number | null, turn: number | null): void {
    this.lines.push({ text, kind, jid, turn, seq: ++seq });
    while (this.lines.length > KEEP) this.lines.shift();
  }
  reset(): void { this.lines = []; }
}

/* Rebuilding the feed is cheap; the scrollTop write after it is not, because
   it forces the browser to lay out the whole freshly rebuilt page. So the feed
   is only rebuilt when its lines or their answerability changed. */
let lastSignature = "";
let lastSeq = 0;
export function resetFeedSignature(): void { lastSignature = ""; lastSeq = 0; }

/** The lines THIS seat could answer right now, and with which card. */
export function answerable(s: GameState, view: number, now: number): { nope: Set<number>; defuse: Set<number> } {
  const p = s.players[view];
  const has = (k: string) => !!p && p.cards.some((c) => c.key === k);
  const jids = (key: "nope" | "defuse") => new Set(answersFor(s, key, view, now).flatMap((a) => ("jid" in a ? [a.jid] : [])));
  return { nope: has("nope") ? jids("nope") : new Set(), defuse: has("defuse") ? jids("defuse") : new Set() };
}

/** The card that answers a line, pinned to its corner. Pulses for a Defuse: the narrow, easily missed answer. */
function markFace(key: "nope" | "defuse", tip: string): HTMLElement {
  const art = has(cardArt(key, null)) ? cardArt(key, null) : null;
  return h("span", { class: "evmark " + key, title: tip, style: art ? { backgroundImage: `url(${art})` } : null }, art ? "" : key === "defuse" ? "🛡" : "🚫");
}

/** The feed, newest at the bottom. A line this seat holds an answer to says
    which card answers it, and is clickable (and a drop target). A line that
    was rewound stays, struck through: the feed is a record of what was said. */
export function drawFeed(root: HTMLElement, s: GameState, feed: Feed, view: number, now: number, onEntry: (e: JournalEntry) => void): void {
  const open = new Map<number, JournalEntry>();
  for (const e of s.journal) if (canNopeEntry(s, e, now)) open.set(e.id, e);
  const mine = answerable(s, view, now);
  const oldestKnown = s.journal.length ? s.journal[0].id : Infinity;
  const byId = new Map(s.journal.map((e) => [e.id, e]));
  // Only entries new enough to still be in the journal can be judged gone; a Defused robbery stays and is marked answered.
  const undone = (l: FeedLine) => l.jid !== null && ((l.jid >= oldestKnown && !byId.has(l.jid)) || !!byId.get(l.jid)?.answered);
  const lastLine = feed.lines[feed.lines.length - 1];
  const signature = `${view}|${feed.lines.length}|${lastLine ? lastLine.seq + lastLine.text : ""}|${[...open.keys()].join(",")}|${[...mine.nope].join(",")}|${[...mine.defuse].join(",")}|${feed.lines.filter(undone).map((l) => l.jid).join(",")}`;
  if (signature === lastSignature && root.childElementCount === feed.lines.length) return;
  lastSignature = signature;
  clear(root);
  for (const l of feed.lines) {
    const e = l.jid !== null ? open.get(l.jid) : undefined;
    const withNope = e ? mine.nope.has(e.id) : false, withDefuse = e ? mine.defuse.has(e.id) : false;
    const gone = undone(l);
    root.append(h("div", {
      class: "fl " + l.kind + (e ? " open" : "") + (withNope || withDefuse ? " mine" : "") + (gone ? " undone" : "") + (l.seq > lastSeq ? " new" : ""),
      dataset: e ? { jid: String(e.id) } : undefined,
      onclick: e ? () => onEntry(e) : null,
      title: withNope || withDefuse ? `You hold an answer to this: ${tap}, or drop the card here` : e ? "Still open to an answer" : null,
    },
      l.kind === "chat" ? null : h("span", { class: "evturn" }, l.turn ? `Turn ${l.turn}` : "Setup"),
      tint(s, l.text),
      withNope || withDefuse ? h("span", { class: "evmarks" },
        withDefuse ? markFace("defuse", "You can Defuse this — drag your Defuse onto this line") : null,
        withNope ? markFace("nope", e?.kind === "roll" ? "You can Nope this — drag your Nope onto this line to reroll" : "You can Nope this — drag your Nope onto this line") : null) : null,
      e && !withNope && !withDefuse ? h("span", { class: "ans faint" }, "open") : null));
  }
  lastSeq = lastLine ? lastLine.seq : 0;
  root.scrollTop = root.scrollHeight;
}

/* A phone shows the last `n` lines at the board's foot; the strip is only rebuilt when they change. */
let lastTicker = "";
export function drawTicker(root: HTMLElement, s: GameState, feed: Feed, n: number): void {
  const lines = n > 0 ? feed.lines.slice(-n) : [];
  const signature = lines.map((l) => l.kind + ":" + l.text).join("\n");
  if (signature === lastTicker && root.childElementCount === lines.length) return;
  lastTicker = signature;
  clear(root);
  for (const l of lines) root.append(h("div", { class: "tl " + l.kind }, tint(s, l.text)));
}

