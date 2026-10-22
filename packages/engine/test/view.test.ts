import { describe, expect, it } from "vitest";
import { answersFor, applyAction, eventsFor, openEntries, viewFor } from "../src";
import { T0, bundle, card, dealTo, must, noKittens, setRes, toMain } from "./helpers";

describe("viewFor", () => {
  it("hides other hands, the deck and the dice, and keeps everything public", () => {
    let s = noKittens(toMain(3));
    const me = s.cur, foe = (me + 1) % 4;
    s = dealTo(s, me, "nope"); s = dealTo(s, foe, "attack"); s = dealTo(s, foe, "defuse");
    const v = viewFor(s, me);
    expect(v.players[me].cards.map((c) => c.key)).toEqual(["nope"]);
    expect(v.players[foe].cards.length).toBe(2);
    expect(v.players[foe].cards.every((c) => c.key === "hidden")).toBe(true);
    expect(v.deck.length).toBe(s.deck.length);
    expect(v.deck.every((c) => c.key === "hidden")).toBe(true);
    expect(v.rng).toBe(0);
    expect(v.seed).toBe(0);
    expect(v.terrain).toEqual(s.terrain);
    expect(v.players[foe].res).toEqual(s.players[foe].res); // counts are public
    expect(JSON.stringify(v)).not.toContain('"stolen"');
  });
  it("keeps answerability queries working on the redacted state", () => {
    let s = noKittens(toMain(3));
    const me = s.cur, foe = (me + 1) % 4;
    s = dealTo(s, foe, "explode"); s = dealTo(s, me, "nope");
    s = setRes(s, me, { wood: 2 });
    s = must(s, { type: "playCard", seat: foe, cardId: card(s, foe, "explode").id });
    s = must(s, { type: "pickSeat", seat: foe, target: me });
    const v = viewFor(s, me);
    expect(openEntries(v, T0).length).toBe(openEntries(s, T0).length);
    const mine = answersFor(v, "nope", me, T0);
    expect(mine.some((a) => "jid" in a)).toBe(true);
    // The view cannot be rewound: applying the answer to it is refused, not crashed.
    const r = applyAction(v, { type: "nope", seat: me, jid: s.journal[s.journal.length - 1].id }, T0);
    expect(r.ok).toBe(false);
  });
  it("reveals every hand once the game is over", () => {
    let s = noKittens(toMain(3));
    s = dealTo(s, (s.cur + 1) % 4, "vp");
    s = structuredClone(s); s.revealed = true;
    expect(viewFor(s, s.cur).players[(s.cur + 1) % 4].cards[0].key).toBe("vp");
  });
  it("names a drawn card only to its owner", () => {
    let s = noKittens(toMain(3));
    const me = s.cur;
    s = setRes(s, me, { wood: 1, brick: 1, sheep: 1 });
    const r = applyAction(s, { type: "buyCards", seat: me, spend: bundle({ wood: 1, brick: 1, sheep: 1 }) }, T0);
    if (!r.ok) throw new Error(r.error);
    const drawn = r.events.find((e) => e.type === "kitten");
    if (!drawn || drawn.type !== "kitten") return; // the Imploding Kitten draws no event
    const mine = eventsFor(r.events, me).find((e) => e.type === "kitten");
    const theirs = eventsFor(r.events, (me + 1) % 4).find((e) => e.type === "kitten");
    expect(mine && mine.type === "kitten" && mine.card.key).not.toBe("hidden");
    expect(theirs && theirs.type === "kitten" && theirs.card.key).toBe("hidden");
  });
});
