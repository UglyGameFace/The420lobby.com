import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fridayPortraits,validatePortrait,buildFridayPortraits} from '../scripts/friday-portraits.mjs';

const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(1300)]);
test('download source mapping is pinned to Craig, Smokey and Deebo from the same documented game gallery',()=>{
  assert.deepEqual(fridayPortraits.map(x=>x.name),['Craig','Smokey','Deebo']);
  assert.equal(new Set(fridayPortraits.map(x=>x.filename)).size,3);
  assert.ok(fridayPortraits.every(x=>x.source.startsWith('https://img.tools366.com/soflo-wheelie-life/')));
});

test('all three Friday portraits are verified as WebP and included as same-origin assets',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'friday-roster-'));
  const called=[];
  try{
    await buildFridayPortraits(dir,async url=>{
      called.push(url);
      return new Response(webp,{status:200,headers:{'Content-Type':'image/webp','Content-Length':String(webp.length)}});
    });
    assert.equal(called.length,3);
    for(const item of fridayPortraits){
      const bytes=await readFile(join(dir,item.filename));
      validatePortrait(bytes,item.name);
      assert.deepEqual(bytes,webp);
    }
  }finally{await rm(dir,{recursive:true,force:true})}
});

test('missing or HTML upstream images fail the build, never ship three broken portraits',async()=>{
  assert.throws(()=>validatePortrait(Buffer.from('<html>404 Not Found</html>'),'Craig'),/valid WebP/);
  const dir=await mkdtemp(join(tmpdir(),'friday-bad-'));
  try{
    await assert.rejects(()=>buildFridayPortraits(dir,async()=>new Response('Not found',{status:404})),/HTTP 404/);
    await assert.rejects(()=>buildFridayPortraits(dir,async()=>new Response('fake markup',{status:200})),/valid WebP/);
  }finally{await rm(dir,{recursive:true,force:true})}
});
