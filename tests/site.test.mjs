import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (name) => fs.readFileSync(new URL("../"+name,import.meta.url),"utf8");
const html = read("index.html");
const css = read("styles.css");
const client = read("script.js");
const renderer = read("visual-engine.js");
const leaf = read("assets/botanical-leaf.svg");
const lounge = read("assets/haunted-lounge.svg");
const icon = read("favicon.svg");
const smokeLogo = read("assets/smoke-420.svg");
const game = read("sesh-signal.js");

test("hero communicates a 420-friendly gaming community, not haunted house branding", () => {
  for(const text of ["AFTER","DARK,","WE PLAY","420 FRIENDLY","Discord","Minecraft","sesh","THE 420 LOBBY"]) {
    assert.ok(html.toLowerCase().includes(text.toLowerCase()),"missing "+text);
  }
  assert.match(html,/id="hero-heading"/);
  assert.match(html,/src="\/assets\/haunted-lounge\.svg"/);
  assert.match(html,/src="\/assets\/botanical-leaf\.svg"/);
  assert.match(html,/src="\/assets\/smoke-420\.svg"/);
  const textOnly=html.replace(/<(?:img|meta|link)[^>]*>/g,"");
  assert.doesNotMatch(textOnly,/haunted|haunt|ghost towns|spooky/i);
  assert.doesNotMatch(html,/UNREAL VIBES|PICK YOUR REALITY|ON ANOTHER FREQUENCY/i);
});

test("custom botanical art uses seven distinct serrated and veined leaflets", () => {
  assert.equal((leaf.match(/transform="rotate\(-?\d+ 300 464\)"/g)||[]).length,7);
  assert.ok((leaf.match(/<path/g)||[]).length>35);
  assert.match(leaf,/serrated leaflets/);
  assert.match(leaf,/veins/);
  assert.match(leaf,/<\/svg>\s*$/);
  assert.match(lounge,/ghostly|phantom|spectral/i);
  assert.match(lounge,/gaming controller/i);
  assert.match(icon,/haunted|ghost|\/svg>/i);
});

test("custom smoke 420 brand has accessible branding without the old clipped square", () => {
  assert.match(html, /<img class="logo-smoke"[^>]*src="\/assets\/smoke-420\.svg"/);
  assert.match(html, /class="logo"[^>]+aria-label="The 420 Lobby home"/);
  assert.match(smokeLogo, /digits 420 are formed from translucent curling vapor and feathery smoke/i);
  assert.match(smokeLogo, /fractalNoise/);
  assert.match(smokeLogo, /feDisplacementMap/);
  assert.doesNotMatch(smokeLogo,/stroke-width="23"|stroke-width="16"|filter="url\(#aura\)"/);
  assert.match(smokeLogo, /<svg[^>]*viewBox="-28 -45 476 260"/);
  assert.doesNotMatch(html,/class="logo-glyph"/);
  assert.doesNotMatch(css,/\.logo-glyph/);
  assert.match(css,/\.fx-toggle #fx-label\{display:none\}/);
  assert.match(css,/\.scene-label\{display:none\}/);
  assert.match(css,/\.logo-smoke\{width:137px;height:69px/);
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
  assert.match(html,/<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html,/<script defer src="\/script\.js"><\/script>/);
  assert.match(html,/<script defer src="\/visual-engine\.js"><\/script>/);
  assert.doesNotMatch(html,/https?:\/\/cdn\..*\/.*\.js/);
});
test("Sesh Signal is an actual arcade game section, not a placeholder", () => {
  assert.match(html,/id="sesh-signal"/);
  assert.match(html,/id="sesh-stage"/);
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
    ".sesh-target-layer", ".sesh-overlay[hidden]", ".sesh-wisp",
    ".sesh-wisp--rare", ".sesh-wisp--static", ".sesh-stage.chill-mode",
    "@media(max-width:350px)", "prefers-reduced-motion"
  ]) assert.ok(css.includes(selector), "missing arcade style "+selector);
  assert.match(css,/touch-action:manipulation/);
  assert.match(css,/\.arcade-screenreader/);
});
