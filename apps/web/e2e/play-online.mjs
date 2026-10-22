/* Two browsers at one table through the server: Ann hosts with a bot in the
   third seat, Ben joins by code, both place their opening pieces, each sees
   only their own hand, a roll and an emoji cross over, and Ben reloads into
   his seat. Needs the dev server on :5173 and the game server on :8787. */
import { launch, clickSpot, settle, finish, OUT } from "./lib.mjs";
const SERVER = process.env.SERVER_URL || "ws://localhost:8787";
const { browser, page: ann, errors, newPage } = await launch("Ann", { width: 1300, height: 850 });

async function goOnline(page, name) {
  await page.click('#landing .way:has-text("Play online")');
  await page.fill('#modal input[placeholder="Your name"]', name);
  // The server field is hidden when the page has one built in (VITE_SERVER_URL); then it is the one to use.
  const urlIn = page.locator('#modal input[placeholder="wss://your-server"]');
  if (await urlIn.isVisible()) await urlIn.fill(SERVER);
  await page.click('#modal button:has-text("Connect")');
  await page.waitForSelector('#modal h2:has-text("Online as")', { timeout: 5000 });
}
await goOnline(ann, "Ann");
await ann.locator("#modal .seg").nth(0).locator("button", { hasText: "3" }).click();
await ann.click('#modal button:has-text("Host")');
await ann.waitForSelector('#modal h2:has-text("Table")');
const code = (await ann.locator("#modal h2").textContent()).replace("Table ", "").trim();
console.log("room", code);
await ann.screenshot({ path: `${OUT}/online-01-lobby.png` });

const ben = await newPage("Ben");
await goOnline(ben, "Ben");
await ben.fill('#modal input[placeholder="CODE"]', code);
await ben.click('#modal button:has-text("Join")');
await ben.waitForSelector('#modal h2:has-text("Table")');
await ann.waitForSelector('#modal button:has-text("Add bot")');
await ann.click('#modal button:has-text("Add bot")');
await ann.waitForSelector('#modal button:has-text("Start"):not([disabled])');
await ann.screenshot({ path: `${OUT}/online-02-ready.png` });
await ann.click('#modal button:has-text("Start")');
await ann.waitForSelector("#board .hex", { timeout: 5000 });
await ben.waitForSelector("#board .hex", { timeout: 5000 });
await ann.waitForTimeout(300);
if (!(await ann.locator("#seats .seat").nth(2).textContent()).includes("🤖")) errors.push("the bot seat is not marked on Ann's screen");

// Play the opening from whichever screen has spots; the bot places its own.
// The opening is over when the direction tag appears (it hides during setup);
// the bot may already be in its first turn by then, and may have put a trade
// to the humans, which settle() declines so the table never waits on us.
const deadline = Date.now() + 150000;
let inMain = false;
while (Date.now() < deadline && !inMain) {
  let acted = false;
  for (const p of [ann, ben]) { if (await clickSpot(p)) acted = true; await settle(p); }
  if (await ann.locator("#dirTag:not([hidden])").count()) inMain = true;
  if (!acted && !inMain) await ann.waitForTimeout(400);
}
console.log("setup finished:", inMain);
if (!inMain) { const dbg = await ann.evaluate(() => { const b = document.querySelector("#bottom"); return { note: b && b.textContent.replace(/\s+/g, " ").slice(0, 160), spots: document.querySelectorAll("#board .spot").length, landing: !document.querySelector("#landing").hidden, modal: !document.querySelector("#modal").hidden }; }); console.log("ann debug:", JSON.stringify(dbg)); const dbg2 = await ben.evaluate(() => { const b = document.querySelector("#bottom"); return { note: b && b.textContent.replace(/\s+/g, " ").slice(0, 160), spots: document.querySelectorAll("#board .spot").length, modal: !document.querySelector("#modal").hidden }; }); console.log("ben debug:", JSON.stringify(dbg2)); }
if (!inMain) errors.push("the opening did not finish");
const annMe = await ann.locator("#seats .seat.me .name").textContent();
const benMe = await ben.locator("#seats .seat.me .name").textContent();
console.log("Ann views:", annMe.trim(), "| Ben views:", benMe.trim());
if (!annMe.includes("Ann") || !benMe.includes("Ben")) errors.push("a screen is not on its own seat");
const roller = (await ann.locator('#bottom button:has-text("Roll")').count()) ? ann : (await ben.locator('#bottom button:has-text("Roll")').count()) ? ben : null;
if (roller) {
  await roller.click('#bottom button:has-text("Roll")'); await roller.waitForTimeout(500);
  const other = roller === ann ? ben : ann;
  const dice = await other.locator("#dice .die").count();
  console.log("dice seen on the other screen:", dice);
  if (dice !== 2) errors.push("the other screen did not see the roll");
}
await ann.click('#sidetabs button[data-tab="chat"]');
await ann.fill("#chatin", "hello from Ann");
await ann.press("#chatin", "Enter");
await ben.click('#sidetabs button[data-tab="chat"]');
await ben.waitForSelector('#chatlog div:has-text("hello from Ann")', { timeout: 3000 });
await ann.click("#emojiBtn");
const emoji = (await ann.locator("#emojiTray button").first().textContent()).trim();
await ann.locator("#emojiTray button").first().click();
// The bot may be taunting at the same moment, so look for Ann's emoji in particular.
const bubble = ben.locator("#seats .seat .bubble", { hasText: emoji }).first();
await bubble.waitFor({ timeout: 3000 });
console.log("emote seen on Ben's screen:", await bubble.textContent());
await ann.screenshot({ path: `${OUT}/online-04-ann.png` });
await ben.screenshot({ path: `${OUT}/online-04-ben.png` });
await ben.reload({ waitUntil: "networkidle" });
await ben.waitForSelector("#board .hex", { timeout: 8000 });
const benBack = await ben.locator("#seats .seat.me .name").textContent();
console.log("Ben after reload views:", benBack.trim());
if (!benBack.includes("Ben")) errors.push("Ben did not get his seat back after a reload");
await finish(browser, errors);
