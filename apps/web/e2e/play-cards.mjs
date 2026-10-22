import { chromium } from "playwright-core";
const OUT = new URL("./shots/", import.meta.url).pathname;
import { mkdirSync } from "node:fs"; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push("console: " + m.text()); });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
const st = () => page.evaluate(() => JSON.parse(localStorage.getItem("exploding-catan:game")));
// An all-human table: switch every bot seat off.
while (await page.locator('#modal button:has-text("bot")').count()) { await page.locator('#modal button:has-text("bot")').first().click(); await page.waitForTimeout(50); }
await page.fill('#modal input[placeholder="random"]', "7");
await page.click('#modal button:has-text("Start game")');
await page.waitForTimeout(300);
for (let i = 0; i < 40; i++) {
  const phase = (await st()).phase;
  if (!phase.startsWith("setup")) break;
  await page.locator("#board .spot").first().click({ force: true }); await page.waitForTimeout(60);
  await page.locator("#board .spot.armed").first().click({ force: true }); await page.waitForTimeout(120);
}
await page.click('#bottom button:has-text("Roll dice")'); await page.waitForTimeout(300);
{ const s0 = await st(); if (s0.select && s0.select.kind === "robber") { await page.locator("#board .spot.hexpick").first().click({ force: true }); await page.waitForTimeout(60); await page.locator("#board .spot.hexpick.armed").first().click({ force: true }); await page.waitForTimeout(200); } }
// Rewrite the saved game: current player gets cards + resources, everybody gets resources.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("exploding-catan:game"));
  let id = 70000;
  const give = (pid, key) => s.players[pid].cards.push({ id: id++, key, flavor: key === "knight" ? "Taco Cat" : null, boughtTurn: -1 });
  const me = s.cur;
  for (const k of ["attack", "favor", "alter", "skip", "reverse", "knight", "explode"]) give(me, k);
  give((me + 1) % 4, "nope"); give((me + 1) % 4, "defuse"); give((me + 2) % 4, "nope");
  for (const p of s.players) { p.res = { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2 }; }
  s.select = null;
  localStorage.setItem("exploding-catan:game", JSON.stringify(s));
});
await page.reload({ waitUntil: "networkidle" });
let s = await st();
const me = s.cur, foe = (me + 1) % 4;
console.log("hand:", s.players[me].cards.map((c) => c.key).join(","), "phase", s.phase);
await page.screenshot({ path: `${OUT}/10-hand.png` });

// ATTACK → pick seat → victim's discard panel appears (screen follows the victim)
await page.click('.kc[title^="Attack"]'); await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/11-aiming.png` });
await page.locator("#seats .seat").nth(foe).click(); await page.waitForTimeout(250);
s = await st();
console.log("attackDue:", JSON.stringify(s.attackDue), "view should be foe; panel:", await page.locator("#panels .panel h3").first().textContent());
await page.screenshot({ path: `${OUT}/12-discard.png` });
// Victim answers with a Defuse instead (card in hand with the answer pip)
await page.click('.kc[title^="Defuse"]'); await page.waitForTimeout(300);
s = await st();
console.log("after defuse: attackDue", JSON.stringify(s.attackDue), "last:", s.journal[s.journal.length - 1].text);
await page.screenshot({ path: `${OUT}/13-defused.png` });
// Now the attacker owes the discard (reflected). Pay it.
for (let j = 0; j < 6; j++) {
  const plus = page.locator('#panels .counter button:has-text("+"):not([disabled])').first();
  if (!(await plus.count())) break;
  await plus.click(); await page.waitForTimeout(40);
}
await page.click('#panels button:has-text("Confirm")'); await page.waitForTimeout(200);
s = await st();
console.log("after paying: attackDue", JSON.stringify(s.attackDue), "me res total", Object.values(s.players[me].res).reduce((a, b) => a + b, 0));

// FAVOR → seat → demand panel
await page.click('.kc[title^="Favor"]'); await page.waitForTimeout(150);
await page.locator("#seats .seat").nth((me + 2) % 4).click(); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/14-favor.png` });
for (let j = 0; j < 3; j++) { await page.locator('#panels .counter button:has-text("+"):not([disabled])').first().click(); await page.waitForTimeout(40); }
await page.click('#panels button:has-text("Demand")'); await page.waitForTimeout(250);
s = await st();
console.log("favor done:", s.journal[s.journal.length - 1].text, "| select", s.select);

