/* An all-human table: the opening, a roll, the composers, six turns. */
import { launch, startLocal, playSetup, state, settle, clickSpot, finish, OUT } from "./lib.mjs";
const { browser, page, errors } = await launch();
await page.screenshot({ path: `${OUT}/01-newgame.png` });
await startLocal(page, { seed: "7" });
await page.screenshot({ path: `${OUT}/02-setup.png` });
// Build spots wear the placing player's colour; a port says what it is when hovered.
{
  const s0 = await state(page);
  const fill = await page.locator("#board .spot").first().evaluate((el) => el.style.fill);
  const portTip = await page.locator("#board .port title").first().textContent();
  console.log("spot colour:", fill, "for", s0.players[s0.cur].color, "| port tip:", portTip);
  const hex = (c) => c.startsWith("#") ? `rgb(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)})` : c;
  if (fill !== hex(s0.players[s0.cur].color)) errors.push("the build spots are not in the placing player's colour");
  if (!/port — /.test(portTip || "")) errors.push("a port has no tooltip");
}
await playSetup(page);
await page.screenshot({ path: `${OUT}/03-after-setup.png` });
let s = await state(page);
console.log("phase after setup:", s.phase, "turn", s.turnCounter);
// The standing advice says what the table wants; the current portrait wears the turning ring.
{
  const adv = await page.locator("#hint").textContent();
  const spin = await page.locator("#seats .seat.cur").evaluate((el) => el.style.getPropertyValue("--spin"));
  console.log("advice:", adv, "| ring phase:", spin);
  if (adv !== "Roll the dice to begin your turn.") errors.push("the standing advice is missing before the roll");
  if (!/^-\d+ms$/.test(spin)) errors.push("the turn ring has no resumable phase");
}
await page.click('#bottom button:has-text("Roll dice")');
await page.waitForTimeout(120);
const tumbling = await page.locator("#dice .die.tumble").count();
const pips = await page.locator("#dice .die i").count(), sum = await page.locator("#dice .dicesum").textContent();
console.log("dice tumbling:", tumbling, "| pip cells:", pips, "| sum:", sum);
if (tumbling !== 2) errors.push("the dice did not tumble on a new roll");
if (pips !== 18 || !sum) errors.push("the dice are not drawn as pips with a total");
await page.waitForTimeout(300);
s = await state(page);
console.log("rolled:", s.rolled, "phase", s.phase, "seven?", !!s.seven, "select", s.select && s.select.kind);
// A seven gets a disc in the middle of the board; the robbery that follows gets a moment of its own.
const sevenShown = await page.locator("#showcase:not([hidden]) .showseven").count();
await page.screenshot({ path: `${OUT}/04-rolled.png` });
await settle(page);
if (s.select && s.select.kind === "robber") {
  // The seven holds the middle for its full beat first; the robbery queues behind it.
  const robbery = await page.locator("#showcase:not([hidden]) .showglyph.robbery").waitFor({ timeout: 6000 }).then(() => 1).catch(() => 0);
  console.log("seven disc:", sevenShown, "| robbery moment:", robbery);
  if (!sevenShown) errors.push("the seven was not shown in the middle of the board");
  if (!robbery) errors.push("the robbery had no moment in the middle of the board");
  await page.screenshot({ path: `${OUT}/05-robbery.png` });
}
for (const b of ["Bank", "Trade", "Buy cards"]) {
  const btn = page.locator(`#bottom button:has-text("${b}")`);
  if (await btn.isEnabled()) { await btn.click(); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/06-${b.replace(" ", "")}.png` }); await btn.click(); }
}
// The deck sells too: it is marked exactly when the button is live, and a click on it opens the same buy.
{
  const canBuy = await page.locator('#bottom button:has-text("Buy cards")').isEnabled();
  const marked = (await page.locator("#deck.buyable").count()) > 0;
  if (canBuy !== marked) errors.push(`the deck is ${marked ? "" : "not "}marked for sale while the Buy button is ${canBuy ? "live" : "off"}`);
  if (canBuy) {
    await page.click("#deck"); await page.waitForTimeout(150);
    if (!(await page.locator('#panels h3:has-text("Buy kitten cards")').count())) errors.push("a click on the deck did not open the buy");
    await page.click("#deck"); await page.waitForTimeout(100);
  }
}
for (let t = 0; t < 6; t++) {
  const end = page.locator('#bottom button:has-text("End turn")');
  if (await end.count() && await end.isEnabled()) { await end.click(); await page.waitForTimeout(3200); }
  const roll = page.locator('#bottom button:has-text("Roll")');
  if (await roll.count() && await roll.isEnabled()) { await roll.click(); await page.waitForTimeout(300); }
  await settle(page);
}
s = await state(page);
console.log("after 6 turns: turn", s.turnCounter, "phase", s.phase, "cur", s.cur, "journal", s.journal.length);
if (s.turnCounter < 5) errors.push("the turns did not advance: " + s.turnCounter);
if ((await page.locator("#feed .fl").count()) < 5) errors.push("the feed is empty");
await page.screenshot({ path: `${OUT}/07-midgame.png` });
// The dice history and the direction tag. (On a phone the side panel is a drawer: open it first.)
if (await page.locator("#sideBtn").isVisible()) { await page.click("#sideBtn"); await page.waitForTimeout(150); }
await page.click('#sidetabs button[data-tab="dice"]'); await page.waitForTimeout(100);
const bars = await page.locator("#dicepanel .hist .bar").count();
const dirTag = (await page.locator("#dirTag").textContent()) || "";
console.log("dice bars:", bars, "| direction:", dirTag);
if (bars !== 11) errors.push("the dice history did not draw");
if (!dirTag.includes("clockwise")) errors.push("the direction tag is missing");
await page.screenshot({ path: `${OUT}/07b-dice.png` });
await page.click('#sidetabs button[data-tab="feed"]');
// Zoom in and back out (by the buttons; a phone has only the pinch and the way back).
if (await page.locator("#zoomIn").isVisible()) {
  await page.click("#zoomIn"); await page.click("#zoomIn"); await page.waitForTimeout(100);
  const vb = await page.getAttribute("#board", "viewBox");
  await page.click("#zoomReset");
  console.log("zoomed viewBox:", vb);
}
// Music (in the settings menu): the slider sets and remembers the volume; the track is a loop.
await page.click("#menuBtn"); await page.waitForTimeout(100);
await page.locator("#musicRow input[type=range]").fill("70"); await page.waitForTimeout(100);
const volLabel = await page.locator("#musicRow span").last().textContent();
const vol = await page.evaluate(() => localStorage.getItem("exploding-catan:volume"));
console.log("music volume:", volLabel, "saved", vol);
if (volLabel !== "70%" || vol !== "0.7") errors.push("the volume slider did not take");
// The real file, not the page the dev server falls back to for unknown paths.
await page.locator("#sfxRow input[type=range]").fill("30"); await page.waitForTimeout(100);
const fxVol = await page.evaluate(() => localStorage.getItem("exploding-catan:effects"));
if (fxVol !== "0.3") errors.push("the effects slider did not take");
const fx = await page.evaluate(async () => { const r = await fetch("./sfx/dice1.m4a"); return { ok: r.ok, type: r.headers.get("content-type") || "", bytes: (await r.arrayBuffer()).byteLength }; });
console.log("sfx:", fx.type, fx.bytes, "bytes");
if (!fx.ok || !/audio|mp4/.test(fx.type) || fx.bytes < 1000) errors.push("the sound effects are not served as audio");
const track = await page.evaluate(async () => { const r = await fetch("./music/theme.mp3"); const type = r.headers.get("content-type") || ""; const bytes = (await r.arrayBuffer()).byteLength; return { ok: r.ok, type, bytes }; });
console.log("soundtrack:", track.type, track.bytes, "bytes");
if (!track.ok || !track.type.startsWith("audio/") || track.bytes < 1_000_000) errors.push("the soundtrack is not served as audio");
await page.click("#rulesBtn"); await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/08-rules.png` });
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 420, height: 860 });
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/09-phone.png` });
await clickSpot(page, "#board .spot.nothing"); // no-op, keeps the helper exercised

// Coming back: the front door offers the saved game and a way out of it, and never forces it.
await page.setViewportSize({ width: 1400, height: 900 });
await page.reload({ waitUntil: "networkidle" });
if (!(await page.locator("#landing:not([hidden])").count())) errors.push("a reload did not open on the landing");
const cont = page.locator('#landing .way:has-text("Continue last game")');
if (!(await cont.count())) errors.push("the landing does not offer the saved game");
await cont.click(); await page.waitForTimeout(300);
if (!(await page.locator("#board .hex").count()) || (await page.locator("#landing:not([hidden])").count())) errors.push("Continue did not bring the game back");
await page.click("#menuBtn"); await page.waitForTimeout(100);
if (!(await page.locator("#menuLeave:not([hidden])").count())) errors.push("the menu has no Leave game while a game is on");
await page.click("#menuLeave"); await page.waitForTimeout(150);
await page.click('#modal button:has-text("Leave")'); await page.waitForTimeout(300);
const left = await page.evaluate(() => ({ saved: localStorage.getItem("exploding-catan:game"), landing: !document.querySelector("#landing").hidden, cont: !!document.querySelector('#landing .way.resume') }));
console.log("after leaving:", JSON.stringify(left));
if (left.saved !== null || !left.landing || left.cont) errors.push("leaving did not clear the game and return to the landing");
await finish(browser, errors);
