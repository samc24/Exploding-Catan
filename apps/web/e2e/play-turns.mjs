/* An all-human table: the opening, a roll, the composers, six turns. */
import { launch, startLocal, playSetup, state, settle, clickSpot, finish, OUT } from "./lib.mjs";
const { browser, page, errors } = await launch();
await page.screenshot({ path: `${OUT}/01-newgame.png` });
await startLocal(page, { seed: "7" });
await page.screenshot({ path: `${OUT}/02-setup.png` });
await playSetup(page);
await page.screenshot({ path: `${OUT}/03-after-setup.png` });
let s = await state(page);
console.log("phase after setup:", s.phase, "turn", s.turnCounter);
await page.click('#bottom button:has-text("Roll dice")');
await page.waitForTimeout(120);
const tumbling = await page.locator("#dice .die.tumble").count();
console.log("dice tumbling:", tumbling);
if (tumbling !== 2) errors.push("the dice did not tumble on a new roll");
await page.waitForTimeout(300);
s = await state(page);
console.log("rolled:", s.rolled, "phase", s.phase, "seven?", !!s.seven, "select", s.select && s.select.kind);
await page.screenshot({ path: `${OUT}/04-rolled.png` });
await settle(page);
for (const b of ["Bank", "Trade", "Buy cards"]) {
  const btn = page.locator(`#bottom button:has-text("${b}")`);
  if (await btn.isEnabled()) { await btn.click(); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/06-${b.replace(" ", "")}.png` }); await btn.click(); }
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
// The dice history and the direction tag.
await page.click('#sidetabs button[data-tab="dice"]'); await page.waitForTimeout(100);
const bars = await page.locator("#dicepanel .hist .bar").count();
const dirTag = (await page.locator("#dirTag").textContent()) || "";
console.log("dice bars:", bars, "| direction:", dirTag);
if (bars !== 11) errors.push("the dice history did not draw");
if (!dirTag.includes("clockwise")) errors.push("the direction tag is missing");
await page.screenshot({ path: `${OUT}/07b-dice.png` });
await page.click('#sidetabs button[data-tab="feed"]');
// Zoom in and back out.
await page.click("#zoomIn"); await page.click("#zoomIn"); await page.waitForTimeout(100);
const vb = await page.getAttribute("#board", "viewBox");
await page.click("#zoomReset");
console.log("zoomed viewBox:", vb);
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
await finish(browser, errors);
