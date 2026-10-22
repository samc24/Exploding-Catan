/* A phone: pass-and-play on a 390×844 touch screen. The flows that were hard
   on a phone in the original game are driven by taps: a bank trade and a
   player trade, start to finish. Also checks the layout holds: one header
   row, the composer as a sheet inside the screen, the hand a strip. */
import { launch, startLocal, playSetup, settle, state, finish, OUT } from "./lib.mjs";

const { browser, page, errors } = await launch("phone", { width: 390, height: 844 }, { touch: true });
const RES = ["wood", "brick", "sheep", "wheat", "ore"];
const total = (b) => RES.reduce((t, r) => t + (b[r] ?? 0), 0);
const fail = (msg) => { errors.push(msg); };
const inScreen = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 390.5 && b.y + b.height <= 844.5; };

await startLocal(page, { seed: "7", mode: "Fast track +" });
await page.screenshot({ path: OUT + "phone-setup.png" });
if ((await page.locator("header").boundingBox()).height > 60) fail("header wraps to more than one row on a phone");
await playSetup(page);

// Roll and end turns until the player to move can afford a bank trade.
let s = null;
for (let t = 0; t < 60; t++) {
  s = await state(page);
  if (s.phase === "over") break;
  const roll = page.locator('#bottom button:has-text("Roll")');
  if (await roll.count()) { await page.locator('#bottom button:has-text("Roll dice"):not([disabled])').waitFor({ timeout: 6000 }).catch(() => {}); await roll.tap(); await page.waitForTimeout(350); await settle(page); continue; }
  const p = s.players[s.cur];
  const bank = page.locator('#bottom button:has-text("Bank")');
  if (await bank.count() && await bank.isEnabled() && RES.some((r) => p.res[r] >= 4) && total(p.res) >= 5) break;
  const end = page.locator('#bottom button:has-text("End turn")');
  if (await end.count() && await end.isEnabled()) { await end.tap(); await page.waitForTimeout(250); await settle(page); }
  else { await settle(page); await page.waitForTimeout(150); }
}
s = await state(page);
const me = s.cur, before = total(s.players[me].res);
console.log(`turn ${s.turnCounter}: ${s.players[me].name} holds ${before} resources`);
await page.screenshot({ path: OUT + "phone-play.png" });
if (!(await inScreen("#bottom .actions"))) fail("the action buttons are off screen");

// ── bank trade by taps ──
await page.locator('#bottom button:has-text("Bank")').tap();
await page.waitForTimeout(150);
await page.screenshot({ path: OUT + "phone-bank.png" });
const sheet = await page.locator("#panels .panel").first().boundingBox();
if (!sheet || sheet.width < 380 || sheet.x + sheet.width > 390.5 || sheet.y + sheet.height > 844.5) fail(`bank composer is not a sheet inside the screen: ${JSON.stringify(sheet)}`);
const picks = page.locator("#panels .pick");
await picks.nth(0).locator("button:not([disabled])").first().tap();
await picks.nth(1).locator("button:not([disabled])").first().tap();
await page.waitForTimeout(100);
const go = page.locator('#panels .btns button:has-text("Trade")');
if (!(await go.isEnabled())) fail("bank Trade button did not wake after one lot given and one card taken");
await go.tap();
await page.waitForTimeout(250);
s = await state(page);
const after = total(s.players[me].res);
if (await page.locator("#panels .panel").count()) fail("bank composer stayed open after the trade");
if (after >= before) fail(`bank trade did not go through: ${before} -> ${after}`);
else console.log(`bank trade: ${before} -> ${after} resources`);

// ── player trade by taps: offer, switch seats, accept, close it ──
const partner = s.players.find((q) => q.id !== me && total(q.res) > 0);
if (!partner) { console.log("nobody else holds a card; skipping the player trade"); }
else {
  const want = RES.find((r) => partner.res[r] > 0);
  const give = RES.find((r) => s.players[me].res[r] > 0);
  await page.locator('#bottom button:has-text("Trade")').tap();
  await page.waitForTimeout(150);
  await page.locator("#panels .pick").nth(0).locator("button").nth(RES.indexOf(give)).tap();
  await page.locator("#panels .pick").nth(1).locator("button").nth(RES.indexOf(want)).tap();
  await page.screenshot({ path: OUT + "phone-trade.png" });
  await page.locator('#panels .btns button:has-text("Ask everyone")').tap();
  await page.waitForTimeout(200);
  // Pass the phone: look as the partner, who sees the offer.
  await page.locator("#seats .seat").nth(partner.id).tap();
  await page.waitForTimeout(150);
  const accept = page.locator('#panels button:has-text("Accept")');
  if (!(await accept.count())) fail("the partner's seat does not show the offer");
  else { await accept.tap(); await page.waitForTimeout(150); }
  // Back to the offerer, who closes the deal with that partner.
  await page.locator("#seats .seat").nth(me).tap();
  await page.waitForTimeout(150);
  const close = page.locator('#panels .counter button:has-text("Trade")');
  if (!(await close.count())) fail("the offerer does not see a partner to trade with");
  else {
    const mineBefore = (await state(page)).players[me].res[want];
    await close.tap(); await page.waitForTimeout(250);
    const mineAfter = (await state(page)).players[me].res[want];
    if (mineAfter !== mineBefore + 1) fail(`player trade did not land: ${want} ${mineBefore} -> ${mineAfter}`);
    else console.log(`player trade: ${give} for ${want} with ${partner.name}`);
  }
}

// ── the drawer and the hand strip ──
await page.locator("#sideBtn").tap(); await page.waitForTimeout(150);
if (!(await page.locator("#side.open").count())) fail("the log drawer did not open");
await page.locator("#boardArea").tap({ position: { x: 20, y: 200 } }); await page.waitForTimeout(150);
if (await page.locator("#side.open").count()) fail("the log drawer did not close on a tap outside it");
const hand = await page.evaluate(() => { const h = document.querySelector("#bottom .hand"); return h ? getComputedStyle(h).overflowX : null; });
if (hand !== "auto" && hand !== "scroll") fail(`the hand is not a scrolling strip on a phone (overflow-x: ${hand})`);
await page.screenshot({ path: OUT + "phone-end.png" });
await finish(browser, errors);
