/* Every kitten card flow: Attack → Defuse → discard, Favor, Nope, Alter, trade, purchase. */
import { launch, startLocal, playSetup, state, settle, finish, confirmDiscard, OUT, reloadInto } from "./lib.mjs";
const { browser, page, errors } = await launch();
await startLocal(page, { seed: "7" });
await playSetup(page);
await page.click('#bottom button:has-text("Roll dice")'); await page.waitForTimeout(300);
await settle(page);
// Rewrite the saved game: current player gets cards + resources, everybody gets resources.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("exploding-catan:game"));
  let id = 70000;
  const give = (pid, key) => s.players[pid].cards.push({ id: id++, key, flavor: key === "knight" ? "Taco Cat" : null, boughtTurn: -1 });
  const me = s.cur;
  for (const k of ["attack", "favor", "alter", "skip", "reverse", "knight", "explode"]) give(me, k);
  give((me + 1) % 4, "nope"); give((me + 1) % 4, "defuse"); give((me + 2) % 4, "nope");
  for (const p of s.players) p.res = { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2 };
  s.select = null;
  localStorage.setItem("exploding-catan:game", JSON.stringify(s));
});
await reloadInto(page);
let s = await state(page);
const me = s.cur, foe = (me + 1) % 4;
console.log("hand:", s.players[me].cards.map((c) => c.key).join(","), "phase", s.phase);
await page.screenshot({ path: `${OUT}/10-hand.png` });

// ATTACK → pick seat → the victim's discard panel; the victim Defuses instead; the attacker pays.
await page.click('.kc[title^="Attack"]'); await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/11-aiming.png` });
await page.locator("#seats .seat").nth(foe).click(); await page.waitForTimeout(250);
s = await state(page);
console.log("attackDue:", JSON.stringify(s.attackDue), "panel:", await page.locator("#panels .panel h3").first().textContent());
// The card is turned over in the middle with its line as a caption, the players' names in their colours;
// the pile waits for that moment to finish before showing the card on top.
{
  const card = await page.locator("#showcase:not([hidden]) .showcard").count();
  const names = await page.locator("#showcase .showcap .pn").count();
  const onPileEarly = await page.locator('#pile .cardface[data-jid]').count();
  await page.screenshot({ path: `${OUT}/12-showcase.png` });
  await page.waitForTimeout(3000);
  const onPile = await page.locator('#pile .cardface[data-jid]').count();
  const turns = await page.locator("#feed .fl .evturn").count();
  console.log("showcase: card", card, "| tinted names", names, "| pile before/after the reveal", onPileEarly, onPile, "| turn captions", turns);
  if (!card) errors.push("the played card was not shown in the middle of the board");
  if (!names) errors.push("the showcase caption does not colour the players' names");
  if (onPileEarly) errors.push("the pile showed the card while it was still being revealed");
  if (!onPile) errors.push("the pile did not show the card after its reveal");
  if (!turns) errors.push("the feed lines carry no turn caption");
}
await page.screenshot({ path: `${OUT}/12-discard.png` });
await page.click('.kc[title^="Defuse"]'); await page.waitForTimeout(300);
// More than one thing to answer (a robbery too): pick the Attack.
if (!(await page.locator("#modal").isHidden())) { await page.locator('#modal .answer', { hasText: "Attack" }).first().click(); await page.waitForTimeout(300); }
s = await state(page);
console.log("after defuse: attackDue", JSON.stringify(s.attackDue), "last:", s.journal[s.journal.length - 1].text);
if (!s.journal[s.journal.length - 1].text.includes("Defuses")) errors.push("the Defuse did not land");
// The Defused line stays in the feed, struck through; the cancelled Attack stays on the pile, greyed, one card down.
{
  const undone = await page.locator("#feed .fl.undone").count();
  // The victim's screen was shown the answer prompt too, so the queue runs a while: wait for the middle to clear.
  await page.locator("#showcase[hidden]").waitFor({ state: "attached", timeout: 12000 }).catch(() => errors.push("the showcase never cleared"));
  const pile = await page.locator("#pile .cardface").boundingBox();
  await page.mouse.move(pile.x + pile.width / 2, pile.y + pile.height / 2);
  await page.mouse.wheel(0, -100); await page.waitForTimeout(150);
  const cancelled = await page.locator("#pile .cardface.back.cancelled .disccx").count();
  await page.screenshot({ path: `${OUT}/13-cancelled.png` });
  await page.mouse.wheel(0, 100); await page.waitForTimeout(100);
  console.log("after the Defuse: struck lines", undone, "| cancelled card down the pile", cancelled);
  if (!undone) errors.push("the Defused line is not struck through");
  if (!cancelled) errors.push("the cancelled card is not kept on the pile, greyed");
}
await confirmDiscard(page);
s = await state(page);
console.log("after paying: attackDue", JSON.stringify(s.attackDue));

// FAVOR → seat → demand panel
await page.click('.kc[title^="Favor"]'); await page.waitForTimeout(150);
await page.locator("#seats .seat").nth((me + 2) % 4).click(); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/14-favor.png` });
for (let j = 0; j < 3; j++) { await page.locator('#panels .counter button:has-text("+"):not([disabled])').first().click(); await page.waitForTimeout(40); }
await page.click('#panels button:has-text("Demand")'); await page.waitForTimeout(250);
s = await state(page);
console.log("favor done:", s.journal[s.journal.length - 1].text);

