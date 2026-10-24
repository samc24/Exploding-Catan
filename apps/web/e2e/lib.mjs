/* Shared by the browser smoke tests: launch, start a game, play the opening,
   settle whatever the table is owed, and exit non-zero on any page error. */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

export const BASE = process.env.E2E_URL ?? "http://localhost:5173/";
export const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/** A page with page errors and console errors collected into `errors`.
    `touch` makes it a phone: a touch screen, a coarse pointer, a 2x display. */
export async function launch(name = "page", viewport = { width: 1400, height: 900 }, { touch = false } = {}) {
  // E2E_PHONE=1 runs any of the tests on a phone instead.
  if (process.env.E2E_PHONE) { viewport = { width: 390, height: 844 }; touch = true; }
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  const page = await newPage(browser, name, errors, viewport, touch);
  return { browser, page, errors, newPage: (n) => newPage(browser, n, errors, viewport, touch) };
}
async function newPage(browser, name, errors, viewport, touch = false) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport });
  const page = await ctx.newPage();
  // The runner's Chrome may ask for reduced motion, which would default the game to calm and take the
  // tumble and the flights out of what these tests watch. They test the game as designed: motion full.
  await page.addInitScript(() => { try { localStorage.setItem("exploding-catan:motion", "full"); } catch { /* fine */ } });
  page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("404")) errors.push(`${name} console: ${m.text()}`);
    if (m.type() === "warning" && m.text().includes("refused")) errors.push(`${name}: ${m.text()}`);
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  return page;
}
export const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("exploding-catan:game")));
/** Reload and pick the saved game back up from the front door. */
export async function reloadInto(page) {
  await page.reload({ waitUntil: "networkidle" });
  const cont = page.locator('#landing .way:has-text("Continue last game")');
  if (await cont.count()) { await cont.click(); await page.waitForTimeout(300); }
}

/** Fill the New Game dialog and start. `bots`: which seats are bots (default none). */
export async function startLocal(page, { seed = "7", bots = [], mode = null } = {}) {
  // The landing page is the front door: pick a way in, which opens the form.
  if (await page.locator("#landing:not([hidden])").count()) {
    await page.click(bots.length ? '#landing .way:has-text("Play against bots")' : '#landing .way:has-text("Pass and play")');
    await page.waitForTimeout(150);
  }
  // Every seat human first, then the ones asked for.
  while (await page.locator('#modal button:has-text("bot")').count()) { await page.locator('#modal button:has-text("bot")').first().click(); await page.waitForTimeout(30); }
  for (const i of bots) { await page.locator('#modal label').nth(i + 1).locator("button.sm").click(); await page.waitForTimeout(30); }
  if (mode) await page.locator("#modal .seg").nth(1).locator("button", { hasText: mode }).first().click();
  await page.fill('#modal input[placeholder="random"]', seed);
  await page.click('#modal button:has-text("Start game")');
  await page.waitForTimeout(300);
}
/** One armed click on the first spot of a kind. Returns false if there was none. */
export async function clickSpot(page, selector = "#board .spot") {
  const spot = page.locator(selector);
  if (!(await spot.count())) return false;
  // A road spot is an SVG line; a vertical one has a zero-width box and Playwright will not click it even
  // forced. The board's handlers are plain click listeners, so the event is sent straight to the element.
  await spot.first().dispatchEvent("click"); await page.waitForTimeout(60);
  const armed = page.locator(selector + ".armed");
  if (await armed.count()) { await armed.first().dispatchEvent("click"); await page.waitForTimeout(150); }
  return true;
}
/** Place for whoever this screen is on until setup ends (all-human tables). */
export async function playSetup(page) {
  for (let i = 0; i < 60; i++) {
    const s = await state(page);
    if (!s.phase.startsWith("setup")) return;
    if (!(await clickSpot(page))) { await page.waitForTimeout(200); }
  }
  throw new Error("setup did not finish");
}
/** Press + until Confirm wakes up, then Confirm. */
export async function confirmDiscard(page) {
  const confirm = page.locator('#panels button:has-text("Confirm")');
  for (let j = 0; j < 12 && !(await confirm.isEnabled()); j++) {
    const plus = page.locator('#panels .counter button:has-text("+"):not([disabled])').first();
    if (!(await plus.count())) break;
    await plus.click(); await page.waitForTimeout(40);
  }
  if (await confirm.isEnabled()) await confirm.click();
  await page.waitForTimeout(150);
}
/** Answer whatever the table is owed ON THIS SCREEN with the dullest legal
    choice. Driven by what is drawn, not by the state: a pick that belongs to a
    bot or to another screen is not ours to make. */
export async function settle(page) {
  for (let k = 0; k < 8; k++) {
    if (await page.locator("#board .spot.hexpick").count()) { await clickSpot(page, "#board .spot.hexpick"); continue; }
    if (await page.locator("#panels .pick button").count() && (await page.locator('#panels h3:has-text("victim")').count())) { await page.locator("#panels .pick button").first().click(); await page.waitForTimeout(150); continue; }
    if (await page.locator('#panels button:has-text("Confirm")').count()) { await confirmDiscard(page); continue; }
    if (await page.locator('#panels button:has-text("Decline")').count()) { await page.click('#panels button:has-text("Decline")'); await page.waitForTimeout(150); continue; }
    return;
  }
}
export async function finish(browser, errors) {
  console.log("ERRORS:", errors.length ? errors : "none");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
