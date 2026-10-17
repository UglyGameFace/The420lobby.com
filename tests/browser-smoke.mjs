import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".svg":"image/svg+xml"};
let unauthenticatedRunRequests = 0;
const server = createServer(async(req,res)=>{
  try {
    const pathname = new URL(req.url,"http://localhost").pathname;
    // An explicit unauthenticated API fixture: these tests never perform Discord login.
    if (pathname.startsWith("/api/")) {
      if (req.method === "POST" && pathname.startsWith("/api/runs")) unauthenticatedRunRequests++;
      const payload = pathname === "/api/session"
        ? {user:null, configured:true, csrfToken:null}
        : {error:"Discord sign-in required"};
      res.writeHead(pathname === "/api/session" ? 200 : 401, {"Content-Type":"application/json", "Cache-Control":"no-store"});
      res.end(JSON.stringify(payload));
      return;
    }
    const target = resolve(root,"."+decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
    if (target !== root && !target.startsWith(root+sep)) {res.writeHead(403);res.end();return;}
    const type = Object.entries(types).find(([suffix])=>target.endsWith(suffix))?.[1] || "application/octet-stream";
    const content = await readFile(target);
    res.writeHead(200,{"Content-Type":type,"Cache-Control":"no-store"});
    res.end(content);
  } catch(error) {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((yes)=>server.listen(0,"127.0.0.1",yes));
const address = "http://127.0.0.1:"+server.address().port;
let browser;
try {
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader"]});
  await mkdir("artifacts",{recursive:true});
  for (const scenario of [
    {name:"desktop",size:{width:1440,height:900},mobile:false},
    {name:"tablet",size:{width:820,height:1024},mobile:false},
    {name:"mobile",size:{width:390,height:844},mobile:true},
    {name:"samsung-mobile",size:{width:412,height:915},mobile:true},
    {name:"compact-mobile",size:{width:360,height:740},mobile:true},
    {name:"narrow-mobile",size:{width:320,height:700},mobile:true}
  ]) {
    const page=await browser.newPage({viewport:scenario.size,deviceScaleFactor:scenario.mobile?2:1});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto(address,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(() => {
      return ['/styles.css','/cheers-hero-v1.css','/sesh-signal-v3.css','/lobby-redesign.css'].every(path=>
        !!document.querySelector('link[rel="stylesheet"][href^="'+path+'"]')?.sheet
      );
    },{timeout:11000});
    await page.locator("#hero-heading").waitFor({state:"visible"});
    await page.evaluate(()=>document.fonts.ready);
    const initialHeroOpacity = await page.locator("#hero-heading").evaluate(el=>getComputedStyle(el).opacity);
    assert.equal(initialHeroOpacity,"1","hero text must be readable immediately, not hidden behind scroll observer");
    assert.equal(await page.title(),"The 420 Lobby | After Cheers, We Play");
    assert.equal(await page.locator(".experience-card").count(),4);
    assert.equal(await page.locator(".card-body").count(),3,"other three experience cards retain semantic HTML");
    assert.equal(await page.locator(".shield-card .shield-card-link").count(),1,"responsive Shield card preserves visible accessible CTA");
    assert.equal(await page.locator("#sesh-stage").count(),1,"arcade field is missing");
    assert.equal(await page.locator("#sesh-start").count(),1,"arcade start is missing");
    assert.equal(await page.locator(".arcade-play").count(),1,"mobile game wrapper is missing");
    const gameGeometry=await page.evaluate(()=>{
      const get=s=>document.querySelector(s).getBoundingClientRect();
      const machine=get(".arcade-machine"), start=get("#sesh-start"), stage=get("#sesh-stage"), shell=get(".arcade-shell");
      const copy=get(".arcade-copy"), play=get(".arcade-play");
      return {machineTop:machine.top,stageTop:stage.top,startBottom:start.bottom,
        machineRight:machine.right,playRight:play.right,copyBottom:copy.bottom,stageHeight:stage.height,
        shellRight:shell.right,viewport:innerWidth};
    });
    assert.ok(gameGeometry.machineRight<=gameGeometry.viewport+2,"game cabinet overflows page");
    assert.ok(gameGeometry.playRight<=gameGeometry.viewport+2,"game controls overflow page");
    if(scenario.mobile){
      assert.ok(gameGeometry.machineTop-gameGeometry.startBottom>=0 &&
        gameGeometry.machineTop-gameGeometry.startBottom<105,
        "game board must sit near start/pause controls on mobile "+JSON.stringify(gameGeometry));
      assert.ok(gameGeometry.machineTop-gameGeometry.copyBottom<160,
        "mobile intro is too far away from playable arcade "+JSON.stringify(gameGeometry));
    }


    const arcadePresentation = await page.evaluate(() => {
      const select = s => document.querySelector(s);
      const cssReady = select('link[href="/sesh-signal-v3.css"]');
      const machine = select(".arcade-machine"), stage = select("#sesh-stage");
      const layout = select(".arcade-layout");
      return {
        linkPresent: !!cssReady,
        sheetLoaded: !!cssReady?.sheet,
        ruleCount: cssReady?.sheet?.cssRules?.length ?? 0,
        layoutDisplay: getComputedStyle(layout).display,
        stageHeight: stage.getBoundingClientRect().height,
        stageOverflow: getComputedStyle(stage).overflow,
        machineBorder: getComputedStyle(machine).borderTopWidth,
        overlayDisplay: getComputedStyle(select("#sesh-overlay")).display,
        machineHeight: machine.getBoundingClientRect().height
      };
    });
    assert.ok(arcadePresentation.linkPresent && arcadePresentation.sheetLoaded,
      "independent arcade CSS link failed to load: "+JSON.stringify(arcadePresentation));
    assert.ok(arcadePresentation.ruleCount>25,"arcade stylesheet is empty or stale");
    assert.equal(arcadePresentation.layoutDisplay,"grid","arcade falls back to unstyled text");
    const minStageHeight = scenario.size.width <= 420 ? 270 : 300;
    assert.ok(arcadePresentation.stageHeight>=minStageHeight,
      "arcade playfield has collapsed "+JSON.stringify({height:arcadePresentation.stageHeight,minStageHeight,viewport:scenario.size.width}));
    assert.equal(arcadePresentation.stageOverflow,"hidden","arcade missing game screen styling");
    assert.equal(arcadePresentation.machineBorder,"1px","cabinet framing not styled");
    assert.ok(arcadePresentation.machineHeight>450,"arcade cabinet missing");

    assert.equal(await page.locator('a[href="https://discord.gg/the420lobby"]').count(),4);
    assert.equal(await page.locator("img.lounge-illustration").evaluate(el=>el.complete && el.naturalWidth>0),true,"hero illustration failed");
    await page.locator(".leaf-seal").scrollIntoViewIfNeeded();
    await page.locator(".leaf-seal img.seal-cannabis-photo").evaluate(img => img.decode());
    assert.ok(await page.locator(".leaf-seal img.seal-cannabis-photo").evaluate(img => img.complete && img.naturalWidth>0),
      "photographic Good Stuff badge leaf failed to load");
    await page.locator(".shield-card").scrollIntoViewIfNeeded();
    const brand=page.locator(".shield-card img.dank-shield-brand-art");
    await brand.evaluate(img=>img.decode());
    // Test the actual responsive composition rather than a hardcoded 2:3
    // poster ratio. Media, text and CTA must remain readable at any width.
    const shieldGeometry = await brand.evaluate(img => {
      const card = img.closest(".shield-card");
      const art = card.querySelector(".shield-feature-art");
      const copy = card.querySelector(".shield-feature-copy");
      const heading = card.querySelector("#shield-title");
      const action = card.querySelector(".shield-card-link");
      const box = el => {
        const r = el.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
      };
      return {loaded:img.complete&&img.naturalWidth>0, card:box(card),img:box(img),
        art:box(art),copy:box(copy),title:box(heading),cta:box(action),
        viewport:innerWidth,documentWidth:document.documentElement.scrollWidth};
    });
    assert.ok(shieldGeometry.loaded,"approved logo asset failed to decode: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.card.left>=-2 && shieldGeometry.card.right<=scenario.size.width+2,
      "Shield card overflows viewport: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.documentWidth<=scenario.size.width+2,
      "page has horizontal overflow: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.img.width>=90 && shieldGeometry.img.height>=90,
      "Shield logo is microscopic: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.title.width>80&&shieldGeometry.title.height>45,
      "Shield title collapsed: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.cta.height>=30,
      "Shield CTA not tappable: "+JSON.stringify(shieldGeometry));
    if (scenario.size.width<=460) {
      assert.ok(shieldGeometry.art.bottom<=shieldGeometry.copy.top+3,
        "phone layout must stack artwork over content: "+JSON.stringify(shieldGeometry));
    } else {
      assert.ok(shieldGeometry.art.right<=shieldGeometry.copy.left+3,
        "tablet/desktop layout must use side-by-side media and copy: "+JSON.stringify(shieldGeometry));
    }
    await page.locator(".shield-card").screenshot({
      path:"artifacts/"+scenario.name+"-shield-card.png",
      animations:"disabled",
    });
    await page.locator(".hangout-card").scrollIntoViewIfNeeded();
    await page.locator("img.card-foliage-photo").evaluate(img=>img.decode());
    assert.ok(await page.locator("img.card-foliage-photo").evaluate(img=>img.naturalWidth>0),
      "real Hangout card foliage photo failed to load");
    await page.locator("#hero-heading").scrollIntoViewIfNeeded();
    await page.locator("img.lounge-xbox-controller").evaluate(el => el.decode());
    assert.equal(await page.locator("img.lounge-xbox-controller").evaluate(el=>el.complete && el.naturalWidth>0),true,
      "actual Xbox controller photograph failed to load");
    if (scenario.mobile) {
      const controller=await page.locator("img.lounge-xbox-controller").evaluate(el=>{
        const r=el.getBoundingClientRect();
        return {left:r.left,right:r.right,width:r.width,viewport:innerWidth};
      });
      assert.equal(controller.width,0,
        "unretouched controller photo must remain hidden until a clean licensed cutout is integrated: "+JSON.stringify(controller));
    }
    assert.equal(await page.locator("img.botanical-foreground").evaluate(el=>el.complete && el.naturalWidth>0),true,"leaf illustration failed");
    assert.equal(await page.locator("img.logo-smoke").evaluate(el=>el.complete && el.naturalWidth>0),true,"smoke 420 logo failed");
    const countPaintedPixels = async locator => locator.evaluate(img => {
          const c=document.createElement("canvas");
          c.width=img.naturalWidth;
          c.height=img.naturalHeight;
          const ctx=c.getContext("2d");
          ctx.drawImage(img,0,0);
          const px=ctx.getImageData(0,0,c.width,c.height).data;
          let painted=0;
          for(let i=3;i<px.length;i+=4) if(px[i]>24) painted++;
          return painted;
        });
    assert.ok(await countPaintedPixels(page.locator("img.logo-smoke"))>200,"smoke logo SVG loaded but is invisible");
    assert.ok(await countPaintedPixels(page.locator("img.cheers-art"))>200,"CHEERS smoke art loaded but is invisible");
    assert.ok(await countPaintedPixels(page.locator("img.botanical-foreground"))>100,"new leaf asset loaded but is invisible");
    if(scenario.mobile) {
      assert.ok(await page.locator("img.cheers-leaf").isVisible(),"mobile leaf artwork is hidden");
      assert.ok(await countPaintedPixels(page.locator("img.cheers-leaf"))>100,"mobile Cheers leaf artwork paints no pixels");
      assert.ok(await countPaintedPixels(page.locator("img.hero-smoke-trail"))>100,"natural left smoke image is invisible");
    }
    assert.equal(await page.locator(".cheers-roll img").evaluate(el=>el.complete && el.naturalWidth>0),true,"approved joint art failed to load");
    assert.equal(await page.locator(".cheers-word").textContent(),"CHEERS,","hero slogan regressed");
    assert.equal(await page.locator(".logo-glyph").count(),0,"outdated sticky-note mark still present");
    assert.equal(await page.locator(".logo-prefix").textContent(),"THE");
    assert.equal(await page.locator(".logo-suffix").textContent(),"LOBBY");
    assert.equal(await page.locator(".logo").textContent(),"THELOBBY","smoky 420 must be an image between words, not duplicated text");
    const layout = await page.evaluate(() => {
      const get = selector => {
        const rect=document.querySelector(selector).getBoundingClientRect();
        return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height};
      };
      return {viewport:window.innerWidth,header:get(".header-shell"),logo:get(".logo"),
        mark:get(".logo-smoke"),fx:get("#fx-toggle"),menu:get("#menu-toggle"),
        heading:get("#hero-heading"),eyebrow:get(".hero-copy-block .eyebrow"),smokeLabel:get(".scene-label")};
    });
    if(scenario.mobile){
      assert.ok(layout.mark.top >= 0,"smoke 420 image must not crop above the viewport");
      const parts=await page.evaluate(()=>{
        const get=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};
        return {prefix:get(".logo-prefix"),smoke:get(".logo-smoke"),suffix:get(".logo-suffix")};
      });
      assert.ok(parts.prefix.right+1<=parts.smoke.left && parts.smoke.right+1<=parts.suffix.left,
        "THE 420 LOBBY must have zero overlap between words and smoke image: "+JSON.stringify(parts));
      assert.ok(parts.smoke.width>=65,"smoky 420 is too small: "+JSON.stringify(parts));
      assert.ok(layout.mark.bottom <= layout.header.bottom+5,"smoke 420 image must fit inside the header");
      assert.ok(layout.logo.left >= layout.header.left-2 && layout.logo.right <= layout.header.right+2,
        "full brand must fit inside the header");
      assert.ok(layout.menu.left >= layout.header.left-2 && layout.fx.right <= layout.header.right+2,
        "header controls must fit inside the header");
      assert.ok(layout.header.height <= 96, "mobile header grew too tall");
      assert.ok(Math.abs((layout.logo.left+layout.logo.right)/2-(layout.header.left+layout.header.right)/2)<=2,
        "full THE LOBBY 420 logo is not centered");
      assert.ok(layout.menu.right+3 <= layout.logo.left, "menu and brand overlap");
      assert.ok(layout.logo.right+3 <= layout.fx.left, "brand and FX controls overlap");
      assert.ok(layout.eyebrow.top-layout.header.bottom>=135 && layout.eyebrow.top-layout.header.bottom<=240,
        "gap between header and After Cheers is too small or too big");
      assert.ok(layout.heading.left >= 0 && layout.heading.right <= layout.viewport+2,
        "hero headline exceeds mobile viewport");
      assert.equal(await page.locator(".scene-label").first().evaluate(el=>getComputedStyle(el).display),"none",
        "decorative scene label should not cover the mobile header");
      assert.equal(await page.locator("#fx-label").evaluate(el=>getComputedStyle(el).display),"none",
        "wide effects label must collapse on mobile");
    }
    const smokeMargins = await page.locator(".logo-smoke").evaluate(image => {
      const canvas=document.createElement("canvas");
      canvas.width=476;canvas.height=260;
      const context=canvas.getContext("2d",{willReadFrequently:true});
      context.drawImage(image,0,0,476,260);
      const pixels=context.getImageData(0,0,476,260).data;
      let total=0,edge=0;
      for(let y=0;y<260;y++)for(let x=0;x<476;x++){
        const a=pixels[(y*476+x)*4+3];
        if(a>60){ total++; if(x<2||x>473||y<2||y>257)edge++; }
      }
      return {total,edge};
    });
    assert.ok(smokeMargins.total>250,"420 smoke logo is absent or invisible");
    assert.ok(smokeMargins.edge < Math.max(4,smokeMargins.total*.005),
      "smoke numerals bleed past their artwork boundaries");
    assert.equal(await page.locator(".reality-prism").count(),1,"optical prism missing");
    const cheersArt=await page.evaluate(()=>{
      const rect=s=>{
        const r=document.querySelector(s).getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
      };
      return {
        cheers:rect(".headline-cheers"),artwork:rect(".cheers-art"),
        leaf:rect(".cheers-leaf"),joint:rect(".cheers-roll img"),
        after:rect(".hero-heading-cheers > span:first-child"),
        play:rect(".hero-heading-cheers > span.headline-highlight"),
        scene:rect(".hero-scene"),hero:rect(".hero"),
        pseudo:getComputedStyle(document.querySelector(".headline-cheers"),"::before").content
      };
    });
    assert.equal(cheersArt.pseudo,"none","old CHEERS text still painted behind image");
    const liveHaze=await page.locator(".cheers-art").evaluate(el=>{
      const st=getComputedStyle(el);
      return {animationName:st.animationName,transform:st.transform};
    });
    assert.ok(liveHaze.animationName.includes("cheers-smoke-hover"),
      "smoky CHEERS motion disappeared");
    assert.equal(liveHaze.transform,"none",
      "CHEERS animation must not displace its line");
    assert.ok(cheersArt.joint.height>8,"joint must be visibly scaled");
    assert.ok(cheersArt.artwork.top>=cheersArt.cheers.top-3 &&
      cheersArt.artwork.bottom<=cheersArt.cheers.bottom+3,
      "CHEERS smoke image detached from its line: "+JSON.stringify(cheersArt));
    assert.ok(cheersArt.cheers.top-cheersArt.after.bottom>=-10 &&
      cheersArt.cheers.top-cheersArt.after.bottom<=20,
      "extra gap between AFTER and CHEERS: "+JSON.stringify(cheersArt));
    assert.ok(cheersArt.play.top-cheersArt.cheers.bottom>=-10 &&
      cheersArt.play.top-cheersArt.cheers.bottom<=24,
      "extra gap between CHEERS and WE PLAY: "+JSON.stringify(cheersArt));
    if(scenario.mobile){
      assert.ok(Math.abs(cheersArt.scene.top-cheersArt.hero.top)<=15,
        "controller/CRT background must anchor at hero top: "+JSON.stringify(cheersArt));
      assert.ok(cheersArt.leaf.left<cheersArt.cheers.right+25 &&
        cheersArt.leaf.bottom>=cheersArt.cheers.top && cheersArt.leaf.top<=cheersArt.cheers.bottom,
        "leaf must frame CHEERS, not float away: "+JSON.stringify(cheersArt));
    }
    assert.ok(cheersArt.cheers.left>=0 && cheersArt.cheers.right<=scenario.size.width+2,
      "Cheers text must fit viewport: "+JSON.stringify(cheersArt));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=2,scenario.name+" horizontal overflow "+overflow+"px");
    if (scenario.mobile) {
      await page.locator("#menu-toggle").click();
      assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"),"true");
      await page.locator("#menu-toggle").click();
      assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"),"false");
    }
    const start=await page.locator("#fx-toggle").getAttribute("aria-pressed");
    if (start==="true") {
      await page.locator("#fx-toggle").click();
      assert.equal(await page.locator("#fx-toggle").getAttribute("aria-pressed"),"false");
      await page.locator("#fx-toggle").click();
      assert.equal(await page.locator("#fx-toggle").getAttribute("aria-pressed"),"true");
    }
    assert.equal(await page.locator("#sesh-start").isDisabled(),true,"Discord sign-in must be required before play");
    await page.locator("#sesh-start").evaluate(button => button.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".sesh-item").count(),0,"unauthenticated visitors must not start a round");
    assert.equal(unauthenticatedRunRequests,0,"unauthenticated client attempted to create a server run");
    if(scenario.name==="desktop" || scenario.name==="mobile" || scenario.name==="narrow-mobile") {
      await page.locator("#sesh-signal").scrollIntoViewIfNeeded();
      await page.screenshot({path:"artifacts/"+scenario.name+"-arcade-styled.png",animations:"disabled",timeout:30000});
    }
    await page.screenshot({path:"artifacts/"+scenario.name+".png",animations:"disabled",timeout:10000});
    for (const selector of ["#vibe","#experiences","#sesh-signal",".hangout-card",".shield-card",".cinema-card",".minecraft-card","#after-dark",".community-proof","#join"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(90);
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:"artifacts/"+scenario.name+"-full.png",fullPage:true,animations:"disabled",timeout:30000});
    assert.deepEqual(errors,[],"uncaught browser errors");
    await page.close();
    console.log("PASS "+scenario.name+" "+scenario.size.width+"x"+scenario.size.height+": links, artwork, navigation, effects toggle, no overflow");
  }
  // Regression: an old browser-cached copy of styles.css must NOT erase the game.
  const stale=await browser.newPage({viewport:{width:390,height:844}});
  let staleCssIntercepted=false;
  await stale.route(/\/styles\.css(?:\?.*)?$/,route=>{
    staleCssIntercepted=true;
    return route.fulfill({status:200,contentType:"text/css",body:":root{--lime:#b8f875} body{margin:0}"});
  });
  await stale.goto(address,{waitUntil:"domcontentloaded"});
  assert.ok(staleCssIntercepted,"stale CSS regression did not intercept versioned global stylesheet");
  const resilient=await stale.evaluate(()=>{
    const arcade=document.querySelector(".arcade-layout");
    const stage=document.querySelector("#sesh-stage");
    const machine=document.querySelector(".arcade-machine");
    return {display:getComputedStyle(arcade).display,
      stageHeight:stage.getBoundingClientRect().height,
      machineBorder:getComputedStyle(machine).borderTopWidth};
  });
  assert.equal(resilient.display,"grid","old cached site CSS hides arcade layout");
  assert.ok(resilient.stageHeight>=300,"old cached site CSS hides the game board");
  assert.equal(resilient.machineBorder,"1px","arcade must be styled independently of cached global CSS");
  await stale.close();
  console.log("PASS stale-global-CSS simulation: independently styled game remains visible");
  const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:"reduce"});
  await reduced.goto(address,{waitUntil:"domcontentloaded"});
  assert.equal(await reduced.locator("#fx-toggle").getAttribute("aria-pressed"),"false");
  const hidden=await reduced.locator("#hero-heading").evaluate(el=>getComputedStyle(el).opacity);
  assert.equal(hidden,"1","reduced motion should not hide the hero");
  console.log("PASS reduced motion");
  await reduced.close();
} finally {
  if (browser) await browser.close();
  await new Promise(done=>server.close(done));
}
