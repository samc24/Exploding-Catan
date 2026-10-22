/* One person against three bots: the human places their opening pieces when
   asked, then the bots run. Fails on a wedge or if the screen ever shows a bot's hand. */
import { launch, startLocal, state, settle, clickSpot, finish, OUT } from "./lib.mjs";
const { browser, page, errors } = await launch();
await startLocal(page, { seed: "13", bots: [1, 2, 3] });
let s = await state(page);
console.log("first player:", s.firstPlayer, "cur:", s.cur);
const deadline = Date.now() + 90_000;
let lastTurn = -1, shownBotHand = false;
while (Date.now() < deadline) {
  s = await state(page);
  if (s.phase === "over") break;
  if (s.phase.startsWith("setup") && (await page.locator("#board .spot").count())) { await clickSpot(page); continue; }
  if (!s.phase.startsWith("setup") && s.cur === 0) {
    const roll = page.locator('#bottom button:has-text("Roll")');
    if (await roll.count() && await roll.isEnabled()) { await roll.click(); await page.waitForTimeout(300); continue; }
    await settle(page);
    const end = page.locator('#bottom button:has-text("End turn")');
    if (await end.count() && await end.isEnabled()) { await end.click(); await page.waitForTimeout(300); continue; }
  }
  await settle(page);
  const who = await page.locator("#bottom .who b").textContent();
  if (who && who !== s.players[0].name) shownBotHand = true;
  if (s.turnCounter !== lastTurn) { lastTurn = s.turnCounter; if (lastTurn % 5 === 0) await page.screenshot({ path: `${OUT}/bots-turn-${lastTurn}.png` }); }
  await page.waitForTimeout(400);
}
s = await state(page);
console.log("reached turn", s.turnCounter, "phase", s.phase, "journal", s.journal.length, "bot hand shown:", shownBotHand);
await page.screenshot({ path: `${OUT}/bots-final.png` });
if (s.turnCounter < 6) errors.push("bots did not advance the game: turn " + s.turnCounter);
if (shownBotHand) errors.push("a bot's hand was shown");
if (!(await page.locator("#seats .seat").nth(1).textContent()).includes("🤖")) errors.push("bot seats are not marked");
await finish(browser, errors);
