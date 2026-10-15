import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const html = read("index.html");
const css = read("styles.css");
const js = read("script.js");
const artwork = read("assets/gaming-420-world.svg");
const invite = "https://discord.gg/the420lobby";

test("the hero immediately communicates 420-friendly gaming, not a generic club", () => {
  for (const term of ["SPAWN IN.", "SPARK UP.", "SQUAD UP.", "420-friendly", "Minecraft", "movie nights", "gaming"]) {
    assert.ok(html.toLowerCase().includes(term.toLowerCase()), "missing: " + term);
  }
  assert.match(html, /<h1 id="hero-title"/);
  assert.match(html, /src="\/assets\/gaming-420-world\.svg"/);
  assert.doesNotMatch(html, /REAL PEOPLE\.|UNREAL|WELCOME TO YOUR NEW DIMENSION/);
  assert.match(html, /<meta name="description" content="[^"]+420-friendly/);
});

test("the artwork is a standalone gamepad and cannabis illustration", () => {
  assert.match(artwork, /<svg\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(artwork, /viewBox="0 0 800 820"/);
  assert.match(artwork, /game controller/i);
  assert.match(artwork, /cannabis leaf/i);
  assert.match(artwork, /[Ss]moke/);
  assert.match(artwork, /<\/svg>\s*$/);
});

test("all core page features remain advertised", () => {
  for (const id of ["main", "about", "worlds", "signal", "join"]) {
    assert.match(html, new RegExp('\\bid="' + id + '"'));
  }
  for (const word of ["DANK", "SHIELD", "CINEMA", "MINECRAFT", "JAVA", "BEDROCK", "420 LOBBY"]) {
    assert.ok(html.toUpperCase().includes(word), "missing feature: " + word);
  }
  assert.equal((html.match(/<article class="world-card/g) || []).length, 4);
});

test("same-page navigation has no broken anchors", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const [, target] of html.matchAll(/\bhref="#([^"]+)"/g)) {
    assert.ok(ids.has(target), "broken same-page link #" + target);
  }
});

test("Discord buttons always use the confirmed custom invitation", () => {
  const anchors = [...html.matchAll(/<a\b[^>]*\bhref="(https?:[^"]+)"[^>]*>/g)];
  assert.equal(anchors.length, 4, "header, hero, hangout card, and final join CTA");
  for (const [tag, target] of anchors) {
    assert.equal(target, invite);
    assert.match(tag, /\btarget="_blank"/);
    assert.match(tag, /\brel="noopener noreferrer"/);
  }
});

test("unverified Minecraft addresses and old ports remain unpublished", () => {
  assert.doesNotMatch(html, /212\.192\.28\.160|25571|25845|minecraft:\/\/|bedrock:\/\//);
  assert.match(html, /Minecraft server connection details are being updated/);
  assert.doesNotMatch(html, /the420lobbybur|OFFICIAL DISCORD INVITE COMING SOON/);
});

test("interactive scripts parse and preserve accessible behavior", () => {
  assert.doesNotThrow(() => new vm.Script(js, { filename: "script.js" }));
  for (const feature of ["IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame", "signal-tab", "aria-selected", "reduced-motion", "menu-toggle", "document.hidden"]) {
    assert.ok(js.includes(feature), "missing runtime behavior: " + feature);
  }
  assert.match(js, /MODE 001 \/\/ THE HANGOUT/);
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /id="fx-toggle"[^>]*aria-pressed="true"/);
});

test("the site includes gaming HUD, responsive layouts and reduced motion", () => {
  for (const selector of [".hero", ".portal-scene", ".scene-art", ".game-hud", ".com-leaf", ".world-card", ".signal-screen", "html.fx-off", "html.motion-ready", "prefers-reduced-motion", "@media(max-width:760px)"]) {
    assert.ok(css.includes(selector), "missing CSS: " + selector);
  }
  assert.match(css, /\.reveal\{opacity:1;transform:none/);
  assert.doesNotMatch(css, /--magenta:|\.portal-ring/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<link rel="stylesheet" href="\/styles\.css"/);
  assert.match(html, /<script defer src="\/script\.js"/);
});

test("page style braces and asset references are consistent", () => {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  let depth = 0;
  for (const char of noComments) {
    if (char === "{") depth++;
    if (char === "}") depth--;
    assert.ok(depth >= 0, "unmatched closing CSS brace");
  }
  assert.equal(depth, 0, "unmatched opening CSS braces");
  assert.match(html, /href="\/favicon\.svg"/);
});
