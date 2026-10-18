import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root = resolve(import.meta.dirname,'..');
function walk(path) {
  return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(path,entry.name)):[join(path,entry.name).slice(root.length+6)]);
}
test('production assets retain all games and branding while excluding private source and configuration',async()=>{
  await import('../scripts/build-static.mjs');
  const files=walk(join(root,'dist'));
  for(const name of ['index.html','arcade.html','sesh-signal.js','arcade-games.js','arcade-api.js','shared/arcade-rules.mjs','assets/arcade-night.svg','assets/dank-shield-weedtech-card.webp','assets/the420lobby-neon-lounge.webp','assets/lobby-smoke-420-loop.webp','assets/lobby-smoke-420-still.webp','assets/cheers-real-smoke-blunt.webp','assets/cheers-real-smoke-blunt-loop.webp','smoke-brand.js','brand-header.css','_routes.json','_headers']) assert.ok(files.includes(name),name);
  for(const path of files) assert.doesNotMatch(path,/(?:^|\/)(?:functions|tests|migrations|scripts|node_modules|docs|\.git|\.env|\.dev\.vars|wrangler|README)/);
  const routes=JSON.parse(readFileSync(join(root,'dist/_routes.json'),'utf8'));
  for(const name of ['/sesh-signal.js','/arcade-games.js','/api/*','/auth/*']) assert.ok(routes.include.includes(name),'missing auth route '+name);
  assert.doesNotMatch(readFileSync(join(root,'dist/arcade-app.js'),'utf8'),/DISCORD_CLIENT_SECRET/);
  for (const name of ['the420lobby-neon-lounge.webp','the420lobby-wordmark.webp']) {
    const data=readFileSync(join(root,'dist/assets',name));
    assert.equal(data.toString('ascii',0,4),'RIFF');
    assert.equal(data.toString('ascii',8,12),'WEBP');
    assert.ok(data.length>20000 && data.length<600000,'brand image must be real, optimized and present');
  }
  const motion=readFileSync(join(root,'dist/assets/lobby-smoke-420-loop.webp'));
  const still=readFileSync(join(root,'dist/assets/lobby-smoke-420-still.webp'));
  for(const asset of [motion,still])assert.equal(asset.toString('ascii',8,12),'WEBP');
  assert.ok(motion.indexOf(Buffer.from('ANIM'))>0 && motion.indexOf(Buffer.from('ANMF'))>0,'real animation must contain frames');
  assert.ok(motion.length<2000000,'transparent motion asset should be under 2 MB');
  assert.ok(still.length<100000,'reduced-motion frame must be lightweight');
  const cheersMotion=readFileSync(join(root,'dist/assets/cheers-real-smoke-blunt-loop.webp'));
  assert.equal(cheersMotion.toString('ascii',8,12),'WEBP');
  assert.ok((cheersMotion.toString('latin1').match(/ANMF/g)||[]).length>=20,'CHEERS needs actual smoke deformation frames');
  assert.ok(cheersMotion.length<3500000,'CHEERS motion must be under 3.5 MB on mobile');
  assert.match(readFileSync(join(root,'dist/smoke-brand.js'),'utf8'),/prefers-reduced-motion/);
});

test('Pages configuration has a public dist boundary and no placeholder D1 resource',()=>{
  const configText=readFileSync(join(root,'wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,'');
  const config=JSON.parse(configText);
  assert.equal(config.name,'the420lobby-com');
  assert.equal(config.pages_build_output_dir,'dist');
  assert.equal(config.vars.SITE_ORIGIN,'https://the420lobby.com');
  assert.equal(config.env?.production?.vars?.SITE_ORIGIN,'https://the420lobby.com','Cloudflare production env vars do not inherit root vars when D1 is overridden');
  assert.equal(Object.hasOwn(config.vars,'DISCORD_CLIENT_ID'),false,'Discord client ID must come from a deployed binding, not a blank file value');
  assert.equal(Object.hasOwn(config.vars,'DISCORD_CLIENT_SECRET'),false,'Discord client secret must never be committed to Wrangler vars');
  // The production database must never be inherited by a Pages preview deployment.
  assert.equal(config.d1_databases,undefined,'a top-level D1 binding would leak production storage into preview');
  const production = config.env?.production?.d1_databases || [];
  assert.equal(production.length,1,'expected exactly one production arcade D1 binding');
  const db=production[0];
  assert.equal(db.binding,'DB');
  assert.equal(db.database_name,'the420lobby-arcade');
  assert.equal(db.migrations_dir,'migrations');
  assert.match(db.database_id||'',/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  assert.notEqual(db.database_id,'00000000-0000-0000-0000-000000000000');
  assert.equal(config.env?.preview?.d1_databases,undefined,'preview requires a separately provisioned D1 binding');
  assert.equal(Object.hasOwn(config.env?.production?.vars||{},'DISCORD_CLIENT_ID'),false,'production Client ID must remain an encrypted Pages binding');
  assert.equal(Object.hasOwn(config.env?.production?.vars||{},'DISCORD_CLIENT_SECRET'),false,'production Client Secret must remain an encrypted Pages binding');
  assert.equal(Object.hasOwn(config.vars,'DISCORD_CLIENT_ID'),false);
  assert.equal(Object.hasOwn(config.vars,'DISCORD_CLIENT_SECRET'),false);
});
