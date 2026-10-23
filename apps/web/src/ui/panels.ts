/* ══════════════════════════════════════════════════════════════════════
   PANELS — everything the table is waiting on, drawn from the state
   ══════════════════════════════════════════════════════════════════════
   A discard owed to a seven or an Attack, a victim to pick, three cards to
   name for a Favor, a trade in flight, a forced Nope. None of these are
   dialogs the game could lose: if the state says it is owed, it is drawn.
   ══════════════════════════════════════════════════════════════════════ */
import {
  RES, RES_NAME, discardOwed, tradeRate, cardsFromPool, totalRes, entryById, answersFor,
  type Action, type Bundle, type GameState, type Res,
} from "@exploding-catan/engine";
import { clear, h } from "./dom";
import { Tap, tap } from "./tap";

export interface PanelCallbacks {
  dispatch(a: Action): string | null;
  /** Scratch space for a panel's half-built choice, keyed by panel. */
  scratch: Record<string, Bundle>;
  /** Which composer the player opened from the bottom bar, if any. */
  composer: "buy" | "bank" | "trade" | null;
  closeComposer(): void;
  now: number;
}

const zero = (): Bundle => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
const total = (b: Bundle) => RES.reduce((t, r) => t + b[r], 0);
const sw = (r: keyof Bundle) => h("span", { class: "swatch", style: { background: `var(--${r})` } });
const chips = (b: Partial<Bundle>) => h("span", null, RES.filter((r) => (b[r] ?? 0) > 0).map((r) => h("span", { class: "chip", style: { padding: "1px 6px", marginRight: "4px", fontSize: "12px" } }, sw(r), `${b[r]} ${RES_NAME[r]}`)));
const dim = (text: string, top = false) => h("div", { style: { color: "var(--dim)", fontSize: "11.5px", ...(top ? { marginTop: "6px" } : {}) } }, text);

/** Five buttons, one per resource: click to add, click past the limit to clear.
    `note` is a small line under the count: what you hold, your rate, what is left. */
function pickRow(counts: Bundle, canPick: (r: Res) => boolean, step: (r: Res) => void, note?: (r: Res) => string | null): HTMLElement {
  return h("div", { class: "pick" }, RES.map((r) => {
    const n = note ? note(r) : null;
    return h("button", { disabled: !canPick(r), onclick: () => step(r) },
      sw(r), RES_NAME[r], h("b", { class: "ct" + (counts[r] ? "" : " off") }, `×${counts[r] || 1}`), n ? h("small", { class: "have" }, n) : null);
  }));
}
/** A −/+ row for one resource. */
function counterRow(label: Node | string, value: number, canMinus: boolean, canPlus: boolean, change: (d: number) => void): HTMLElement {
  return h("div", { class: "counter" },
    h("span", { class: "lbl" }, label),
    h("button", { class: "sm", disabled: !canMinus, onclick: () => change(-1) }, "−"),
    h("span", { class: "val" }, String(value)),
    h("button", { class: "sm", disabled: !canPlus, onclick: () => change(1) }, "+"));
}
/** Clear / Cancel / the one that commits. */
function composerButtons(clear: () => void, cancel: () => void, go: { label: string; disabled: boolean; fn: () => void }): HTMLElement {
  return h("div", { class: "btns" },
    h("button", { onclick: clear }, "Clear"),
    h("button", { onclick: cancel }, "Cancel"),
    h("button", { class: "primary", disabled: go.disabled, onclick: go.fn }, go.label));
}

