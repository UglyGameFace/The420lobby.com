import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const approved={
  'Boondocks Brawl':{url:'https://boondocksbrawl.com/',names:['Huey','Riley','Granddad'],prefix:'https://boondocksbrawl.com/portraits/'},
  'Friday Fighters':{url:'https://fridayfighters.com/',names:['Craig','Smokey','Deebo'],prefix:'https://fridayfighters.com/portraits/'}
};

test('indie arcade uses character portraits from each published game roster',()=>{
  const source=read('new-arcade/src/components/IndieSpotlight.tsx');
  for(const [game,detail] of Object.entries(approved)){
    assert.ok(source.includes("title: '"+game+"'"),'missing game: '+game);
    assert.ok(source.includes(detail.url),'creator game link missing: '+game);
    for(const name of detail.names){
      assert.ok(source.includes("name:'"+name+"'"),'expected authentic character: '+name);
      assert.ok(source.includes(detail.prefix+name.toLowerCase()+'.webp'),'wrong portrait for '+name);
    }
  }
  assert.doesNotMatch(source,/image: '\/assets\/(?:boondocks-brawl|friday-fighters)\.webp'|original-420-lobby|User-provided promotional splash artwork/,
    'Do not revert to poster packs with unrelated made-up fighters');
  assert.match(source,/target="_blank" rel="noopener noreferrer"/);
  assert.match(source,/referrerPolicy="no-referrer"/);
  assert.match(source,/loading="lazy" decoding="async"/);
  assert.match(source,/Featured \$\{game.title\} characters/);
});

test('real fighter select cards keep recognisable faces and titles visible on phones',()=>{
  const css=read('new-arcade/src/components/indie-spotlight.css');
  assert.match(css,/\.indie-spotlight__roster\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.indie-spotlight__fighter-image\{[^}]*aspect-ratio:1;object-fit:contain/);
  assert.match(css,/\.indie-spotlight__card\{[^}]*min-width:0;[^}]*max-width:100%/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/@media\(max-width:355px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/\.indie-spotlight__image\{|\.indie-spotlight__card::after/,
    'do not layer invented original posters on top of real roster art');
});

test('only the two game creator origins are added to Content Security Policy image-src',()=>{
  const headers=read('_headers');
  const img=headers.match(/img-src ([^;]+);/)?.[1];
  assert.ok(img,'missing image CSP');
  assert.ok(img.includes('https://boondocksbrawl.com'));
  assert.ok(img.includes('https://fridayfighters.com'));
  assert.doesNotMatch(img,/https?:\/\/\*/,'do not authorize arbitrary image hosts');
});
