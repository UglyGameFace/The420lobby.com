import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

// Byte-exact WebP files extracted from the owner's indie-fighter-splash-links.zip.
// Git blob SHAs: 765b4dea2b852c0a22ca77c130a7141c2f3545af
// and b554f8f52a8202402ad272e399cb752c38473928.
const assets=[
  {game:'Boondocks Brawl',href:'https://boondocksbrawl.com/',
    path:'assets/boondocks-brawl.webp',
    sha256:'0267ae32ee1c5646d54ea2a93c12432f6a9d104121da96d7d4ded580436ae901',
    bytes:97932,width:1100,height:619},
  {game:'Friday Fighters',href:'https://fridayfighters.com/',
    path:'assets/friday-fighters.webp',
    sha256:'cc07e227aa6cd58ba4f8fa24cd35f7d00bf6e4ec5d75c3c6a7745af41f8e128a',
    bytes:78260,width:765,height:620},
];

test('actual user ZIP poster files are used, byte for byte, without substitutions',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  for(const item of assets){
    const file=readFileSync(new URL('../'+item.path,import.meta.url));
    assert.equal(file.byteLength,item.bytes,'size differs from uploaded ZIP: '+item.path);
    assert.equal(createHash('sha256').update(file).digest('hex'),item.sha256,
      'poster differs from uploaded ZIP: '+item.path);
    assert.ok(source.includes('/'+item.path),'ZIP poster is not rendered: '+item.path);
    assert.ok(source.includes(item.href),'game link missing: '+item.game);
    assert.ok(source.includes('width: '+item.width),'wrong image intrinsic width');
    assert.ok(source.includes('height: '+item.height),'wrong image intrinsic height');
  }
  assert.match(source,/src=\{game.image\} width=\{game.width\} height=\{game.height\}/);
  assert.doesNotMatch(source,/original-420-lobby\.webp|\/portraits\//,
    'Do not replace the uploaded ZIP with prior unrelated generations or portrait hotlinks');
  assert.match(source,/target="_blank" rel="noopener noreferrer"/);
});

test('full posters render cleanly on phones without cropping or cover-up overlays',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  const css=read('new-arcade/src/components/indie-spotlight.css');
  assert.match(css,/\.indie-spotlight__image\{[^}]*width:100%;height:auto;max-width:100%;object-fit:contain/);
  assert.match(css,/\.indie-spotlight__card\{[^}]*min-width:0;[^}]*max-width:100%/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css,/\.indie-spotlight__card::after|\.indie-spotlight__portrait-grid/,
    'Do not cover up original titles and play graphics');
  assert.match(source,/User-provided promotional splash artwork/);
});

test('image CSP uses same-origin ZIP artwork, not remote hotlinked portraits',()=>{
  const headers=read('_headers');
  assert.match(headers,/Content-Security-Policy:/);
  assert.doesNotMatch(headers,/https:\/\/boondocksbrawl\.com|https:\/\/fridayfighters\.com/);
});