// Somebody Nopes: view as the third player and click their Nope.
await page.locator("#seats .seat").nth((me + 2) % 4).click(); await page.waitForTimeout(150);
// A reaction that answers something right now wears the red "answer" pip; hovering a card grows it to be read.
{
  const pip = await page.locator('.kc[title^="Nope"] .pip.now').textContent().catch(() => "");
  await page.hover('.kc[title^="Nope"]'); await page.waitForTimeout(200);
  const grown = await page.locator('.kc[title^="Nope"]').evaluate((el) => getComputedStyle(el).transform !== "none");
  await page.screenshot({ path: `${OUT}/15-hover.png` });
  console.log("Nope pip:", pip, "| grows on hover:", grown);
  if (pip !== "answer") errors.push("an answerable Nope does not say so on the card");
  if (!grown && !process.env.E2E_PHONE) errors.push("a hovered card does not grow"); // a finger has no hover
}
await page.click('.kc[title^="Nope"]'); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/15-nope-choice.png` });
console.log("nope choices:", await page.locator("#modal .answer b").allTextContents());
await page.locator("#modal .answer").first().click(); await page.waitForTimeout(300);
s = await state(page);
console.log("after nope:", s.journal[s.journal.length - 1].text, "| cur", s.cur, "phase", s.phase);
await page.screenshot({ path: `${OUT}/16-noped.png` });
await settle(page);

// ALTER: two hex picks
await page.locator("#seats .seat").nth(me).click(); await page.waitForTimeout(100);
const before = (await state(page)).numbers.slice();
await page.click('.kc[title^="Alter"]'); await page.waitForTimeout(150);
await page.locator("#board .spot.hexpick").nth(0).click({ force: true }); await page.waitForTimeout(100);
await page.locator("#board .spot.hexpick").nth(2).click({ force: true }); await page.waitForTimeout(100);
await page.locator("#board .spot.hexpick.armed").first().click({ force: true }); await page.waitForTimeout(250);
s = await state(page);
const altered = JSON.stringify(before) !== JSON.stringify(s.numbers);
console.log("alter changed numbers:", altered);
if (!altered) errors.push("Alter the Future did not swap");

// TRADE: offer, other accepts, deal
await page.click('#bottom button:has-text("Trade")'); await page.waitForTimeout(100);
await page.locator("#panels .pick").nth(0).locator("button").nth(0).click();
await page.locator("#panels .pick").nth(1).locator("button").nth(4).click();
await page.click('#panels button:has-text("Ask everyone")'); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/17-trade-offer.png` });
await page.click('#panels button:has-text("Accept")'); await page.waitForTimeout(200);
await page.locator("#seats .seat").nth(me).click(); await page.waitForTimeout(100);
await page.click('#panels button:has-text("Trade")'); await page.waitForTimeout(250);
s = await state(page);
console.log("trade settled:", s.trade === null, s.journal[s.journal.length - 1].text);
if (s.trade !== null) errors.push("the trade did not settle");

