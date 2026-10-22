import test from "node:test";
import assert from "node:assert/strict";
import {siteLinks} from "../new-arcade/src/site-links.ts";

test("the arcade subdomain links back to the real main-site sections",()=>{
  const links=siteLinks("https://arcade.the420lobby.com");
  assert.equal(links.home,"https://the420lobby.com/");
  assert.equal(links.vibe,"https://the420lobby.com/#vibe");
  assert.equal(links.experiences,"https://the420lobby.com/#experiences");
  assert.equal(links.afterDark,"https://the420lobby.com/#after-dark");
  assert.equal(links.arcade,"/#games");
  assert.equal(links.top,"/#top");
});
test("existing main-site arcade URL retains its compatible relative navigation",()=>{
  const links=siteLinks("https://the420lobby.com");
  assert.equal(links.home,"/");
  assert.equal(links.arcade,"/arcade.html#games");
  assert.equal(links.top,"/arcade.html#top");
});
