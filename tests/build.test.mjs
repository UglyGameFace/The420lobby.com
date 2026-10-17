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
