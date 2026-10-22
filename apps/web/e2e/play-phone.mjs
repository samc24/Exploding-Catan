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
  const accept = page.locator('#panels button:has-text("Accept")').first();
  await accept.waitFor({ timeout: 4000 }).catch(() => {});
  if (!(await accept.count())) fail("the partner's seat does not show the offer");
  else {
    // A picture if the button is there but cannot be tapped, so a flake here can be read.
    try { await accept.tap({ timeout: 6000 }); } catch (e) { await page.screenshot({ path: OUT + "phone-accept-fail.png" }); fail(`the Accept button could not be tapped: ${String(e.message).split("\n")[0]}`); }
    await page.waitForTimeout(150);
  }
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

// ── upright: the board's furniture sits above the hexes, not on them ──
const rects = () => page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  return { piles: r("#piles"), hexes: r("#board > g:nth-of-type(1)"), hex: r("#board polygon.hex"), boardArea: r("#boardArea"), bottom: r("#bottom"), seats: r("#seats"), ticker: r("#ticker") };
});
let g = await rects();
if (!g.piles || !g.hexes || g.piles.b > g.hexes.y + 1) fail(`upright: the piles sit on the hexes (piles bottom ${g.piles?.b}, hexes top ${g.hexes?.y})`);
if (!g.ticker || g.ticker.h < 30 || g.ticker.y < g.hexes.b - 1) fail(`upright: the log lines are missing or on the hexes (${JSON.stringify(g.ticker)})`);
if (await page.locator("#zoomIn").isVisible()) fail("upright: the zoom buttons show on a phone");

// ── on its side: the board takes the height, everything else a column on the right ──
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + "phone-landscape.png" });
g = await rects();
const upright = (await page.locator("#board polygon.hex").first().boundingBox());
if (!g.boardArea || g.boardArea.h < 380 || g.boardArea.w < 500) fail(`landscape: the board's room is ${JSON.stringify(g.boardArea)}`);
if (!g.bottom || g.bottom.x < g.boardArea.r - 1) fail(`landscape: the hand is not beside the board (${JSON.stringify(g.bottom)})`);
if (!g.seats || g.seats.x < g.boardArea.r - 1) fail(`landscape: the seats are not beside the board (${JSON.stringify(g.seats)})`);
if (!upright || upright.width < 40) fail(`landscape: hexes are only ${upright?.width}px wide`);
if (await page.locator("header h1").isVisible()) fail("landscape: the title takes a row it does not have");
if (!(await inScreenAt("#bottom .actions", 844, 390))) fail("landscape: the action buttons are off screen");
// The composer is a sheet down the side of the board, leaving some of it in view.
const tradeBtn = page.locator('#bottom button:has-text("Trade")');
if (await tradeBtn.count() && await tradeBtn.isEnabled()) {
  await tradeBtn.tap(); await page.waitForTimeout(200);
  const sheet = await page.locator("#panels .panel").first().boundingBox();
  if (!sheet || sheet.x < 100 || sheet.x + sheet.width > g.boardArea.r + 1) fail(`landscape: the composer is not a side sheet inside the board's room: ${JSON.stringify(sheet)}`);
  await page.screenshot({ path: OUT + "phone-landscape-trade.png" });
  await tradeBtn.tap(); await page.waitForTimeout(150);
}
// A browser's own bar leaves even less: the seats give way, the rest stays put.
await page.setViewportSize({ width: 844, height: 300 });
await page.waitForTimeout(400);
if (!(await inScreenAt("#bottom .actions", 844, 300))) fail("landscape, short: the action buttons are off screen");
const seatsOverflow = await page.evaluate(() => { const s = document.querySelector("#seats"); return getComputedStyle(s).overflowY; });
if (seatsOverflow !== "auto" && seatsOverflow !== "scroll") fail(`landscape: the seats do not scroll when short of room (overflow-y: ${seatsOverflow})`);
await page.screenshot({ path: OUT + "phone-landscape-short.png" });
await finish(browser, errors);

async function inScreenAt(sel, w, h) { const b = await page.locator(sel).first().boundingBox(); return b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5; }
