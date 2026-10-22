import { chromium } from "playwright-core";
const OUT = new URL("./shots/", import.meta.url).pathname;
import { mkdirSync } from "node:fs"; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/01-newgame.png` });
// Start a 4 player normal game with a fixed seed
// An all-human table: switch every bot seat off.
while (await page.locator('#modal button:has-text("bot")').count()) { await page.locator('#modal button:has-text("bot")').first().click(); await page.waitForTimeout(50); }
await page.fill('#modal input[placeholder="random"]', "7");
await page.click('#modal button:has-text("Start game")');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-setup.png` });
// Play the opening: click a spot twice (arm, confirm) until setup ends
for (let i = 0; i < 40; i++) {
  const phase = await page.evaluate(() => JSON.parse(localStorage.getItem("exploding-catan:game")).phase);
  if (!phase.startsWith("setup")) break;
  const spot = page.locator("#board .spot").first();
  if (await spot.count() === 0) { errors.push("no spot in " + phase); break; }
  await spot.click({ force: true }); await page.waitForTimeout(60);
  await page.locator("#board .spot.armed").first().click({ force: true }); await page.waitForTimeout(120);
}
await page.screenshot({ path: `${OUT}/03-after-setup.png` });
const st = () => page.evaluate(() => JSON.parse(localStorage.getItem("exploding-catan:game")));
let s = await st();
console.log("phase after setup:", s.phase, "turn", s.turnCounter);
// Roll
await page.click('#bottom button:has-text("Roll dice")');
await page.waitForTimeout(400);
s = await st();
console.log("rolled:", s.rolled, "phase", s.phase, "seven?", !!s.seven, "select", s.select && s.select.kind);
await page.screenshot({ path: `${OUT}/04-rolled.png` });
// If a seven: discard/robber panels should be present
if (s.select && s.select.kind === "robber") {
  const hexes = page.locator("#board .spot.hexpick");
  await hexes.first().click({ force: true }); await page.waitForTimeout(60);
  await page.locator("#board .spot.hexpick.armed").first().click({ force: true }); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/05-robber-placed.png` });
}
// Open the buy / bank / trade composers to render them
for (const b of ["Bank", "Trade", "Buy cards"]) {
  const btn = page.locator(`#bottom button:has-text("${b}")`);
  if (await btn.isEnabled()) { await btn.click(); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/06-${b.replace(" ", "")}.png` }); await btn.click(); }
}
// End turn, roll for the next player a few times to exercise more code
for (let t = 0; t < 6; t++) {
  const end = page.locator('#bottom button:has-text("End turn")');
  if (await end.count() && await end.isEnabled()) { await end.click(); await page.waitForTimeout(3200); }
  const roll = page.locator('#bottom button:has-text("Roll")');
  if (await roll.count() && await roll.isEnabled()) { await roll.click(); await page.waitForTimeout(300); }
  s = await st();
  // settle anything owed with first choices
  for (let k = 0; k < 6; k++) {
    s = await st();
    if (s.select && s.select.kind === "robber") {
      await page.locator("#board .spot.hexpick").first().click({ force: true }); await page.waitForTimeout(60);
      await page.locator("#board .spot.hexpick.armed").first().click({ force: true }); await page.waitForTimeout(200);
    } else if (s.select && s.select.kind === "victim") {
      await page.locator("#panels .pick button").first().click(); await page.waitForTimeout(150);
    } else if (await page.locator('#panels button:has-text("Confirm")').count()) {
      // discard: press + until confirm enabled
      for (let j = 0; j < 12; j++) {
        const confirm = page.locator('#panels button:has-text("Confirm")');
        if (await confirm.isEnabled()) break;
        const plus = page.locator('#panels .counter button:has-text("+"):not([disabled])').first();
        if (!(await plus.count())) break;
        await plus.click(); await page.waitForTimeout(40);
      }
      await page.locator('#panels button:has-text("Confirm")').click(); await page.waitForTimeout(150);
    } else break;
  }
}
s = await st();
console.log("after 6 turns: turn", s.turnCounter, "phase", s.phase, "cur", s.cur, "journal", s.journal.length);
await page.screenshot({ path: `${OUT}/07-midgame.png` });
// Rules modal
await page.click("#rulesBtn"); await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/08-rules.png` });
await page.keyboard.press("Escape");
// Mobile viewport
await page.setViewportSize({ width: 420, height: 860 });
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/09-phone.png` });
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
