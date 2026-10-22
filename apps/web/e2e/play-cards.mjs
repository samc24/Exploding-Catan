/* Every kitten card flow: Attack → Defuse → discard, Favor, Nope, Alter, trade, purchase. */
import { launch, startLocal, playSetup, state, settle, finish, confirmDiscard, OUT } from "./lib.mjs";
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
await page.reload({ waitUntil: "networkidle" });
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
await page.screenshot({ path: `${OUT}/12-discard.png` });
await page.click('.kc[title^="Defuse"]'); await page.waitForTimeout(300);
// More than one thing to answer (a robbery too): pick the Attack.
if (!(await page.locator("#modal").isHidden())) { await page.locator('#modal .btns button', { hasText: "Attack" }).first().click(); await page.waitForTimeout(300); }
s = await state(page);
console.log("after defuse: attackDue", JSON.stringify(s.attackDue), "last:", s.journal[s.journal.length - 1].text);
if (!s.journal[s.journal.length - 1].text.includes("Defuses")) errors.push("the Defuse did not land");
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
await page.click('.kc[title^="Nope"]'); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/15-nope-choice.png` });
console.log("nope choices:", await page.locator("#modal .btns button").allTextContents());
await page.locator("#modal .btns button").first().click(); await page.waitForTimeout(300);
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

// BUY cards
await page.click('#bottom button:has-text("Buy cards")'); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/19-buy.png` });
for (let i = 0; i < 3; i++) await page.locator("#panels .pick button:not([disabled])").nth(i).click();
await page.click('#panels button:has-text("Buy")'); await page.waitForTimeout(300);
s = await state(page);
console.log("deck now", s.deck.length, "hand", s.players[me].cards.length);
if (s.deck.length !== 53) errors.push("the purchase did not draw");
await page.screenshot({ path: `${OUT}/20-bought.png` });
await finish(browser, errors);
