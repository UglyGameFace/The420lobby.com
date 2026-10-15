import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../script.js", import.meta.url), "utf8");

test("publishes all required page sections", () => {
  for (const section of ["main", "about", "worlds", "signal", "join"]) {
    assert.match(html, new RegExp('id="' + section + '"'));
  }
  for (const brand of ["THE LOBBY", "DANK", "CINEMA", "MINECRAFT", "JAVA"]) {
    assert.ok(html.toUpperCase().includes(brand), "missing section content: " + brand);
  }
  assert.match(html, /<meta\s+name="viewport"/);
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\/styles\.css"/);
  assert.match(html, /<script\s+defer\s+src="\/script\.js"/);
});

test("every same-page link targets a real ID", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const [, target] of html.matchAll(/\bhref="#([^"]+)"/g)) {
    assert.ok(ids.has(target), "broken anchor target #" + target);
  }
});

test("does not publish obsolete or unconfirmed Minecraft ports", () => {
  assert.doesNotMatch(html, /212\.192\.28\.160|25571|25845/);
  assert.doesNotMatch(html, /minecraft:\/\/|bedrock:\/\//);
  assert.match(html, /official invite and Minecraft connection details/i);
});

test("only verified outbound links are allowed", () => {
  const outbound = [...html.matchAll(/<a\b[^>]*\bhref="(https?:[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(outbound, []);
});

test("JavaScript parses and includes interactive behavior", () => {
  assert.doesNotThrow(() => new vm.Script(js, { filename: "script.js" }));
  for (const token of ["IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame", "signal-tab", "aria-selected", "reduced-motion", "menu-toggle", "document.hidden"]) {
    assert.ok(js.includes(token), "missing runtime behavior " + token);
  }
});

test("CSS includes responsive and motion-safe fallbacks", () => {
  for (const selector of [".hero", ".portal-scene", ".card-grid", ".signal-screen", ".fx-off", ".motion-ready", "@media(max-width:760px)", "prefers-reduced-motion"]) {
    assert.ok(css.includes(selector), "missing CSS support: " + selector);
  }
  assert.match(css, /\.reveal\{opacity:1;transform:none\}/);
});

test("has an accessible navigation and signal selector", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /id="menu-toggle"[^>]*aria-controls="nav-links"/);
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.match(html, /id="signal-panel"[^>]*aria-labelledby="tab-community"/);
  assert.match(html, /id="fx-toggle"[^>]*aria-pressed="true"/);
});
