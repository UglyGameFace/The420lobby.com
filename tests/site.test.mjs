import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (name) => fs.readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html = read("index.html");
const css = read("styles.css");
const cheersCss = read("cheers-hero-v1.css");
const jointArt = read("assets/cheers-joint.svg");
const arcadeCss = read("sesh-signal-v3.css");
const client = read("script.js");
const renderer = read("visual-engine.js");
const leaf = read("assets/approved-leaf.svg");
const lounge = read("assets/haunted-lounge.svg");
const icon = read("favicon.svg");
const smokeLogo = read("assets/approved-smoke-420.svg");
const arcadePage=read("arcade.html");
const brandCss=read("brand-header.css");
const cheersArt = read("assets/approved-smoke-cheers.svg");
const game = read("sesh-signal.js");
const gear = read("assets/sesh-gear.svg");

test("hero communicates a 420-friendly gaming community, not haunted house branding", () => {
  for(const text of ["AFTER","CHEERS,","WE PLAY","420 FRIENDLY","Discord","Minecraft","sesh","THE 420 LOBBY"]) {
    assert.ok(html.toLowerCase().includes(text.toLowerCase()),"missing "+text);
  }
  assert.match(html,/id="hero-heading"/);
  assert.match(html,/src="\/assets\/haunted-lounge\.svg"/);
  assert.match(html,/src="\/assets\/approved-leaf\.svg"/);
  assert.match(html,/src="\/assets\/lobby-smoke-420-still\.webp\?v=20261017-smoke-flow4"/);
  assert.match(smokeLogo,/viewBox="0 0 245 116"/);
  assert.match(smokeLogo,/id="smoke-zero"/);
  assert.match(smokeLogo,/id="complete-numerals"/);
  assert.match(smokeLogo,/filter="url\(#complete-420-haze\)"/);
  const textOnly=html.replace(/<(?:img|meta|link)[^>]*>/g,"");
  assert.doesNotMatch(textOnly,/haunted|haunt|ghost towns|spooky/i);
  assert.doesNotMatch(html,/UNREAL VIBES|PICK YOUR REALITY|ON ANOTHER FREQUENCY/i);
});

