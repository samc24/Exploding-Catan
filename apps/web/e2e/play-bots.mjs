/* One person against three bots: the human places their opening pieces when
   asked, then the bots are left to run. Fails on any page error, on a wedge,
   or if the screen ever shows a bot's hand. */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const OUT = new URL("./shots/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push("console: " + m.text()); if (m.type() === "warning" && m.text().includes("refused")) errors.push(m.text()); });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
const st = () => page.evaluate(() => JSON.parse(localStorage.getItem("exploding-catan:game")));
// Default dialog: seat 0 human, the rest bots.
await page.fill('#modal input[placeholder="random"]', "13");
await page.click('#modal button:has-text("Start game")');
await page.waitForTimeout(500);
let s = await st();
console.log("first player:", s.firstPlayer, "cur:", s.cur);
// Play the human's setup placements whenever the board offers spots; bots do the rest.
const deadline = Date.now() + 90_000;
let lastTurn = -1, shownBotHand = false;
while (Date.now() < deadline) {
  s = await st();
  if (s.phase === "over") break;
  const spots = await page.locator("#board .spot").count();
  if (s.phase.startsWith("setup") && spots && (s.cur === 0 || s.phase === "setup3")) {
    await page.locator("#board .spot").first().click({ force: true }); await page.waitForTimeout(80);
    const armed = page.locator("#board .spot.armed");
    if (await armed.count()) { await armed.first().click({ force: true }); await page.waitForTimeout(150); }
    continue;
  }
  if (!s.phase.startsWith("setup") && s.cur === 0) {
    // The human's turn: roll, settle anything owed, end.
    const roll = page.locator('#bottom button:has-text("Roll")');
    if (await roll.count() && await roll.isEnabled()) { await roll.click(); await page.waitForTimeout(300); continue; }
    const sel = s.select;
    if (sel && sel.kind === "robber" && sel.actor === 0) {
      await page.locator("#board .spot.hexpick").first().click({ force: true }); await page.waitForTimeout(60);
      await page.locator("#board .spot.hexpick.armed").first().click({ force: true }); await page.waitForTimeout(200); continue;
    }
    if (sel && sel.kind === "victim" && sel.actor === 0) { await page.locator("#panels .pick button").first().click(); await page.waitForTimeout(150); continue; }
    const confirm = page.locator('#panels button:has-text("Confirm")');
    if (await confirm.count()) {
      for (let j = 0; j < 12 && !(await confirm.isEnabled()); j++) { const plus = page.locator('#panels .counter button:has-text("+"):not([disabled])').first(); if (!(await plus.count())) break; await plus.click(); await page.waitForTimeout(40); }
      if (await confirm.isEnabled()) await confirm.click(); await page.waitForTimeout(150); continue;
    }
    const end = page.locator('#bottom button:has-text("End turn")');
    if (await end.count() && await end.isEnabled()) { await end.click(); await page.waitForTimeout(300); continue; }
  }
  // A discard owed by the human on a bot's seven, or a trade offer from a bot.
  const confirm = page.locator('#panels button:has-text("Confirm")');
  if (await confirm.count()) {
    for (let j = 0; j < 12 && !(await confirm.isEnabled()); j++) { const plus = page.locator('#panels .counter button:has-text("+"):not([disabled])').first(); if (!(await plus.count())) break; await plus.click(); await page.waitForTimeout(40); }
    if (await confirm.isEnabled()) await confirm.click();
    await page.waitForTimeout(150); continue;
  }
  const decline = page.locator('#panels button:has-text("Decline")');
  if (await decline.count()) { await decline.click(); await page.waitForTimeout(150); continue; }
  // The bottom bar must never be a bot's.
  const who = await page.locator("#bottom .who b").textContent();
  if (who && who !== s.players[0].name) shownBotHand = true;
  if (s.turnCounter !== lastTurn) { lastTurn = s.turnCounter; if (lastTurn % 5 === 0) await page.screenshot({ path: `${OUT}/bots-turn-${lastTurn}.png` }); }
  await page.waitForTimeout(400);
}
s = await st();
console.log("reached turn", s.turnCounter, "phase", s.phase, "journal", s.journal.length, "bot hand shown:", shownBotHand);
await page.screenshot({ path: `${OUT}/bots-final.png` });
if (s.turnCounter < 6) errors.push("bots did not advance the game: turn " + s.turnCounter);
if (shownBotHand) errors.push("a bot's hand was shown");
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
