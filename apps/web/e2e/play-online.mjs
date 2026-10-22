/* Two browsers at one table through the server: Ann hosts with a bot in the
   third seat, Ben joins by code, both place their opening pieces, and each
   sees only their own hand. Needs the dev server on :5173 and the game
   server on :8787 (`npm run dev -w apps/server`). */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const OUT = new URL("./shots/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const SERVER = process.env.SERVER_URL || "ws://localhost:8787";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(name + " pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push(name + " console: " + m.text()); });
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  // Dismiss the local New Game dialog and go online.
  await page.keyboard.press("Escape");
  await page.click("#onlineBtn");
  await page.fill('#modal input[placeholder="Your name"]', name);
  await page.fill('#modal input[placeholder="wss://your-server"]', SERVER);
  await page.click('#modal button:has-text("Connect")');
  await page.waitForSelector('#modal h2:has-text("Online as")', { timeout: 5000 });
  return page;
}
const ann = await open("Ann");
await ann.locator('#modal .seg').nth(0).locator("button", { hasText: "3" }).click();
await ann.click('#modal button:has-text("Host")');
await ann.waitForSelector('#modal h2:has-text("Table")');
const code = (await ann.locator("#modal h2").textContent()).replace("Table ", "").trim();
console.log("room", code);
await ann.screenshot({ path: `${OUT}/online-01-lobby.png` });

const ben = await open("Ben");
await ben.fill('#modal input[placeholder="CODE"]', code);
await ben.click('#modal button:has-text("Join")');
await ben.waitForSelector('#modal h2:has-text("Table")');
// Ann adds a bot to seat 3 and starts.
await ann.waitForSelector('#modal button:has-text("Add bot")');
await ann.click('#modal button:has-text("Add bot")');
await ann.waitForSelector('#modal button:has-text("Start"):not([disabled])');
await ann.screenshot({ path: `${OUT}/online-02-ready.png` });
await ann.click('#modal button:has-text("Start")');
await ann.waitForSelector("#board .hex", { timeout: 5000 });
await ben.waitForSelector("#board .hex", { timeout: 5000 });
await ann.waitForTimeout(300);
await ann.screenshot({ path: `${OUT}/online-03-ann.png` });
await ben.screenshot({ path: `${OUT}/online-03-ben.png` });

// Play the opening from whichever screen has spots, until setup ends (the bot places its own).
const pages = { 0: ann, 1: ben };
const deadline = Date.now() + 60000;
let phase = "setup1";
while (Date.now() < deadline) {
  let acted = false;
  for (const p of [ann, ben]) {
    const spots = await p.locator("#board .spot").count();
    if (!spots) continue;
    await p.locator("#board .spot").first().click({ force: true }); await p.waitForTimeout(80);
    const armed = p.locator("#board .spot.armed");
    if (await armed.count()) { await armed.first().click({ force: true }); await p.waitForTimeout(250); }
    acted = true;
  }
  const who = await ann.locator("#bottom .who i").textContent();
  if (who && !who.includes("placing") && !(await ann.locator('#bottom .note:has-text("Place")').count())) {
    const rollOrEnd = await ann.locator('#bottom button:has-text("Roll"), #bottom button:has-text("End turn")').count() + await ben.locator('#bottom button:has-text("Roll"), #bottom button:has-text("End turn")').count();
    if (rollOrEnd) { phase = "main"; break; }
  }
  if (!acted) await ann.waitForTimeout(400);
}
console.log("setup finished:", phase === "main");
// Ann's hand is hers; Ben's screen shows Ann's cards face down (none yet) — check the seat strip "you" markers differ.
const annMe = await ann.locator("#seats .seat.me .name").textContent();
const benMe = await ben.locator("#seats .seat.me .name").textContent();
console.log("Ann views:", annMe.trim(), "| Ben views:", benMe.trim());
if (!annMe.includes("Ann") || !benMe.includes("Ben")) errors.push("a screen is not on its own seat");
// Whoever's turn it is rolls; the other screen sees the dice.
const roller = (await ann.locator('#bottom button:has-text("Roll")').count()) ? ann : (await ben.locator('#bottom button:has-text("Roll")').count()) ? ben : null;
if (roller) {
  await roller.click('#bottom button:has-text("Roll")'); await roller.waitForTimeout(500);
  const other = roller === ann ? ben : ann;
  const dice = await other.locator("#dice .die").count();
  console.log("dice seen on the other screen:", dice);
  if (dice !== 2) errors.push("the other screen did not see the roll");
}
// Chat crosses over.
await ann.click('#sidetabs button[data-tab="chat"]');
await ann.fill("#chatin", "hello from Ann");
await ann.press("#chatin", "Enter");
await ben.click('#sidetabs button[data-tab="chat"]');
await ben.waitForSelector('#chatlog div:has-text("hello from Ann")', { timeout: 3000 });
await ann.screenshot({ path: `${OUT}/online-04-ann.png` });
await ben.screenshot({ path: `${OUT}/online-04-ben.png` });
// An emoji from Ann lands over Ann's seat on Ben's screen.
await ann.click("#emojiBtn");
await ann.locator("#emojiTray button").first().click();
await ben.waitForSelector("#seats .seat .bubble", { timeout: 3000 });
console.log("emote seen on Ben's screen:", await ben.locator("#seats .seat .bubble").textContent());
// Reload Ben: the seat comes back.
await ben.reload({ waitUntil: "networkidle" });
await ben.waitForSelector("#board .hex", { timeout: 8000 });
const benBack = await ben.locator("#seats .seat.me .name").textContent();
console.log("Ben after reload views:", benBack.trim());
if (!benBack.includes("Ben")) errors.push("Ben did not get his seat back after a reload");
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
