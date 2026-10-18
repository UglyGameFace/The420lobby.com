/**
 * Browser integration against a local, explicit API fixture. No Discord account,
 * OAuth exchange, hosted database, or production session is created here.
 * OAuth security, replay verification and SQL persistence run in backend.test.mjs.
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createGame, RULES_VERSION, GAME_CONFIG } from "../shared/arcade-rules.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");

const root = resolve(import.meta.dirname, "..");
const mime = {".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".svg":"image/svg+xml"};
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const target = resolve(root, "." + decodeURIComponent(path === "/" ? "/index.html" : path));
    if (!target.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    const content = await readFile(target);
    response.writeHead(200, {"Content-Type":mime[extname(target)] || "application/octet-stream", "Cache-Control":"no-store"});
    response.end(content);
  } catch { response.writeHead(404); response.end("Not found"); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const address = "http://127.0.0.1:" + server.address().port;
const player = {id:"fixture-discord-id", username:"green<crew>", avatarUrl:"https://cdn.discordapp.com/embed/avatars/0.png"};

async function fixture(page, authenticated) {
  await page.route("https://cdn.discordapp.com/**", async route => route.fulfill({status:200,contentType:"image/svg+xml",body:await readFile(resolve(root,"favicon.svg"),"utf8")}));
  const state = {user:authenticated ? player : null, runs:[], submissions:[], profileLoads:0, score:0};
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    let status = 200, body;
    if (url.pathname === "/api/session") body = {configured:true,user:state.user,csrfToken:state.user ? "fixture-csrf" : null};
    else if (/^\/api\/leaderboards?$/.test(url.pathname)) body = {game:url.searchParams.get("game"),period:url.searchParams.get("period"),entries:state.score ? [{rank:1,user:player,score:state.score,playedAt:Date.now()}] : [],updatedAt:Date.now()};
    else if (url.pathname === "/api/profile") {
      state.profileLoads++;
      body = {user:state.user,stats:{runs:state.submissions.length,totalScore:state.score,gamesPlayed:state.submissions.length ? 1 : 0},bests:state.score ? [{game:"green-room-match",score:state.score,playedAt:Date.now()}] : [],achievements:state.score ? [{id:"first-spark",unlockedAt:Date.now()}] : []};
    } else if (url.pathname === "/api/runs" && request.method() === "POST") {
      assert.ok(state.user, "guest attempted to create a run");
      assert.equal(request.headers()["x-csrf-token"], "fixture-csrf");
      const input = request.postDataJSON();
      assert.deepEqual(Object.keys(input), ["game"]);
      body = {id:"fixture-run-" + (state.runs.length + 1),game:input.game,seed:"browser-integration-seed",startedAt:Date.now(),expiresAt:Date.now()+900000,rulesVersion:RULES_VERSION,durationMs:GAME_CONFIG[input.game].durationMs};
      state.runs.push(body);
    } else if (/^\/api\/runs\/[^/]+\/finish$/.test(url.pathname) && request.method() === "POST") {
      assert.equal(request.headers()["x-csrf-token"], "fixture-csrf");
      const input = request.postDataJSON();
      assert.deepEqual(Object.keys(input).sort(), ["elapsedMs", "events"]);
      assert.ok(Array.isArray(input.events));
      assert.ok(Number.isSafeInteger(input.elapsedMs));
      state.submissions.push(input);
      state.score = 777;
      body = {id:state.runs.at(-1).id,game:state.runs.at(-1).game,score:state.score,best:state.score,isPersonalBest:true,stats:{matches:6},achievements:["first-spark"]};
    } else {
      status = 404;
      body = {error:{code:"fixture_route_missing",message:"No browser fixture for " + url.pathname}};
    }
    await route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  });
  return state;
}

let browser;
try {
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,args:["--no-sandbox"]});
  await mkdir("artifacts", {recursive:true});
  for (const width of [320,390,820,1440]) {
    const page = await browser.newPage({viewport:{width,height:width < 800 ? 844 : 1000},reducedMotion:"reduce"});
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const state = await fixture(page, false);
    await page.goto(address + "/arcade.html", {waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => document.querySelector("#auth-status")?.textContent !== "Checking sign-in availability…");
    assert.equal(await page.locator(".game-card-photo").count(),3,
      width+"px landing game cards must use photographs instead of SVG collages");
    assert.equal(await page.locator(".hero-art img").getAttribute("src"),"/assets/the420lobby-neon-lounge.webp");
    const artSizing=await page.locator(".game-card .game-art").evaluateAll(wells=>wells.map(well=>{
      const rect=well.getBoundingClientRect(), img=well.querySelector(".game-card-photo");
      return {width:rect.width,height:rect.height,source:img?.getAttribute("src"),
        hasLocalFallback:getComputedStyle(well).backgroundImage.includes("the420lobby-neon-lounge.webp")};
    }));
    assert.ok(artSizing.every(x=>x.width>=150&&x.height>=120&&x.hasLocalFallback),
      width+"px game card must remain visible with or without third-party photo: "+JSON.stringify(artSizing));
    await page.locator('[data-filter="memory"]').click();
    assert.equal(await page.locator(".game-card:visible").count(), 1, "memory filter must show one game");
    await page.locator('[data-filter="all"]').click();
    assert.equal(await page.locator(".game-card:visible").count(), 3);
    await page.locator('[data-game="bong-blitz"]').click();
    await page.locator("#login-dialog").waitFor({state:"visible"});
    assert.equal(await page.locator("#login-dialog").evaluate(dialog => dialog.open), true, "guests must see the Discord gate");
    assert.equal(state.runs.length, 0, "a guest created a run");
    assert.equal(await page.locator("#game-stage").locator("button").count(), 0, "guest can access playable game controls");
    assert.equal(await page.locator("#login-dialog .discord-login").getAttribute("href"), "/auth/discord");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#login-dialog").evaluate(dialog => dialog.open), false);
    assert.equal(await page.locator(".hero-art img").evaluate(image => image.complete && image.naturalWidth > 0), true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 2, width + "px arcade has horizontal overflow: " + overflow);
    assert.equal(await page.locator('.community-card[href="/#experiences"]').count(), 1);
    assert.equal(await page.locator('.community-card[href="/#after-dark"]').count(), 1);
    await page.screenshot({path:"artifacts/arcade-guest-" + width + ".png",fullPage:true,animations:"disabled"});
    assert.deepEqual(errors, [], "uncaught guest browser errors");
    await page.close();
    console.log("PASS arcade " + width + "px: artwork, filters, Discord gate, community links, no overflow");
  }
  // Authenticated UI integration still uses only a local fixture identity.
  const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:"reduce"});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  const state = await fixture(page, true);
  await page.goto(address + "/arcade.html", {waitUntil:"domcontentloaded"});
  await page.locator("#account-chip").waitFor({state:"visible"});
  assert.equal(await page.locator("#account-name").textContent(), player.username);
  assert.equal(await page.locator("#account-avatar").getAttribute("src"), player.avatarUrl);
  assert.equal(await page.locator("#account-name crew").count(), 0, "Discord username was interpreted as HTML");
  await page.locator('[data-game="green-room-match"]').click();
  await page.locator(".mini-start").click();
  await page.waitForFunction(() => document.querySelector(".mini-game")?.dataset.mode === "playing");
  await page.clock.runFor(125);
  assert.equal(await page.locator(".mini-card-front img.mini-art-photo").count(),12,"memory cards must use photographic item art");
  await page.locator(".mini-pause").click();
  assert.equal(await page.locator(".mini-game").getAttribute("data-mode"), "paused");
  const frozen = await page.locator(".mini-timer").textContent();
  await page.clock.runFor(500);
  assert.equal(await page.locator(".mini-timer").textContent(), frozen, "pause must freeze the game clock");
  await page.locator(".mini-pause").click();
  const deck = createGame("green-room-match", "browser-integration-seed").deck;
  for (const kind of new Set(deck)) {
    const indices = deck.flatMap((card, index) => card === kind ? [index] : []);
    for (const index of indices) {
      await page.clock.runFor(150);
      const card = page.locator('.mini-card[data-card-index="' + index + '"]');
      if (await card.count() !== 1) {
        const diagnostics = await page.evaluate(() => ({
          mode:document.querySelector(".mini-game")?.dataset.mode,
          status:document.querySelector(".mini-status")?.textContent,
          timer:document.querySelector(".mini-timer")?.textContent,
          cards:document.querySelectorAll(".mini-card").length
        }));
        throw new Error("Memory card " + index + " disappeared: " + JSON.stringify(diagnostics));
      }
      await card.evaluate(button => button.click());
    }
  }
  await page.waitForFunction(() => document.querySelector(".mini-game")?.dataset.mode === "finished");
  assert.equal(await page.locator(".mini-score").textContent(), "0777", "UI must display the verified server score");
  assert.match(await page.locator(".mini-status").textContent(), /verified and saved/);
  assert.equal(state.submissions.length, 1);
  assert.equal(state.submissions[0].events.filter(event => event.type === "flip").length, 12);
  await page.waitForFunction(() => document.querySelector("#profile-content")?.textContent.includes("777"));
  assert.equal(await page.locator('[data-achievement="first-spark"]').evaluate(node => node.classList.contains("locked")), false);
  await page.screenshot({path:"artifacts/arcade-authenticated-memory.png",fullPage:true,animations:"disabled"});
  await page.locator('[data-close="game-dialog"]').click();
  await page.locator('[data-game="bong-blitz"]').click();
  await page.locator(".mini-start").click();
  await page.waitForFunction(() => document.querySelector(".mini-game")?.dataset.mode === "playing");
  const target = createGame("bong-blitz", "browser-integration-seed").targets[0];
  await page.clock.runFor(target.sweetAt + 10);
  assert.ok(await page.locator(".mini-target img.mini-art-photo").count()>0,"timing target should be a photo, not a fake glass SVG");
  await page.locator('.mini-target[data-target-id="' + target.id + '"]').evaluate(button => button.click());
  assert.ok(Number(await page.locator(".mini-score").textContent()) > 0, "timed tap should award points");
  await page.clock.runFor(31000);
  // Locator waits observe DOM mutations without requiring the page's mocked rAF
  // clock to keep ticking after runFor returns.
  try {
    await page.locator('.mini-game[data-mode="finished"]').waitFor({state:"attached",timeout:5000});
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      mode:document.querySelector(".mini-game")?.dataset.mode,
      status:document.querySelector(".mini-status")?.textContent,
      timer:document.querySelector(".mini-timer")?.textContent,
      buttons:document.querySelectorAll(".mini-target").length
    }));
    throw new Error("Bong Blitz did not finish: " + JSON.stringify({...diagnostics,submissions:state.submissions.length}) + "; " + error.message);
  }
  assert.equal(state.submissions.length, 2);
  assert.ok(state.submissions[1].events.some(event => event.type === "hit"));
  await page.locator('[data-close="game-dialog"]').click();
  state.user = null;
  await page.locator('[data-game="bong-blitz"]').click();
  await page.locator("#login-dialog").waitFor({state:"visible"});
  assert.equal(state.runs.length, 2, "an expired session must not create a round");
  assert.deepEqual(errors, [], "uncaught authenticated browser errors");
  await page.close();
  console.log("PASS fixture identity, memory matching, timing, pause/resume, transcript submission, verified scores, achievements, expired-session gate");

} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}