test("CHEERS and the realistic lit blunt have anchored motion within photographed smoke frames",()=>{
  assert.match(html, /<h1[^>]*aria-label="After cheers, we play\."/);
  assert.match(html, /class="cheers-word">CHEERS,/);
  assert.match(html, /class="cheers-art" src="\/assets\/cheers-real-smoke-blunt\.webp\?v=20261017-smoke-flow4"/);
  assert.match(html, /data-smoke-motion="\/assets\/cheers-real-smoke-blunt-loop\.webp\?v=20261017-smoke-flow4"/);
  assert.doesNotMatch(html,/class="cheers-roll"/);
  assert.doesNotMatch(html,/class="cheers-leaf"/);
  assert.doesNotMatch(html,/src="\/assets\/approved-smoke-cheers\.svg"/);
  assert.match(cheersCss,/\.hero-heading-cheers \.headline-cheers/);
  assert.match(cheersCss,/aspect-ratio:1100\/367/);
  assert.match(cheersCss,/width:min\(5\.85em,100%\)/);
  assert.match(cheersCss,/object-fit:contain/);
  assert.match(cheersCss,/transform:none;translate:none;animation:none/);
  assert.doesNotMatch(cheersCss,/@keyframes cheers-smoke-hover|@keyframes cheers-ember-pulse|translateY\(/);
  assert.match(cheersCss,/prefers-reduced-motion:reduce/);
  assert.match(cheersCss,/html\.fx-off/);
  assert.doesNotMatch(html,/class="cheers-vapor"/);
  for(const width of ["max-width:760px","max-width:420px","max-width:360px"]) assert.ok(cheersCss.includes(width),width);
  const motion=fs.readFileSync(new URL("../assets/cheers-real-smoke-blunt-loop.webp",import.meta.url));
  assert.equal(motion.toString("ascii",8,12),"WEBP");
  assert.ok((motion.toString("latin1").match(/ANMF/g)||[]).length>=20,
    "CHEERS must have many distinct smoke-animation frames instead of CSS pulsing");
});

test("approved natural leaf art replaces the old geometric foreground", () => {
  assert.match(leaf, /Organic green leaf from approved design/);
  assert.match(leaf, /data:image\/png;base64,/);
  assert.match(leaf, /viewBox="0 0 130 185"/);
  assert.match(html, /src="\/assets\/approved-leaf\.svg" class="botanical-foreground/);
  assert.match(html, /class="card-foliage-photo" src="https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\/8\/81\/Cannabis-leaf-hemp\.jpg\/960px-Cannabis-leaf-hemp\.jpg"/);
  assert.match(html, /class="seal-cannabis-photo" src="https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/f\/ff\/Potleaf\.jpg"/);
  assert.doesNotMatch(html, /class="leaf-seal"[^>]*>\s*<img src="\/assets\/botanical-leaf\.svg"/);
  assert.match(css, /\.leaf-seal img\.seal-cannabis-photo\{position:absolute;/);
  assert.doesNotMatch(html, /class="card-leaf" src="\/assets\/botanical-leaf\.svg"/);
  assert.match(css, /\.card-foliage-photo\{position:absolute;/);
  assert.match(lounge, /controller is rendered by the image in the hero scene/i);
  assert.doesNotMatch(lounge, /id="lounge-controller"/, "do not keep the fake drawn gamepad");
  assert.match(html, /class="lounge-xbox-controller scene-layer" src="https:\/\/commons\.wikimedia\.org\/wiki\/Special:Redirect\/file\/Xbox_Series_Controller_Carbon_Black\.jpg"/);
  assert.match(css, /\.lounge-xbox-controller\{display:none\}/, "do not display a rectangular controller photograph behind the hero");
  assert.match(css, /\.lounge-xbox-controller\{position:absolute;/);
  assert.doesNotMatch(lounge, /d="M388 777h223"/);
  assert.doesNotMatch(lounge, /d="M435 732h134l17 44H414Z"/);
  assert.match(icon, /haunted|ghost|\/svg>/i);
});

test("photo-real smoke moves in raster frames, with a clean text header and preserved lower banner", () => {
  assert.match(html,/class="logo brand-lockup"/);
  assert.match(html,/class="[^"]*brand-lockup__the">THE<\/span>/);
  assert.match(html,/class="[^"]*brand-lockup__lobby">LOBBY<\/span>/);
  assert.match(html,/class="brand-smoke-image" src="\/assets\/lobby-smoke-420-still\.webp\?v=20261017-smoke-flow4"/);
  assert.match(html,/data-smoke-motion="\/assets\/lobby-smoke-420-loop\.webp\?v=20261017-smoke-flow4"/);
  assert.match(html,/src="\/smoke-brand\.js"/);
  assert.match(arcadePage,/class="brand brand-lockup brand-lockup--arcade"/);
  assert.match(arcadePage,/data-smoke-motion="\/assets\/lobby-smoke-420-loop\.webp\?v=20261017-smoke-flow4"/);
  assert.doesNotMatch(html,/class="brand-wordmark-image"/);
  assert.doesNotMatch(arcadePage,/class="brand brand-image"/);
  assert.match(brandCss,/\.brand-lockup__smoke/);
  assert.match(brandCss,/@media\s*\(max-width:760px\)/);
  assert.match(html,/class="lobby-brand-banner"/);
  assert.match(html,/src="\/assets\/the420lobby-neon-lounge\.webp"/);
  assert.match(html,/aria-label="The 420 Lobby home"/);
  assert.match(html,/ENTER THE LOBBY<\/span>/);
  assert.match(html,/class="hero-smoke-trail" src="\/assets\/approved-left-smoke\.svg"/);
  assert.match(html,/class="fx-switch"/);
  const animated=fs.readFileSync(new URL("../assets/lobby-smoke-420-loop.webp",import.meta.url));
  const poster=fs.readFileSync(new URL("../assets/lobby-smoke-420-still.webp",import.meta.url));
  for(const asset of [animated,poster]){
    assert.equal(asset.toString("ascii",0,4),"RIFF");
    assert.equal(asset.toString("ascii",8,12),"WEBP");
  }
  assert.ok(animated.includes(Buffer.from("ANIM")) && (animated.toString("latin1").match(/ANMF/g)||[]).length>=30,"must have many real smoke-flow frames, not a bobbing sprite");
  assert.ok(animated.length>100000 && animated.length<2000000,"real animation should be mobile-friendly");
  assert.ok(poster.length<100000,"reduced-motion still must be lightweight");
  assert.match(smokeLogo,/Smoke-formed 420 lettering/); // legacy source is retained, never used in header
  assert.doesNotMatch(brandCss,/translateY\(|animation:[^;]*bounce/);
  assert.match(brandCss,/width:clamp\(110px,37vw,148px\)/);
});

test("Dank Shield is semantic responsive content, not a stretched poster", () => {
  const redesign=read("lobby-redesign.css");
  assert.ok(html.includes('class="dank-shield-weedtech-art" src="/assets/dank-shield-weedtech-card.webp"'));
  assert.ok(!html.includes('dank-shield-logo.avif'),"old uploaded Shield image must not be displayed");
  const art=fs.readFileSync(new URL("../assets/dank-shield-weedtech-card.webp",import.meta.url));
  assert.ok(art.length>4000&&art.length<200000,"optimized Shield card art must be present and lightweight");
  assert.equal(art.toString("ascii",0,4),"RIFF");
  assert.equal(art.toString("ascii",8,12),"WEBP");
  assert.ok(!html.includes('file_00000000b25c822f94a1d2b422440108.png'));
  assert.ok(html.includes('class="shield-feature-art"'));
  assert.ok(html.includes('class="shield-feature-copy"'));
  assert.ok(html.includes('id="shield-title"'));
  assert.ok(html.includes("02 // PROTECTION · VERIFICATION · MODERATION"));
  assert.ok(html.includes("PROTECT THE LOBBY"));
  assert.ok(html.includes('class="card-link shield-card-link" href="https://discord.gg/the420lobby"'));
  assert.ok(html.includes('href="/lobby-redesign.css?v=20261018-weedtech-card2"'));
  for (const rule of [".experience-grid>.shield-card{display:flex!important",
    ".hero-content", ".arcade-layout", ".community-proof .proof-grid",
    "@media(max-width:1100px)", "@media(max-width:760px)", "@media(max-width:460px)"])
    assert.ok(redesign.includes(rule), "missing responsive rule: " + rule);
});

test("experience cards use real licensed media and a unified design",()=>{
  const redesign=read("lobby-redesign.css");
  assert.match(html,/class="cinema-photo" src="https:\/\/thumb\.wikimedia\.org\/[^"]+Empty_Movie_Theater/);
  assert.match(html,/class="minecraft-photo" src="https:\/\/thumb\.wikimedia\.org\/[^"]+Minecraft_Beta_1\.8\.1_Gameplay_Screenshot/);
  assert.doesNotMatch(html,/class="film-reel"|class="voxel-scape"|class="cinema-beam"/);
  assert.match(redesign,/\.experience-card \.card-visual,\.experience-grid>\.shield-card \.shield-feature-art\{/);
  assert.match(redesign,/\.experience-card \.card-body h3,\.shield-feature-copy h3\{/);
  for(const text of ["PLAN A MOVIE NIGHT","GET SERVER UPDATES","SEE DANK SHIELD IN THE LOBBY"])assert.ok(html.includes(text));
  assert.doesNotMatch(css,/Approved Dank Shield poster/);
});

test("all advertised community experiences remain present", () => {
  for(const id of ["main","vibe","experiences","after-dark","join"])assert.match(html,new RegExp('id="'+id+'"'));
  for(const term of ["DANK","SHIELD","CINEMA","MINECRAFT","BEDROCK","JAVA","VOICE"])assert.ok(html.toUpperCase().includes(term),term);
  assert.equal((html.match(/<article class="experience-card/g)||[]).length,4);
  assert.equal((html.match(/class="card-body"/g)||[]).length,3, "Other cards retain HTML content");
  assert.equal((html.match(/class="shield-feature-copy"/g)||[]).length,1,"Shield has readable text, not text baked into an image");
});

test("internal anchors resolve and IDs are unique", () => {
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,"duplicate id");
  for(const [,id] of html.matchAll(/\bhref="#([^"]+)"/g)) assert.ok(ids.includes(id),"missing #"+id);
});

test("website outbound links use only the official Discord invitation, never the source repository", () => {
  const outgoing=[...html.matchAll(/<a\b[^>]*\bhref="(https?:[^"]+)"[^>]*>/g)];
  const urls=outgoing.map(([,url])=>url);
  assert.equal(urls.filter(url=>url==="https://discord.gg/the420lobby").length,7);
  assert.doesNotMatch(html,/https:\/\/github\.com\//i,"source repository must not appear on the public website");
  assert.equal(urls.length,7,"unexpected external destination");
  for(const [tag,url] of outgoing){
    assert.equal(url,"https://discord.gg/the420lobby");
    assert.match(tag,/target="_blank"/);
    assert.match(tag,/rel="noopener noreferrer"/);
  }
});

test("does not invent server stats, Minecraft addresses, or Discord API credentials", () => {
  assert.doesNotMatch(html,/212\.192\.28\.160|25571|25845|minecraft:\/\/|bedrock:\/\//);
  assert.doesNotMatch(html,/live member count|online members: \d+|discord bot token|api token/i);
  assert.match(html,/Minecraft connection details will be published/);
});

test("WebGL renders custom atmospheric shader and degrades gracefully", () => {
  assert.doesNotThrow(()=>new vm.Script(renderer));
  for(const token of ["webglcontextlost","webglcontextrestored","getContext(\"webgl\"","createShader","createProgram","fbm(","requestAnimationFrame","cancelAnimationFrame","visibilitychange","prefers-reduced-motion","saveData","setEnabled"]) {
    assert.ok(renderer.includes(token), "missing "+token);
  }
  assert.doesNotMatch(renderer,/smoothstep\(1\.6,\.2/);
  assert.match(html,/id="depth-canvas"/);
  assert.equal((html.match(/id="depth-canvas"/g)||[]).length,1);
});

test("interaction controller preserves useful controls and reduced motion", () => {
  assert.doesNotThrow(()=>new vm.Script(client));
  for(const token of ["aria-expanded","menu-toggle","scroll-progress","LobbyAtmosphere","reduced-motion","saveData","IntersectionObserver","interactive-card"]) {
    assert.ok(client.includes(token), "missing "+token);
  }
  assert.match(html,/id="menu-toggle"[^>]*aria-controls="primary-nav"/);
  assert.match(html,/id="fx-toggle"[^>]*aria-pressed="true"/);
  assert.match(html,/class="skip-link"/);
});

test("CSS has original haunted experience and mobile/performance fallbacks",()=>{
  for(const item of [".hero-scene",".botanical-foreground",".scene-cobweb",".experience-card",".reality-section",".reality-prism",".reality-slit",".logo-smoke",".join",".fx-off","prefers-reduced-motion","@media(max-width:760px)","@media(hover:none)"])assert.ok(css.includes(item),item);
  assert.doesNotMatch(css,/\.portal-ring|--magenta:/);
  assert.match(css,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(css,/experience-card:nth-child\(4n\+1\)/);
  assert.match(css,/experience-card:nth-child\(n\)\{grid-column:1/);
  assert.match(css,/\.entrance,\.reveal\{opacity:1;/);
  const noComments=css.replace(/\/\*[\s\S]*?\*\//g,"").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,"");
  let depth=0;
  for(const c of noComments){if(c==="{")depth++;if(c==="}")depth--;assert.ok(depth>=0,"extra CSS brace");}
  assert.equal(depth,0);
});

test("the homepage remains a build-free static shell", () => {
  assert.match(html,/<link rel="stylesheet" href="\/styles\.css\?v=20261016-shieldmobile29">/);
  assert.match(html,/<link rel="stylesheet" href="\/sesh-signal-v3\.css">/);
  assert.match(html,/<link rel="stylesheet" href="\/cheers-hero-v1\.css\?v=[^"]+">/);
  assert.match(html,/<script defer src="\/script\.js"><\/script>/);
  assert.match(html,/<script defer src="\/visual-engine\.js"><\/script>/);
  assert.doesNotMatch(html,/https?:\/\/cdn\..*\/.*\.js/);
});
test("Sesh Signal is an actual arcade game section, not a placeholder", () => {
  assert.match(html,/id="sesh-signal"/);
  assert.match(html,/id="sesh-stage"/);
  assert.match(html, /class="arcade-machine" aria-label="Sesh Signal mini-game"/);
  assert.doesNotMatch(html,/class="arcade-machine reveal"/);
  assert.match(html,/id="sesh-start"/);
  assert.match(html,/id="sesh-pause"[^>]*disabled/);
  assert.match(html,/id="sesh-boost"[^>]*disabled/);
  assert.match(html,/id="sesh-share"[^>]*disabled/);
  assert.match(html,/id="sesh-sound"/);
  assert.match(html,/id="sesh-target-layer"/);
  assert.match(html,/id="sesh-overlay"/);
  assert.match(html,/id="sesh-best"/);
  assert.match(html,/id="sesh-score"/);
  assert.match(html,/id="sesh-announcement"[^>]*role="status"/);
  assert.match(html,/href="\/arcade\.html"/);
  assert.match(html,/src="\/sesh-loader.js"/);
  assert.doesNotMatch(html, /<script[^>]*src="\/sesh-signal\.js"/);
  assert.match(html,/No real-world prizes or Discord roles/);
  assert.doesNotMatch(html,/Your best score stays on your device|No account required/);
  assert.match(html,/Discord/i);
  assert.match(html, /id="sesh-start"[^>]*disabled/);
  assert.doesNotMatch(html,/online members:\s*\d+|discord bot token|25571|25845/i);
});

test("Sesh Signal requires an authenticated server run and records input rather than trusting client scores", () => {
  const api = read("arcade-api.js");
  const loader = read("sesh-loader.js");
  for (const feature of ["/api/session", "/api/runs", "X-CSRF-Token", "csrfToken", "elapsedMs", "events"]) {
    assert.ok(api.includes(feature), "missing secure game API feature: " + feature);
  }
  for (const feature of ["createEngine", "startAuthenticatedRun", "saveAuthenticatedRun"]) {
    assert.ok(game.includes(feature), "missing verified game feature: " + feature);
  }
  assert.doesNotMatch(game, /localStorage|DISCORD_CLIENT_SECRET|client_secret/);
  assert.match(loader, /if \(!session\.user\)/);
  assert.match(loader, /start\.disabled = true/);
  assert.match(loader, /script\.src = '\/sesh-signal\.js'/);
  assert.match(game, /visibilitychange|document\.hidden/);
});

test("custom arcade styling supports touch, keyboard, and phones", () => {
  for(const selector of [
    ".sesh-arcade", ".arcade-layout", ".arcade-machine",
    ".sesh-target-layer", ".sesh-overlay[hidden]", ".sesh-item",
    ".sesh-item--clean-glass", ".sesh-item--hazard", ".sesh-item-art", ".sesh-stage.chill-mode",
    "@media(max-width:350px)", "prefers-reduced-motion"
  ]) assert.ok(arcadeCss.includes(selector), "missing arcade style "+selector);
  assert.match(arcadeCss,/touch-action:manipulation/);
  assert.match(arcadeCss,/\.arcade-screenreader/);
});


test("arcade CSS is independently versioned and not hidden in stale global styles", () => {
  assert.match(html, /href="\/styles\.css\?v=20261016-shieldmobile29">[\s\S]*href="\/sesh-signal-v3\.css">/);
  assert.match(arcadeCss,/\.sesh-arcade\{/);
  assert.match(arcadeCss,/\.sesh-stage\{/);
  assert.match(arcadeCss,/\.arcade-machine\{/);
  assert.doesNotMatch(css,/\.sesh-arcade\{/);
  const allLinks = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)];
  assert.ok(allLinks.some(m=>m[0].includes("/sesh-signal-v3.css")),"independent arcade stylesheet not linked");
  let depth = 0;
  for (const ch of arcadeCss.replace(/\/\*[\s\S]*?\*\//g,"").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,"")) {
    if(ch === "{") depth++;
    if(ch === "}") depth--;
    assert.ok(depth >= 0,"arcade CSS has unmatched closing brace");
  }
  assert.equal(depth,0,"arcade CSS has unmatched opening brace");
});


test("Sesh accessories are custom illustrated rather than emoji placeholders", () => {
  for(const id of ["lighter","grinder","papers","clean-glass","broken-bong","broken-pipe"]){
    assert.match(gear,new RegExp('<symbol id="'+id+'"'));
    assert.ok(game.includes('"'+id+'"'),"missing playable accessory "+id);
  }
  assert.match(game,/createElementNS\("http:\/\/www\.w3\.org\/2000\/svg","svg"\)/);
  assert.match(game,/assets\/sesh-gear\.svg#/);
  assert.match(html,/COLLECT USEFUL GEAR/);
  assert.match(html,/AVOID BROKEN GLASS/);
  assert.match(html,/<details class="arcade-help">/);
  assert.match(html,/class="arcade-play"/);
  assert.match(html,/class="arcade-rules-strip"/);
  for(const name of ["lighter","grinder","papers"])assert.match(html,new RegExp('data-kit="'+name+'"'));
  assert.match(game,/querySelectorAll\("\.sesh-kit-tracker \[data-kit\]"\)/);
});

test("shared verified rules preserve Sesh Signal kit bonuses and glass hazards", () => {
  const rules = read("shared/arcade-rules.mjs");
  for (const term of ["sesh-signal", "green-room-match", "bong-blitz", "lighter", "grinder", "papers", "clean-glass", "broken-bong", "broken-pipe"]) {
    assert.ok(rules.includes(term), "missing shared rules: " + term);
  }
  for (const selector of [".sesh-item--hazard::after", ".arcade-controls{display:grid", ".arcade-play"]) {
    assert.ok(arcadeCss.includes(selector), "missing accessible game style: " + selector);
  }
});

test("the full arcade preserves community links and provides accessible Discord gates", () => {
  const page = read("arcade.html");
  for (const feature of ["THE", "LOBBY", "Discord", "Sesh Signal", "Green Room", "Bong Blitz", "Minecraft", "Cinema"]) {
    assert.ok(page.toLowerCase().includes(feature.toLowerCase()), "arcade missing " + feature);
  }
  for (const id of ["login-dialog", "game-dialog", "game-stage", "leaderboard-rows", "profile-content"]) {
    assert.match(page, new RegExp('id="' + id + '"'));
  }
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "arcade IDs must remain unique");
  for (const [,id] of page.matchAll(/\bhref="#([^"]+)"/g)) assert.ok(ids.includes(id), "missing arcade #" + id);
  assert.match(page, /class="skip-link"/);
  assert.match(page, /<dialog/);
  assert.match(page, /href="\/auth\/discord/);
  assert.match(page, /src="\/arcade-app\.js"/);
  assert.match(html, /href="\/arcade\.html"/);
});

test("frontend code never contains Discord secrets or stores authentication tokens", () => {
  for (const path of ["index.html", "arcade.html", "arcade-app.js", "arcade-api.js", "arcade-games.js", "sesh-signal.js", "sesh-loader.js", "script.js"]) {
    const source = read(path);
    assert.doesNotMatch(source, /DISCORD_CLIENT_SECRET|client_secret\s*[:=]|discordAccessToken|access_token\s*[:=]|refresh_token\s*[:=]/i, path + " exposes an OAuth secret or token");
    assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*(?:token|session|auth)/i, path + " stores browser-readable authentication state");
  }
});

test("arcade styles support keyboard focus, reduced motion and narrow screens", () => {
  const styles = read("arcade.css") + read("arcade-games.css");
  assert.match(styles, /focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /@media/);
  assert.match(styles, /touch-action/);
  let depth = 0;
  for (const character of styles.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "")) {
    if (character === "{") depth++;
    if (character === "}") depth--;
    assert.ok(depth >= 0, "unmatched arcade CSS closing brace");
  }
  assert.equal(depth, 0, "unmatched arcade CSS opening brace");
});