// DRAG: the Skip card is dragged onto the discard pile, which plays it (the seat pick opens).
{
  const skip = page.locator('.kc[title^="Skip"]');
  const a = await skip.boundingBox(), b = await page.locator("#pile .cardface").boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + ((b.x + b.width / 2) - a.x) * (i / 12), a.y + ((b.y + b.height / 2) - a.y) * (i / 12)); await page.waitForTimeout(16); }
  const droppable = await page.locator("#pile .cardface.droppable").count();
  const lifted = await page.locator(".kc.lifted").count();
  const under = await page.evaluate(([x, y]) => { const g = document.querySelector(".kc.ghost"); if (g) g.style.display = "none"; const el = document.elementFromPoint(x, y); if (g) g.style.display = ""; return el ? el.tagName + "#" + el.id + "." + el.className : null; }, [b.x + b.width / 2, b.y + b.height / 2]);
  console.log("drag: lifted", lifted, "| under the pointer:", under, "| hand card at", JSON.stringify(a));
  await page.mouse.up(); await page.waitForTimeout(250);
  s = await state(page);
  console.log("dragged Skip to the pile: pile lit", droppable === 1, "| select", s.select && s.select.kind);
  if (!s.select || s.select.kind !== "seat") errors.push("dragging a card onto the pile did not play it");
  await page.screenshot({ path: `${OUT}/21-dragged.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(150); // put it back
}
// The chooser explains each answer: give the third player a Nope and open it.
{
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem("exploding-catan:game")); g.players[(g.cur + 2) % 4].cards.push({ id: 71000, key: "nope", flavor: null, boughtTurn: -1 }); localStorage.setItem("exploding-catan:game", JSON.stringify(g)); });
  await reloadInto(page);
  await page.locator("#seats .seat").nth((me + 2) % 4).click(); await page.waitForTimeout(150);
  await page.click('.kc[title^="Nope"]'); await page.waitForTimeout(200);
  const rows = await page.locator("#modal .answer").count();
  const effects = await page.locator("#modal .answer span").allTextContents();
  console.log("chooser rows:", rows, "| first effect:", (effects[0] || "").slice(0, 60));
  if (rows < 1 || !effects.every((e) => e.length > 20)) errors.push("the Nope chooser does not explain its answers");
  await page.hover("#modal .answer.turn");
  if (!(await page.locator("#seats .seat.hl").count())) errors.push("hovering the whole-turn answer did not light the seat");
  await page.screenshot({ path: `${OUT}/22-chooser.png` });
  await page.keyboard.press("Escape");
  await page.locator("#seats .seat").nth(me).click(); await page.waitForTimeout(100);
}
// BUY cards
await page.click('#bottom button:has-text("Buy cards")'); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/19-buy.png` });
for (let i = 0; i < 3; i++) await page.locator("#panels .pick button:not([disabled])").nth(i).click();
await page.click('#panels button:has-text("Buy")'); await page.waitForTimeout(300);
s = await state(page);
console.log("deck now", s.deck.length, "hand", s.players[me].cards.length);
if (s.deck.length !== 53) errors.push("the purchase did not draw");
await page.screenshot({ path: `${OUT}/20-bought.png` });
// The Motion and Tips switches live in the menu and are remembered.
{
  await page.click("#menuBtn"); await page.waitForTimeout(100);
  const before = await page.locator("#fxBtn").textContent();
  await page.click("#fxBtn"); await page.waitForTimeout(100);
  const after = await page.locator("#fxBtn").textContent();
  const saved = await page.evaluate(() => localStorage.getItem("exploding-catan:motion"));
  const calm = await page.evaluate(() => document.body.classList.contains("calmfx"));
  console.log("motion:", before, "→", after, "| saved", saved, "| calm class", calm);
  if (before !== "Motion: full" || after !== "Motion: calm" || saved !== "calm" || !calm) errors.push("the Motion switch does not cycle and remember");
  await page.click("#fxBtn"); await page.click("#fxBtn"); // back to full
  await page.keyboard.press("Escape");
}
await finish(browser, errors);
