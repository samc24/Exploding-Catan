/* ══════════════════════════════════════════════════════════════════════
   PANELS — everything the table is waiting on, drawn from the state
   ══════════════════════════════════════════════════════════════════════
   A discard owed to a seven or an Attack, a victim to pick, three cards to
   name for a Favor, a trade in flight, a forced Nope. None of these are
   dialogs the game could lose: if the state says it is owed, it is drawn.
   ══════════════════════════════════════════════════════════════════════ */
import {
  RES, RES_NAME, discardOwed, tradeRate, cardsFromPool, totalRes, entryById, answersFor,
  type Action, type Bundle, type GameState,
} from "@exploding-catan/engine";
import { clear, h } from "./dom";

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
    const answers = [...answersFor(s, "nope", view, cb.now), ...answersFor(s, "defuse", view, cb.now)];
    root.append(h("div", { class: "panel owed" },
      h("h3", null, owed.kind === "seven" ? "A seven: discard half" : "Attacked: drop cards", h("small", null, `${chosen} of ${owed.n}`)),
      h("p", { class: "sub" }, `${p.name} must discard ${owed.n} resource card${owed.n === 1 ? "" : "s"}.`),
      RES.map((r) => h("div", { class: "counter" },
        h("span", { class: "lbl" }, sw(r), `${RES_NAME[r]} — has ${p.res[r]}`),
        h("button", { class: "sm", disabled: pick[r] <= 0, onclick: () => { pick[r]--; redraw(root, s, view, cb); } }, "−"),
        h("span", { class: "val" }, String(pick[r])),
        h("button", { class: "sm", disabled: chosen >= owed.n || pick[r] >= p.res[r], onclick: () => { pick[r]++; redraw(root, s, view, cb); } }, "+"),
      )),
      e && answers.length ? h("div", { class: "warnbox" }, "You are holding an answer to this. Click the card in your hand to spend it instead of paying.") : null,
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
      RES.map((r) => h("div", { class: "counter" },
        h("span", { class: "lbl" }, sw(r), RES_NAME[r]),
        h("button", { class: "sm", disabled: want[r] <= 0, onclick: () => { want[r]--; redraw(root, s, view, cb); } }, "−"),
        h("span", { class: "val" }, String(want[r])),
        h("button", { class: "sm", disabled: n >= 3, onclick: () => { want[r]++; redraw(root, s, view, cb); } }, "+"),
      )),
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
      h("p", { class: "sub" }, "Any 3 different resources buys a card. Click to add, click past what you hold to clear."),
      h("div", { class: "pick" }, RES.map((r) => h("button", { disabled: p.res[r] <= 0, onclick: () => { pool[r] = p.res[r] > pool[r] ? pool[r] + 1 : 0; redraw(root, s, view, cb); } }, sw(r), RES_NAME[r], h("b", { class: "ct" + (pool[r] ? "" : " off") }, `×${pool[r] || 1}`)))),
      total(pool) ? h("div", { class: "tsum" }, chips(res.spent), h("span", { class: "arrow" }, "→"), `${capped} card${capped === 1 ? "" : "s"}`,
        res.cards > capped ? h("span", { class: "mismatch" }, `deck only has ${s.deck.length}`) : null,
        total(res.left) ? h("span", { class: "mismatch" }, "some cannot pair up: ", chips(res.left)) : null) : null,
      h("div", { class: "btns" },
        h("button", { onclick: () => { cb.scratch["buy"] = zero(); redraw(root, s, view, cb); } }, "Clear"),
        h("button", { onclick: () => { delete cb.scratch["buy"]; cb.closeComposer(); } }, "Cancel"),
        h("button", { class: "primary", disabled: capped < 1, onclick: () => { const err = cb.dispatch({ type: "buyCards", seat: view, spend: { ...res.spent } }); if (!err) { delete cb.scratch["buy"]; cb.closeComposer(); } } }, capped > 1 ? `Buy ${capped} cards` : "Buy"),
      ),
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
      h("div", { style: { color: "var(--dim)", fontSize: "11.5px" } }, "Give — one lot at your rate"),
      h("div", { class: "pick" }, RES.map((r) => { const rate = tradeRate(s, p, r); return h("button", { disabled: p.res[r] < rate, title: `${rate}:1, you hold ${p.res[r]}`, onclick: () => { give[r] = p.res[r] >= (give[r] + 1) * rate ? give[r] + 1 : 0; redraw(root, s, view, cb); } }, sw(r), RES_NAME[r], rate < 4 ? h("small", null, ` ${rate}:1`) : null, h("b", { class: "ct" + (give[r] ? "" : " off") }, `×${give[r] || 1}`)); })),
      h("div", { style: { color: "var(--dim)", fontSize: "11.5px", marginTop: "6px" } }, "Take — one card each"),
      h("div", { class: "pick" }, RES.map((r) => h("button", { disabled: s.bank[r] <= 0, onclick: () => { get[r] = s.bank[r] > get[r] ? get[r] + 1 : 0; redraw(root, s, view, cb); } }, sw(r), RES_NAME[r], h("b", { class: "ct" + (get[r] ? "" : " off") }, `×${get[r] || 1}`)))),
      lots || units ? h("div", { class: "tsum" }, chips(spend), h("span", { class: "arrow" }, "→"), chips(get), lots !== units ? h("span", { class: "mismatch" }, `${lots} lot${lots === 1 ? "" : "s"} vs ${units} card${units === 1 ? "" : "s"}`) : null) : null,
      h("div", { class: "btns" },
        h("button", { onclick: () => { cb.scratch["bankGive"] = zero(); cb.scratch["bankGet"] = zero(); redraw(root, s, view, cb); } }, "Clear"),
        h("button", { onclick: () => { delete cb.scratch["bankGive"]; delete cb.scratch["bankGet"]; cb.closeComposer(); } }, "Cancel"),
        h("button", { class: "primary", disabled: !(lots > 0 && lots === units), onclick: () => { const err = cb.dispatch({ type: "bankTrade", seat: view, give: { ...give }, get: { ...get } }); if (!err) { delete cb.scratch["bankGive"]; delete cb.scratch["bankGet"]; cb.closeComposer(); } } }, "Trade"),
      ),
    ));
  }
  if (cb.composer === "trade" && s.cur === view && !s.trade) {
    const offer = (cb.scratch["offer"] ??= zero());
    const want = (cb.scratch["want"] ??= zero());
    const any = total(offer) + total(want) > 0;
    root.append(h("div", { class: "panel" },
      h("h3", null, "Open trade"),
      h("p", { class: "sub" }, "Build one offer and put it to the whole table."),
      h("div", { style: { color: "var(--dim)", fontSize: "11.5px" } }, "You give"),
      h("div", { class: "pick" }, RES.map((r) => h("button", { disabled: p.res[r] <= 0, onclick: () => { offer[r] = offer[r] >= p.res[r] ? 0 : offer[r] + 1; redraw(root, s, view, cb); } }, sw(r), RES_NAME[r], h("b", { class: "ct" + (offer[r] ? "" : " off") }, `×${offer[r] || 1}`)))),
      h("div", { style: { color: "var(--dim)", fontSize: "11.5px", marginTop: "6px" } }, "You want"),
      h("div", { class: "pick" }, RES.map((r) => h("button", { onclick: () => { want[r] = want[r] >= 6 ? 0 : want[r] + 1; redraw(root, s, view, cb); } }, sw(r), RES_NAME[r], h("b", { class: "ct" + (want[r] ? "" : " off") }, `×${want[r] || 1}`)))),
      h("div", { class: "btns" },
        h("button", { disabled: !any, onclick: () => { cb.scratch["offer"] = zero(); cb.scratch["want"] = zero(); redraw(root, s, view, cb); } }, "Clear"),
        h("button", { onclick: () => { delete cb.scratch["offer"]; delete cb.scratch["want"]; cb.closeComposer(); } }, "Cancel"),
        h("button", { class: "primary", disabled: !any, onclick: () => { const err = cb.dispatch({ type: "offerTrade", seat: view, offer: { ...offer }, want: { ...want } }); if (!err) { delete cb.scratch["offer"]; delete cb.scratch["want"]; cb.closeComposer(); } } }, "Ask everyone"),
      ),
    ));
  }
}

function redraw(root: HTMLElement, s: GameState, view: number, cb: PanelCallbacks): void {
  drawPanels(root, s, view, cb);
}