// Somebody Nopes the favor (third player holds a Nope): click their seat to view, click the Nope
await page.locator("#seats .seat").nth((me + 2) % 4).click(); await page.waitForTimeout(150);
await page.click('.kc[title^="Nope"]'); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/15-nope-choice.png` });
const modalBtns = await page.locator("#modal .btns button").allTextContents();
console.log("nope choices:", modalBtns);
await page.locator("#modal .btns button").first().click(); await page.waitForTimeout(300);
s = await st();
console.log("after nope:", s.journal[s.journal.length - 1].text, "| cur", s.cur, "phase", s.phase);
await page.screenshot({ path: `${OUT}/16-noped.png` });

// settle anything owed (discards, robber, victims) the dull way
async function settle() {
  for (let k = 0; k < 8; k++) {
    const x = await st();
    if (x.select && x.select.kind === "robber") {
      await page.locator("#board .spot.hexpick").first().click({ force: true }); await page.waitForTimeout(60);
      await page.locator("#board .spot.hexpick.armed").first().click({ force: true }); await page.waitForTimeout(200);
    } else if (x.select && x.select.kind === "victim") {
      await page.locator("#panels .pick button").first().click(); await page.waitForTimeout(150);
    } else if (await page.locator('#panels button:has-text("Confirm")').count()) {
      for (let j = 0; j < 12; j++) {
        if (await page.locator('#panels button:has-text("Confirm")').isEnabled()) break;
        const plus = page.locator('#panels .counter button:has-text("+"):not([disabled])').first();
        if (!(await plus.count())) break;
        await plus.click(); await page.waitForTimeout(40);
      }
      await page.locator('#panels button:has-text("Confirm")').click(); await page.waitForTimeout(150);
    } else return;
  }
}
await settle();
s = await st();
console.log("settled; cur", s.cur, "owed?", JSON.stringify(s.attackDue), s.select);
// ALTER: two hex picks
await page.locator("#seats .seat").nth(me).click(); await page.waitForTimeout(100);
const before = (await st()).numbers.slice();
await page.click('.kc[title^="Alter"]'); await page.waitForTimeout(150);
const picks = page.locator("#board .spot.hexpick");
console.log("alter spots:", await picks.count());
await picks.nth(0).click({ force: true }); await page.waitForTimeout(100);
await page.locator("#board .spot.hexpick").nth(2).click({ force: true }); await page.waitForTimeout(100);
await page.locator("#board .spot.hexpick.armed").first().click({ force: true }); await page.waitForTimeout(250);
s = await st();
console.log("alter changed numbers:", JSON.stringify(before) !== JSON.stringify(s.numbers), "select", s.select);

// TRADE: offer, other accepts, deal
await page.click('#bottom button:has-text("Trade")'); await page.waitForTimeout(100);
await page.locator('#panels .pick').nth(0).locator("button").nth(0).click(); // give wood
await page.locator('#panels .pick').nth(1).locator("button").nth(4).click(); // want ore
await page.click('#panels button:has-text("Ask everyone")'); await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/17-trade-offer.png` });
await page.click('#panels button:has-text("Accept")'); await page.waitForTimeout(200);
s = await st();
console.log("replies:", JSON.stringify(s.trade && s.trade.replies));
await page.locator("#seats .seat").nth(me).click(); await page.waitForTimeout(100);
await page.click('#panels button:has-text("Trade")'); await page.waitForTimeout(250);
s = await st();
console.log("trade settled:", s.trade === null, s.journal[s.journal.length - 1].text);
await page.screenshot({ path: `${OUT}/18-traded.png` });

// BUY cards
await page.click('#bottom button:has-text("Buy cards")'); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/19-buy.png` });
await page.locator('#panels .pick button:not([disabled])').nth(0).click();
await page.locator('#panels .pick button:not([disabled])').nth(1).click();
await page.locator('#panels .pick button:not([disabled])').nth(2).click();
await page.click('#panels button:has-text("Buy")'); await page.waitForTimeout(300);
s = await st();
console.log("deck now", s.deck.length, "hand", s.players[me].cards.length);
await page.screenshot({ path: `${OUT}/20-bought.png` });
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