export function drawPanels(root: HTMLElement, s: GameState, view: number, cb: PanelCallbacks): void {
  clear(root);
  const p = s.players[view];

  // ── a discard owed by this seat ──
  const owed = discardOwed(s);
  if (owed && owed.pid === view) {
    const key = "discard";
    const pick = (cb.scratch[key] ??= zero());
    const chosen = total(pick);
    const e = owed.jid !== null ? entryById(s, owed.jid) : undefined;
    // Only an answer this hand actually holds is worth a word.
    const holds = (k: string) => p.cards.some((c) => c.key === k);
    const answers = [...(holds("nope") ? answersFor(s, "nope", view, cb.now) : []), ...(holds("defuse") ? answersFor(s, "defuse", view, cb.now) : [])];
    root.append(h("div", { class: "panel owed" },
      h("h3", null, owed.kind === "seven" ? "A seven: discard half" : "Attacked: drop cards", h("small", null, `${chosen} of ${owed.n}`)),
      h("p", { class: "sub" }, `${p.name} must discard ${owed.n} resource card${owed.n === 1 ? "" : "s"}.`),
      RES.map((r) => counterRow(h("span", null, sw(r), `${RES_NAME[r]} — has ${p.res[r]}`), pick[r], pick[r] > 0, chosen < owed.n && pick[r] < p.res[r], (d) => { pick[r] += d; redraw(root, s, view, cb); })),
      e && answers.length ? h("div", { class: "warnbox" }, `You are holding an answer to this. ${Tap} the card in your hand to spend it instead of paying.`) : null,
      h("div", { class: "btns" },
        h("button", { class: "primary", disabled: chosen !== owed.n, onclick: () => { const err = cb.dispatch({ type: "discard", seat: view, bundle: { ...pick } }); if (!err) delete cb.scratch[key]; } }, "Confirm"),
      ),
    ));
  } else delete cb.scratch["discard"];

  // ── forced Nope ──
  if (s.forcedNope && s.forcedNope.pid === view) {
    const w = s.players[s.forcedNope.winner];
    root.append(h("div", { class: "panel owed" },
      h("h3", null, "Forced Nope"),
      h("div", { class: "warnbox" }, h("b", null, w.name), ` just reached ${s.winPoints} victory points. You are the next player in turn order holding a Nope, so you must spend it. ${s.players[s.cur].name}'s turn is cancelled and everything it gained is destroyed.`),
      h("div", { class: "btns" }, h("button", { class: "warn", onclick: () => cb.dispatch({ type: "nopeTurn", seat: view }) }, `Cancel ${s.players[s.cur].name}'s turn`)),
    ));
  }

  const sel = s.select;
  // ── victim pick ──
  if (sel && sel.kind === "victim" && sel.actor === view) {
    root.append(h("div", { class: "panel owed" },
      h("h3", null, "Choose a victim"),
      h("p", { class: "sub" }, "Steal one random resource card."),
      h("div", { class: "pick" }, sel.candidates.map((pid) => h("button", { onclick: () => cb.dispatch({ type: "pickVictim", seat: view, target: pid }) }, `${s.players[pid].name} (${totalRes(s.players[pid])} cards)`))),
    ));
  }
  // ── favor demand ──
  if (sel && sel.kind === "favor" && sel.actor === view) {
    const key = "favor";
    const want = (cb.scratch[key] ??= zero());
    const n = total(want);
    root.append(h("div", { class: "panel owed" },
      h("h3", null, "Favor — name 3 cards", h("small", null, `${n} of 3`)),
      h("p", { class: "sub" }, h("b", null, s.players[sel.target].name), " hands over whichever of them they actually hold."),
      RES.map((r) => counterRow(h("span", null, sw(r), RES_NAME[r]), want[r], want[r] > 0, n < 3, (d) => { want[r] += d; redraw(root, s, view, cb); })),
      h("div", { class: "btns" },
        !sel.synthetic ? h("button", { onclick: () => { delete cb.scratch[key]; cb.dispatch({ type: "cancelSelect", seat: view }); } }, "Cancel") : null,
        h("button", { class: "primary", disabled: n !== 3, onclick: () => { const err = cb.dispatch({ type: "favorDemand", seat: view, want: { ...want } }); if (!err) delete cb.scratch[key]; } }, "Demand"),
      ),
    ));
  } else delete cb.scratch["favor"];

  // ── a trade offer aimed at this seat ──
  const t = s.trade;
  if (t && t.from !== view && t.replies[view] === "wait") {
    root.append(h("div", { class: "panel" },
      h("h3", null, `Trade offer from ${s.players[t.from].name}`),
      h("div", null, h("div", null, "You get ", chips(t.offer)), h("div", null, "You give ", chips(t.want))),
      h("div", { class: "btns" },
        h("button", { onclick: () => cb.dispatch({ type: "answerTrade", seat: view, accept: false }) }, "Decline"),
        h("button", { class: "primary", onclick: () => cb.dispatch({ type: "answerTrade", seat: view, accept: true }) }, "Accept"),
      ),
    ));
  }
  // ── my own offer, waiting on replies ──
  if (t && t.from === view) {
    const others = s.players.filter((q) => q.id !== view);
    root.append(h("div", { class: "panel" },
      h("h3", null, "Open trade"),
      h("div", null, h("div", null, "You give ", chips(t.offer)), h("div", null, "You want ", chips(t.want))),
      others.map((q) => {
        const st = t.replies[q.id];
        return h("div", { class: "counter" }, h("span", { class: "lbl" }, h("span", { class: "swatch", style: { background: q.color, borderRadius: "50%" } }), h("b", null, q.name)),
          st === "wait" ? h("span", { style: { color: "var(--dim)", fontSize: "12px" } }, "thinking…") :
          st === "yes" ? h("button", { class: "sm primary", onclick: () => cb.dispatch({ type: "acceptTrade", seat: view, with: q.id }) }, "Trade") :
          st === "cant" ? h("span", { style: { color: "var(--dim)", fontSize: "12px" } }, "can't pay") :
          h("span", { style: { color: "#b06a6a", fontSize: "12px" } }, "declined"));
      }),
      !others.some((q) => t.replies[q.id] === "wait" || t.replies[q.id] === "yes") ? h("div", { class: "warnbox" }, "Nobody took it. Try a different offer.") : null,
      h("div", { class: "btns" }, h("button", { onclick: () => cb.dispatch({ type: "cancelTrade", seat: view }) }, "Withdraw")),
    ));
  }

  // ── composers opened from the bottom bar ──
  if (cb.composer === "buy" && s.cur === view) {
    const pool = (cb.scratch["buy"] ??= zero());
    const res = cardsFromPool(pool);
    const capped = Math.min(res.cards, s.deck.length);
    root.append(h("div", { class: "panel" },
      h("h3", null, "Buy kitten cards"),
      h("p", { class: "sub" }, `Any 3 different resources buys a card. ${Tap} to add, ${tap} past what you hold to clear.`),
      pickRow(pool, (r) => p.res[r] > 0, (r) => { pool[r] = p.res[r] > pool[r] ? pool[r] + 1 : 0; redraw(root, s, view, cb); }, (r) => `have ${p.res[r]}`),
      total(pool) ? h("div", { class: "tsum" }, chips(res.spent), h("span", { class: "arrow" }, "→"), `${capped} card${capped === 1 ? "" : "s"}`,
        res.cards > capped ? h("span", { class: "mismatch" }, `deck only has ${s.deck.length}`) : null,
        total(res.left) ? h("span", { class: "mismatch" }, "some cannot pair up: ", chips(res.left)) : null) : null,
      composerButtons(
        () => { cb.scratch["buy"] = zero(); redraw(root, s, view, cb); },
        () => { delete cb.scratch["buy"]; cb.closeComposer(); },
        { label: capped > 1 ? `Buy ${capped} cards` : "Buy", disabled: capped < 1, fn: () => { const err = cb.dispatch({ type: "buyCards", seat: view, spend: { ...res.spent } }); if (!err) { delete cb.scratch["buy"]; cb.closeComposer(); } } }),
    ));
  }
  if (cb.composer === "bank" && s.cur === view) {
    const give = (cb.scratch["bankGive"] ??= zero());
    const get = (cb.scratch["bankGet"] ??= zero());
    const lots = total(give), units = total(get);
    const spend = zero();
    for (const r of RES) spend[r] = give[r] * tradeRate(s, p, r);
    root.append(h("div", { class: "panel" },
      h("h3", null, "Bank / port trade"),
      h("p", { class: "sub" }, "4:1 unless a port says otherwise. Lots given and cards taken must match."),
      dim("Give — one lot at your rate"),
      pickRow(give, (r) => p.res[r] >= tradeRate(s, p, r), (r) => { const rate = tradeRate(s, p, r); give[r] = p.res[r] >= (give[r] + 1) * rate ? give[r] + 1 : 0; redraw(root, s, view, cb); },
        (r) => `${tradeRate(s, p, r)}:1 · have ${p.res[r]}`),
      dim("Take — one card each", true),
      pickRow(get, (r) => s.bank[r] > 0, (r) => { get[r] = s.bank[r] > get[r] ? get[r] + 1 : 0; redraw(root, s, view, cb); }, (r) => `${s.bank[r]} in bank`),
      lots || units ? h("div", { class: "tsum" }, chips(spend), h("span", { class: "arrow" }, "→"), chips(get), lots !== units ? h("span", { class: "mismatch" }, `${lots} lot${lots === 1 ? "" : "s"} vs ${units} card${units === 1 ? "" : "s"}`) : null) : null,
      composerButtons(
        () => { cb.scratch["bankGive"] = zero(); cb.scratch["bankGet"] = zero(); redraw(root, s, view, cb); },
        () => { delete cb.scratch["bankGive"]; delete cb.scratch["bankGet"]; cb.closeComposer(); },
        { label: "Trade", disabled: !(lots > 0 && lots === units), fn: () => { const err = cb.dispatch({ type: "bankTrade", seat: view, give: { ...give }, get: { ...get } }); if (!err) { delete cb.scratch["bankGive"]; delete cb.scratch["bankGet"]; cb.closeComposer(); } } }),
    ));
  }
  if (cb.composer === "trade" && s.cur === view && !s.trade) {
    const offer = (cb.scratch["offer"] ??= zero());
    const want = (cb.scratch["want"] ??= zero());
    const any = total(offer) + total(want) > 0;
    root.append(h("div", { class: "panel" },
      h("h3", null, "Open trade"),
      h("p", { class: "sub" }, "Build one offer and put it to the whole table."),
      dim("You give"),
      pickRow(offer, (r) => p.res[r] > 0, (r) => { offer[r] = offer[r] >= p.res[r] ? 0 : offer[r] + 1; redraw(root, s, view, cb); }, (r) => `have ${p.res[r]}`),
      dim("You want", true),
      pickRow(want, () => true, (r) => { want[r] = want[r] >= 6 ? 0 : want[r] + 1; redraw(root, s, view, cb); }),
      composerButtons(
        () => { cb.scratch["offer"] = zero(); cb.scratch["want"] = zero(); redraw(root, s, view, cb); },
        () => { delete cb.scratch["offer"]; delete cb.scratch["want"]; cb.closeComposer(); },
        { label: "Ask everyone", disabled: !any, fn: () => { const err = cb.dispatch({ type: "offerTrade", seat: view, offer: { ...offer }, want: { ...want } }); if (!err) { delete cb.scratch["offer"]; delete cb.scratch["want"]; cb.closeComposer(); } } }),
    ));
  }
}

function redraw(root: HTMLElement, s: GameState, view: number, cb: PanelCallbacks): void {
  drawPanels(root, s, view, cb);
}
