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
  for(const name of ['index.html','arcade.html','sesh-signal.js','arcade-games.js','arcade-api.js','shared/arcade-rules.mjs','assets/arcade-night.svg','assets/dank-shield-logo.avif','_routes.json','_headers']) assert.ok(files.includes(name),name);
  for(const path of files) assert.doesNotMatch(path,/(?:^|\/)(?:functions|tests|migrations|scripts|node_modules|docs|\.git|\.env|\.dev\.vars|wrangler|README)/);
  const routes=JSON.parse(readFileSync(join(root,'dist/_routes.json'),'utf8'));
  for(const name of ['/sesh-signal.js','/arcade-games.js','/api/*','/auth/*']) assert.ok(routes.include.includes(name),'missing auth route '+name);
  assert.doesNotMatch(readFileSync(join(root,'dist/arcade-app.js'),'utf8'),/DISCORD_CLIENT_SECRET/);
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
