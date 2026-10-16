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
  assert.match(html,/src="\/assets\/approved-smoke-420\.svg\?v=20261016-fullzero"/);
  assert.match(smokeLogo,/viewBox="0 0 245 116"/);
  assert.match(smokeLogo,/id="smoke-zero"/);
  assert.match(smokeLogo,/id="complete-numerals"/);
  assert.match(smokeLogo,/filter="url\(#complete-420-haze\)"/);
  const textOnly=html.replace(/<(?:img|meta|link)[^>]*>/g,"");
  assert.doesNotMatch(textOnly,/haunted|haunt|ghost towns|spooky/i);
  assert.doesNotMatch(html,/UNREAL VIBES|PICK YOUR REALITY|ON ANOTHER FREQUENCY/i);
});

test("approved Cheers hero retains actual text, independent motion and original joint artwork", () => {
  assert.match(html, /<h1[^>]*aria-label="After cheers, we play\."/);
  assert.match(html, /class="headline-cheers"/);
  assert.match(html, /class="cheers-word">CHEERS,/);
  assert.match(html, /src="\/assets\/cheers-joint\.svg"/);
  assert.match(html, /href="\/cheers-hero-v1\.css\?v=20261016-hero3"/);
  assert.match(html, /href="\/styles\.css\?v=20261016-hero3"/);
  assert.match(html, /The 420 Lobby \| After Cheers, We Play/);
  assert.doesNotMatch(html, /headline-hollow">DARK,/);
  assert.match(cheersCss, /\.hero-heading-cheers \.headline-cheers/);
  assert.match(html, /class="cheers-art" src="\/assets\/approved-smoke-cheers\.svg"/);
  assert.doesNotMatch(html, /class="cheers-art"[^>]*\bheight="45"/);
  assert.match(cheersArt, /data:image\/png;base64,/);
  assert.match(html, /class="cheers-leaf" src="\/assets\/approved-leaf\.svg"/);
  assert.match(cheersCss, /\.hero-heading-cheers \.cheers-leaf\{[\s\S]*?display:block;/);
  assert.doesNotMatch(cheersCss, /content:\s*["']CHEERS,/);
  assert.doesNotMatch(cheersCss, /\.headline-cheers::before|\.headline-cheers::after/);
  assert.match(cheersCss, /@keyframes cheers-smoke-hover/);
  const hazeFrames = cheersCss.match(/@keyframes cheers-smoke-hover\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(hazeFrames, /filter:drop-shadow/);
  assert.doesNotMatch(hazeFrames, /transform:/, "smoke effects must not shift CHEERS geometry");
  assert.match(cheersCss, /@keyframes cheers-ember-pulse/);
  assert.match(cheersCss, /html\.fx-off \.hero-heading-cheers \.cheers-roll::after\{animation:none\}/);
  assert.match(cheersCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(html,/class="cheers-vapor"/);
  assert.match(cheersCss, /html\.fx-off/);
  assert.match(cheersCss, /prefers-reduced-motion:reduce/);
  for(const width of ["max-width:760px","max-width:420px","max-width:360px"]) assert.ok(cheersCss.includes(width),width);
  assert.match(jointArt, /<svg[^>]*viewBox="0 0 780 128"/);
  assert.match(jointArt, /feTurbulence/);
  assert.match(jointArt, /id="coal"/);
  assert.match(jointArt, /<\/svg>\s*$/);
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
  assert.match(html, /class="lounge-xbox-controller scene-layer" src="https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\/6\/60\/Xbox-360-Controller-Black\.png\/960px-Xbox-360-Controller-Black\.png"/);
  assert.match(css, /\.lounge-xbox-controller\{position:absolute;/);
  assert.doesNotMatch(lounge, /d="M388 777h223"/);
  assert.doesNotMatch(lounge, /d="M435 732h134l17 44H414Z"/);
  assert.match(icon, /haunted|ghost|\/svg>/i);
});

test("custom smoke 420 brand has accessible branding without the old clipped square", () => {
  assert.match(html, /<img class="logo-smoke"[^>]*src="\/assets\/approved-smoke-420\.svg\?v=20261016-fullzero"/);
  assert.match(html, /class="logo"[^>]+aria-label="The 420 Lobby home"/);
  assert.match(smokeLogo, /Smoke-formed 420 lettering/);
  assert.match(smokeLogo, /data:image\/png;base64,/);
  assert.match(smokeLogo, /viewBox="0 0 245 116"/);
  assert.match(smokeLogo, /id="smoke-zero"/);
  assert.match(smokeLogo, /fill-rule="evenodd"/);
  assert.match(smokeLogo, /id="complete-numerals"/);
  assert.match(css, /@media\(min-width:761px\) and \(max-width:1050px\)\{/);
  assert.match(css, /\.desktop-nav\.open\{display:flex\}/);
  assert.match(smokeLogo, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(html,/class="logo-glyph"/);
  assert.doesNotMatch(css,/\.logo-glyph/);
  assert.match(css,/\.fx-toggle #fx-label\{display:none\}/);
  assert.match(css,/\.scene-label\{display:none\}/);
  assert.match(html, /class="logo-type logo-prefix">THE<\/span><img class="logo-smoke"[^>]+><span class="logo-type logo-suffix">LOBBY/);
  assert.match(css,/\.logo\{display:flex;align-items:center;justify-content:center;gap:4px;flex:none;width:min\(234px,calc\(100vw - 150px\)\)/);
  assert.match(css,/\.logo-smoke\{position:static;z-index:1;translate:none;flex:1 1 auto/);
  assert.doesNotMatch(html,/class="logo-dot"/);
  assert.doesNotMatch(html, /<span class="logo-type">THE 420/);
  assert.doesNotMatch(css,/\.header-shell\{height:130px/);
  assert.match(html, /ENTER THE LOBBY<\/span>/);
  assert.match(html, /class="hero-smoke-trail" src="\/assets\/approved-left-smoke\.svg"/);
  assert.match(css, /\.hero-smoke-trail\{display:block/);
  assert.match(html, /class="fx-switch"/);
});

test("all advertised community experiences remain present", () => {
  for(const id of ["main","vibe","experiences","after-dark","join"])assert.match(html,new RegExp('id="'+id+'"'));
  for(const term of ["DANK","SHIELD","CINEMA","MINECRAFT","BEDROCK","JAVA","VOICE"])assert.ok(html.toUpperCase().includes(term),term);
  assert.equal((html.match(/<article class="experience-card/g)||[]).length,4);
  assert.equal((html.match(/class="card-body"/g)||[]).length,4);
});

test("internal anchors resolve and IDs are unique", () => {
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,"duplicate id");
  for(const [,id] of html.matchAll(/\bhref="#([^"]+)"/g)) assert.ok(ids.includes(id),"missing #"+id);
});

test("only four safe outbound official Discord invites exist", () => {
  const outgoing=[...html.matchAll(/<a\b[^>]*\bhref="(https?:[^"]+)"[^>]*>/g)];
  assert.equal(outgoing.length,4);
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

test("static Pages hosting remains build-free", () => {
  assert.match(html,/<link rel="stylesheet" href="\/styles\.css\?v=20261016-hero3">/);
  assert.match(html,/<link rel="stylesheet" href="\/sesh-signal-v3\.css">/);
  assert.match(html,/<link rel="stylesheet" href="\/cheers-hero-v1\.css\?v=20261016-hero3">/);
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
  assert.match(html,/href="#sesh-signal"/);
  assert.match(html,/src="\/sesh-signal.js"/);
  assert.match(html,/No real-world prizes or Discord roles/);
  assert.match(html,/Your best score stays on your device/);
  assert.doesNotMatch(html,/online members:\s*\d+|discord bot token|25571|25845/i);
});

test("Sesh Signal uses timed real interaction with pause, focus, and safe local scores", () => {
  assert.doesNotThrow(()=>new vm.Script(game, {filename:"sesh-signal.js"}));
  for(const feature of [
    "DURATION = 42000","requestAnimationFrame(frame)","cancelAnimationFrame",
    "localStorage.getItem","localStorage.setItem","document.hidden",
    "visibilitychange","pagehide","document.activeElement","prefers-reduced-motion",
    "saveData","catchTarget","boost()","pause(","resume()","finish()",
    "navigator.share","navigator.clipboard","aria-label","soundOn"
  ]) assert.ok(game.includes(feature),"missing game feature: "+feature);
  assert.doesNotMatch(game,/discord\.com\/api\/|discord\.gg\/.*token|fetch\s*\(/);
  assert.match(game,/state\.mode\s*!==\s*"playing"/);
  assert.match(game,/try\s*\{\s*window\.localStorage/);
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
  assert.match(html, /href="\/styles\.css\?v=20261016-hero3">[\s\S]*href="\/sesh-signal-v3\.css">/);
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

test("kit synergy, intact bonus and broken glass penalty are gameplay rules", () => {
  assert.match(game,/SAFE_GEAR = \["lighter","grinder","papers"\]/);
  assert.match(game,/HAZARDS = \["broken-bong","broken-pipe"\]/);
  assert.match(game,/state\.kit\.push\(kind\)/);
  assert.match(game,/state\.kit\.length===SAFE_GEAR\.length/);
  assert.match(game,/kitBonus=75/);
  assert.match(game,/kind === "clean-glass"/);
  assert.match(game,/state\.score=Math\.max\(0,state\.score-20\)/);
  assert.match(game,/state\.kit=\[\]/);
  assert.match(game,/state\.combo=0/);
  assert.match(game,/isHazard\(kind\)/);
  assert.match(arcadeCss,/\.sesh-item--hazard::after/);
  assert.match(arcadeCss,/\.arcade-controls\{display:grid/);
  assert.match(arcadeCss,/\.arcade-play/);
});
