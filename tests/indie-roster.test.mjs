import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const assets=[
  {
    game:'Boondock Brawlers',
    href:'https://boondocksbrawl.com/',
    path:'assets/boondock-brawlers-original-420-lobby.webp',
    sha256:'cf9af29d79f45835773800be62dd34344fdb995183311576d7576b8ad87e2a1b',
    bytes:426360,
  },
  {
    game:'Friday Fighters',
    href:'https://fridayfighters.com/',
    path:'assets/friday-fighters-original-420-lobby.webp',
    sha256:'ac7986901489d631fc42885d1e570302d7c8cacb042a85957a2acc1f49855265',
    bytes:416692,
  },
];

test('arcade uses precisely the original October 22 splash-image files',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  for(const item of assets){
    const bytes=readFileSync(new URL('../'+item.path,import.meta.url));
    assert.equal(bytes.byteLength,item.bytes,'wrong source asset size: '+item.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,
      'original art was replaced: '+item.path);
    assert.ok(source.includes('/'+item.path),'original art is not actually referenced');
    assert.ok(source.includes(item.href),'expected creator URL absent: '+item.game);
  }
  assert.doesNotMatch(source,/\/portraits\/|__portrait-grid|boondocks-brawl\.webp|friday-fighters\.webp['"]/,
    'replaced visual with game portraits or invented posters');
  assert.match(source,/width=\{1672\} height=\{941\}/);
  assert.match(source,/target="_blank" rel="noopener noreferrer"/);
  assert.match(source,/aria-label=/);
});

test('whole splash must fit responsive card without title-covering overlays',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  const css=read('new-arcade/src/components/indie-spotlight.css');
  assert.match(css,/aspect-ratio:1672\/941/);
  assert.match(css,/object-fit:contain/);
  assert.match(css,/\.indie-spotlight__meta\{/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/\.indie-spotlight__card::after|\.indie-spotlight__portrait-grid/,
    'overlays or cropped portraits hide original title and play graphic');
  assert.match(source,/Original promotional splash artwork created for The 420 Lobby Arcade/);
});

test('no external portrait origin is needed in CSP now images are local',()=>{
  const headers=read('_headers');
  assert.match(headers,/Content-Security-Policy:/);
  assert.doesNotMatch(headers,/https:\/\/boondocksbrawl\.com|https:\/\/fridayfighters\.com/,
    'creator portrait hotlink exception should not survive');
});
