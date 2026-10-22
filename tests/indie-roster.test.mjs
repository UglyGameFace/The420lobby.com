import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const assets=[
  {
    game:'Boondocks Brawl',
    href:'https://boondocksbrawl.com/',
    path:'assets/boondocks-brawl-user-zip-20261022.webp',
    sha256:'0267ae32ee1c5646d54ea2a93c12432f6a9d104121da96d7d4ded580436ae901',
    bytes:97932, width:1100, height:619
  },
  {
    game:'Friday Fighters',
    href:'https://fridayfighters.com/',
    path:'assets/friday-fighters-user-zip-20261022.webp',
    sha256:'cc07e227aa6cd58ba4f8fa24cd35f7d00bf6e4ec5d75c3c6a7745af41f8e128a',
    bytes:78260, width:765, height:620
  }
];

test('Indie Fighters uses only the exact two images from the owner-uploaded ZIP',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  for(const item of assets){
    const data=readFileSync(new URL('../'+item.path,import.meta.url));
    assert.equal(data.length,item.bytes, 'unexpected archive artwork size: '+item.path);
    assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256,
      'artwork differs from the owner-supplied ZIP: '+item.path);
    assert.ok(source.includes('/'+item.path), 'card must display uploaded image');
    assert.ok(source.includes(item.href), 'creator game link must be preserved');
  }
  assert.doesNotMatch(source,/\/portraits\/|__portrait-grid|original-420-lobby\.webp/,
    'do not silently replace owner-supplied splash art');
  assert.match(source,/width=\{game.width\} height=\{game.height\}/);
  assert.match(source,/target="_blank" rel="noopener noreferrer"/);
  assert.match(source,/aria-label=/);
});

test('show whole ZIP art on mobile without cropping or duplicate text covering its characters',()=>{
  const css=read('new-arcade/src/components/indie-spotlight.css');
  assert.match(css,/\.indie-spotlight__image\{[^}]*height:auto/);
  assert.match(css,/object-fit:contain/);
  assert.doesNotMatch(css,/\.indie-spotlight__image\{[^}]*aspect-ratio:/,
    'fixed image ratio would crop or distort one of the uploaded files');
  assert.doesNotMatch(css,/\.indie-spotlight__card::after|\.indie-spotlight__portrait-grid/,
    'overlay would cover embedded artwork');
  assert.match(css,/\.indie-spotlight__meta\{/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('owner ZIP art stays local without external image CSP exceptions',()=>{
  const headers=read('_headers');
  assert.match(headers,/Content-Security-Policy:/);
  assert.doesNotMatch(headers,/https:\/\/boondocksbrawl\.com|https:\/\/fridayfighters\.com/);
});
