/* The Friday Fighters game does not publish the /portraits/*.webp paths
 * previously assumed in the React cards. These three URLs are the named
 * originals in the game-art gallery at soflowheelielife.com/friday-fighters-game.
 * Fetch them at build time and serve same-origin immutable static copies.
 * Never let a deploy silently succeed with empty or HTML portrait files.
 */
import {writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';

export const fridayPortraits = Object.freeze([
  {name:'Craig', filename:'friday-roster-craig.webp', source:'https://img.tools366.com/soflo-wheelie-life/7e96b669.webp'},
  {name:'Smokey', filename:'friday-roster-smokey.webp', source:'https://img.tools366.com/soflo-wheelie-life/54c2a27b.webp'},
  {name:'Deebo', filename:'friday-roster-deebo.webp', source:'https://img.tools366.com/soflo-wheelie-life/5e98e1d9.webp'},
]);

export function validatePortrait(buffer, name) {
  if (buffer.length < 1000 || buffer.length > 4_000_000 ||
      buffer.toString('ascii',0,4) !== 'RIFF' ||
      buffer.toString('ascii',8,12) !== 'WEBP') {
    throw new Error('Friday Fighters '+name+' image was not a valid WebP');
  }
}

export async function buildFridayPortraits(output, fetcher=fetch) {
  await mkdir(output,{recursive:true});
  await Promise.all(fridayPortraits.map(async item=>{
    const response=await fetcher(item.source,{
      redirect:'follow',
      headers:{Accept:'image/webp,image/*;q=0.8','User-Agent':'Mozilla/5.0 (compatible; The420LobbyAssets/1.0)'},
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error('Friday Fighters '+item.name+' upstream returned HTTP '+response.status);
    const length=Number(response.headers.get('content-length')||0);
    if(length>4_000_000) throw new Error('Friday Fighters '+item.name+' image too large');
    const buffer=Buffer.from(await response.arrayBuffer());
    validatePortrait(buffer,item.name);
    await writeFile(join(output,item.filename),buffer);
    console.log('Verified Friday Fighters '+item.name+' in-game portrait: '+buffer.length+' WebP bytes');
  }));
}
