/* Curated Pages asset output. Backend source and local configuration stay out. */
import {cp, mkdir, readdir, rm, lstat} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
export const publicFiles = [
  'index.html','arcade.html','credits.html','favicon.svg','styles.css','cheers-hero-v1.css',
  'lobby-redesign.css','brand-header.css','lounge.css','sesh-signal-v3.css','arcade.css','arcade-games.css','arcade-premium.css','sesh-photo.css',
  'script.js','smoke-brand.js','lounge.js','visual-engine.js','sesh-loader.js','sesh-signal.js',
  'arcade-app.js','arcade-api.js','arcade-games.js','_headers','_routes.json',
  'shared/arcade-rules.mjs','shared/arcade-media.mjs','assets/BarlowCondensed-ExtraBold.ttf','assets/BarlowCondensed-OFL.txt'
];
await rm(output,{recursive:true,force:true});
await mkdir(join(output,'assets'),{recursive:true});
async function copyPublic(relative) {
  const source = join(root,relative);
  if (!(await lstat(source)).isFile()) throw new Error('Public asset must be a regular file: '+relative);
  await mkdir(dirname(join(output,relative)),{recursive:true});
  await cp(source,join(output,relative));
}
for (const path of publicFiles) await copyPublic(path);
for (const asset of await readdir(join(root,'assets'),{withFileTypes:true})) {
  if (asset.isFile() && /\.(?:svg|png|avif|webp|jpe?g|gif|ico)$/i.test(asset.name)) await copyPublic('assets/'+asset.name);
}
console.log('Prepared dist/ with public assets only. No deployment performed.');
