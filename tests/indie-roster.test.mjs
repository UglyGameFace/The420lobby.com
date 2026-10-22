import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('indie spotlight uses named characters from both games, not AI-invented fighters',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  const expected=[
    ['Huey','https://boondocksbrawl.com/portraits/huey.webp'],
    ['Riley','https://boondocksbrawl.com/portraits/riley.webp'],
    ['Craig','https://fridayfighters.com/portraits/craig.webp'],
    ['Smokey','https://fridayfighters.com/portraits/smokey.webp'],
  ];
  for(const [name,url] of expected){
    assert.ok(source.includes("name: '"+name+"'"),'missing recognizable character: '+name);
    assert.ok(source.includes(url),'portrait not loaded from the game site: '+url);
  }
  assert.ok(source.includes('loading="lazy"'));
  assert.ok(source.includes('referrerPolicy="no-referrer"'));
  assert.ok(source.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(source.includes('aria-label='));
  assert.doesNotMatch(source,/['"]\/assets\/(?:boondocks-brawl|friday-fighters)\.webp['"]/,
    'do not bring back the fictional fighter posters');
});

test('external portrait hosts are narrowly permitted by the static Content Security Policy',()=>{
  const headers=read('_headers');
  const csp=headers.match(/Content-Security-Policy: ([^\n]+)/)?.[1];
  assert.ok(csp,'missing CSP');
  const imgSection=csp.match(/img-src ([^;]+)/)?.[1];
  assert.ok(imgSection);
  assert.match(imgSection,/https:\/\/boondocksbrawl\.com/);
  assert.match(imgSection,/https:\/\/fridayfighters\.com/);
  assert.doesNotMatch(imgSection,/https?:\/\/\*/, 'do not broadly allow all image hosts');
});

test('arcade cards preserve clear links, legible overlays and real roster credit',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  const css=read('new-arcade/src/components/indie-spotlight.css');
  assert.ok(source.includes('https://boondocksbrawl.com/'));
  assert.ok(source.includes('https://fridayfighters.com/'));
  assert.match(source,/Character portraits are displayed from the games/);
  assert.match(css,/\.indie-spotlight__portrait-grid/);
  assert.match(css,/\.indie-spotlight__fighter-name/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
