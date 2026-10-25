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
// Aiming: the card has left the hand and turned over in the middle; the table is dim; the seats breathe.
{
  const picking = await page.evaluate(() => document.body.classList.contains("picking"));
  const inHand = await page.locator('.kc[title^="Attack"]').count();
  const shown = await page.locator("#showcase:not([hidden]) .showcard").count();
  const breathing = await page.locator("#seats .seat.pickable").count();
  console.log("aiming: dim", picking, "| Attack still in hand", inHand, "| turned over", shown, "| seats lit", breathing);
  if (!picking) errors.push("the table does not dim while aiming");
  if (inHand) errors.push("the played card is still in the hand while aiming");
  if (!shown) errors.push("the played card was not turned over while aiming");
  if (breathing !== 3) errors.push("the seats to aim at are not lit");
}
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
// The forced dialog carries its own Defuse button: the attack is answered from the window it opened.
{
  const btn = page.locator('#panels button.react:has-text("Defuse")');
  const bar = await page.locator("#bottom .note.owed").textContent().catch(() => "");
  console.log("discard panel Defuse button:", await btn.count(), "| attacker's bar:", bar);
  if (!(await btn.count())) errors.push("the discard panel has no Defuse button");
  await btn.click(); await page.waitForTimeout(300);
}
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
const pulses = await page.locator("#boardArea .hexpulse.alter").count();
console.log("alter changed numbers:", altered, "| token pulses:", pulses);
if (altered && pulses !== 2) errors.push("the swapped tokens did not pulse");
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
// BUY cards. A slip is taken back with the − in the corner rather than cycling round through zero.
await page.click('#bottom button:has-text("Buy cards")'); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/19-buy.png` });
for (let i = 0; i < 4; i++) await page.locator("#panels .pick .pickitem > button:first-child:not([disabled])").nth(i).click();
{
  const minuses = await page.locator("#panels .pick .minus").count();
  await page.locator("#panels .pick .minus").nth(3).click(); await page.waitForTimeout(80);
  const after = await page.locator("#panels .pick .minus").count();
  console.log("buy composer: minus buttons", minuses, "→", after);
  if (minuses !== 4 || after !== 3) errors.push("the − in the pick's corner does not take one back");
}
await page.click('#panels button:has-text("Buy")'); await page.waitForTimeout(300);
s = await state(page);
console.log("deck now", s.deck.length, "hand", s.players[me].cards.length, "| hint:", await page.locator("#hint").textContent());
if (s.deck.length !== 53) errors.push("the purchase did not draw");
await page.screenshot({ path: `${OUT}/20-bought.png` });
// One answer, and the Nope acts without asking: the third player's only answer is the whole turn.
{
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem("exploding-catan:game")); g.players[(g.cur + 2) % 4].cards.push({ id: 71000, key: "nope", flavor: null, boughtTurn: -1 }); localStorage.setItem("exploding-catan:game", JSON.stringify(g)); });
  await reloadInto(page);
  const before = (await state(page)).cur;
  await page.locator("#seats .seat").nth((me + 2) % 4).click(); await page.waitForTimeout(150);
  await page.click('.kc[title^="Nope"]'); await page.waitForTimeout(300);
  const asked = !(await page.locator("#modal").isHidden());
  s = await state(page);
  console.log("single-answer Nope: asked", asked, "| turn moved", before, "→", s.cur, "|", s.journal[s.journal.length - 1].text);
  if (asked) errors.push("a Nope with one answer opened the chooser");
  if (s.cur === before) errors.push("a Nope with one answer (the turn) did not take it");
  await page.screenshot({ path: `${OUT}/22-turn-noped.png` });
}
// Chat works at a local table too; the rules say everything JP's do; your own portrait is a button.
{
  // On a phone the side panel is a drawer: open it first.
  if (await page.locator("#sideBtn").isVisible()) { await page.click("#sideBtn"); await page.waitForTimeout(100); }
  await page.click('#sidetabs button[data-tab="chat"]');
  await page.fill("#chatin", "well played"); await page.press("#chatin", "Enter"); await page.waitForTimeout(150);
  const said = await page.locator('#chatlog div:has-text("well played")').count();
  const inFeed = await page.locator('#feed .fl.chat:has-text("well played")').count();
  console.log("local chat: in the window", said, "| in the feed", inFeed);
  if (!said || !inFeed) errors.push("a line said at a local table was not shown");
  await page.click('#sidetabs button[data-tab="chat"]'); // and away again
  if (await page.locator("#sideBtn").isVisible()) await page.keyboard.press("Escape"); // the drawer
  await page.click("#menuBtn"); await page.click("#rulesBtn"); await page.waitForTimeout(100);
  const rules = await page.locator("#modal .rules").textContent();
  if (!/Forced Nope/.test(rules || "") || !/Imploding Kitten/.test(rules || "") || !/last four/.test(rules || "")) errors.push("the rules dialog is missing JP's sections");
  await page.keyboard.press("Escape");
  await page.locator("#seats .seat.me .avwrap.mine").click({ force: true }); await page.waitForTimeout(100);
  const picker = await page.locator('#modal h2:has-text("Your picture")').count();
  const none = await page.locator("#modal .avgrid .av.none").count();
  console.log("portrait dialog:", picker, "| None option:", none);
  if (!picker || !none) errors.push("clicking your own portrait does not offer a new picture");
  await page.locator("#modal .avgrid .av").nth(3).click(); await page.waitForTimeout(100);
  s = await state(page);
  console.log("portrait now:", s.players[me].avatar);
  if (!s.players[me].avatar) errors.push("the chosen portrait did not take");
}
// The record book: empty at first; a line written locally shows this lineup, each person, and head to head.
{
  await page.click("#menuBtn"); await page.click("#recordsBtn"); await page.waitForTimeout(100);
  const empty = await page.locator("#modal .records").textContent();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("exploding-catan:game"));
    const names = g.players.map((p) => p.name);
    const rec = (winner, at) => ({ at, players: names, winner, winnerIsBot: false, bots: 0, points: 10, mode: "normal" });
    localStorage.setItem("exploding-catan:records", JSON.stringify([rec(names[0], 1), rec(names[1], 2), rec(names[0], 3)]));
  });
  await reloadInto(page);
  await page.click("#menuBtn"); await page.click("#recordsBtn"); await page.waitForTimeout(100);
  const h4s = await page.locator("#modal .records h4").allTextContents();
  const redWins = await page.locator('#modal .records table').first().locator("tr", { hasText: "Red" }).locator("td").nth(1).textContent();
  console.log("records: empty says", /No finished games/.test(empty || ""), "| sections", h4s.join(", "), "| Red's wins in this lineup", redWins);
  if (!/No finished games/.test(empty || "")) errors.push("an empty record book does not say so");
  if (!h4s.includes("This lineup") || !h4s.includes("Head to head") || redWins !== "2") errors.push("the record book does not show the lineup, the pairs and the wins");
  await page.keyboard.press("Escape");
}
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
