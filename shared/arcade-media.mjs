/* Photographic arcade art. Game rules and scoring never depend on image loading.
 * All photos originate on Wikimedia Commons; author/license in /credits.html.
 * Small 330px thumbs avoid repeatedly downloading multi-megabyte originals.
 */
export const ITEM_PHOTOS = Object.freeze({
  lighter: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Cigarette_lighter_%283863871970%29.jpg/330px-Cigarette_lighter_%283863871970%29.jpg",
  grinder: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Grinder_%28Drug_Paraphernalia%29.jpg/330px-Grinder_%28Drug_Paraphernalia%29.jpg",
  papers: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Cigarette_rolling_papers_%286%29.JPG/330px-Cigarette_rolling_papers_%286%29.JPG",
  "clean-glass": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Small_blown_glass_pipe.png/330px-Small_blown_glass_pipe.png",
  "broken-bong": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Glass_shards.jpg/330px-Glass_shards.jpg",
  "broken-pipe": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/IMG_broken_glass.jpg/330px-IMG_broken_glass.jpg",
  leaf: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Marijuana_plant_leaf.jpg/330px-Marijuana_plant_leaf.jpg",
  bong: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Glassbonggreen.jpg/330px-Glassbonggreen.jpg"
});
export const ITEM_TITLES = Object.freeze({
  lighter:"LIGHTER",grinder:"GRINDER",papers:"PAPERS",
  "clean-glass":"GLASS PIPE","broken-bong":"BROKEN GLASS",
  "broken-pipe":"CRACKED GLASS",leaf:"LEAF",bong:"BONG"
});
export function createPhoto(kind, className = "arcade-photo") {
  if (!Object.prototype.hasOwnProperty.call(ITEM_PHOTOS,kind)) throw new Error("Unknown arcade photo kind");
  const img=document.createElement("img");
  img.className=className;
  img.src=ITEM_PHOTOS[kind];
  img.alt="";
  img.loading="lazy";
  img.decoding="async";
  img.setAttribute("aria-hidden","true");
  img.addEventListener("error",function(){
    img.hidden=true;
    const host=img.parentElement;
    if(host)host.classList.add("artwork-fallback");
  },{once:true});
  return img;
}
