import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createRequire } from "node:module";
const { chromium, firefox, webkit } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const fileTypes = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".webp":"image/webp"};
let unauthenticatedRunRequests = 0;
const server = createServer(async(req,res)=>{
  try{
    const path = new URL(req.url,"http://localhost").pathname;
    // An explicit unauthenticated API fixture: these tests never perform Discord login.
    if (path.startsWith("/api/")) {
      if (req.method === "POST" && path.startsWith("/api/runs")) unauthenticatedRunRequests++;
      const payload = path === "/api/session"
        ? {user:null, configured:true, csrfToken:null}
        : {error:"Discord sign-in required"};
      res.writeHead(path === "/api/session" ? 200 : 401, {"Content-Type":"application/json", "Cache-Control":"no-store"});
      res.end(JSON.stringify(payload));
      return;
    }
    const file = resolve(root,"."+decodeURIComponent(path==="/" ? "/index.html" : path));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const content = await readFile(file);
    const type = Object.entries(fileTypes).find(([extension])=>file.endsWith(extension))?.[1] || "application/octet-stream";
    res.writeHead(200,{"Content-Type":type});res.end(content);
  }catch(_){res.writeHead(404);res.end("Not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url = "http://127.0.0.1:"+server.address().port;
const availableEngines = {chromium,firefox,webkit};
const engines = Object.fromEntries(Object.entries(availableEngines).filter(([name]) => !process.env.BROWSER_ENGINES || process.env.BROWSER_ENGINES.split(",").includes(name)));
assert.ok(Object.keys(engines).length > 0, "No requested browser engines are supported");
try{
  for(const [name,engine] of Object.entries(engines)){
    let browser;
    try{
      browser=await engine.launch({headless:true,executablePath:name === "chromium" ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined : undefined});
      for(const width of [390,960,1051,1440]){
        const mobile=width===390;
        const page=await browser.newPage({viewport:{width,height:mobile?844:900},reducedMotion:"reduce"});
        const errors=[];
        page.on("pageerror",e=>errors.push(e.message));
        const cssFailures=[];
        page.on("requestfailed",request=>{if(new URL(request.url()).pathname.endsWith(".css"))cssFailures.push(request.url()+": "+request.failure()?.errorText);});
        await page.goto(url,{waitUntil:"domcontentloaded"});
        try {
          await page.waitForFunction(() => {
            const site=document.querySelector('link[href^="/styles.css"]');
            const cheers=document.querySelector('link[href^="/cheers-hero-v1.css"]');
            const arcade=document.querySelector('link[href="/sesh-signal-v3.css"]');
            const hero=document.querySelector(".hero");
            return !!site?.sheet && !!cheers?.sheet && !!arcade?.sheet && !!hero &&
              getComputedStyle(hero).overflowX==="hidden" &&
              getComputedStyle(document.querySelector(".arcade-layout")).display==="grid";
          }, {timeout:11000});
        }catch(error){
          const detail=await page.evaluate(()=>{
            const base=document.querySelector('link[href^="/styles.css"]');
            const cheers=document.querySelector('link[href^="/cheers-hero-v1.css"]');
            const arcade=document.querySelector('link[href="/sesh-signal-v3.css"]');
            return {baseLoaded:!!base?.sheet,cheersLoaded:!!cheers?.sheet,arcadeLoaded:!!arcade?.sheet,
              heroOverflow:getComputedStyle(document.querySelector(".hero")).overflowX,
              arcadeDisplay:getComputedStyle(document.querySelector(".arcade-layout")).display};
          });
          throw new Error(name+"/"+width+" failed to load stylesheets: "+JSON.stringify({detail,cssFailures})+" "+String(error));
        }
        await page.locator("#hero-heading").waitFor({state:"visible"});
        const collapsed=width<=1050;
        assert.equal(await page.locator("#primary-nav").isVisible(),!collapsed,
          name+"/"+width+" initial menu visibility disagrees with breakpoint");
        assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"),"false",
          name+"/"+width+" initial aria-expanded must be false");

        assert.equal(await page.locator(".lounge-hotspot").count(),4,name+" missing four game room markers");

        assert.equal(await page.locator(".spark-step").count(),10,
          name+"/"+width+" Spark Relay must present ten distinct beat markers");
        const arena=await page.locator("#spark-arena").boundingBox();
        assert.ok(arena&&arena.width>=190&&arena.x>=-1&&arena.x+arena.width<=width+2,
          name+"/"+width+" Spark Relay stage overflows: "+JSON.stringify(arena));
        assert.equal(await page.locator("#lounge-spark-button").isDisabled(),true,
          name+"/"+width+" guest must not score the cooperative game");

        const roomImage=page.locator("#lounge-scene-photo");
        const originalRoomImage=await roomImage.getAttribute("src");
        await page.locator(".lounge-hotspot--profile").click();
        assert.notEqual(await roomImage.getAttribute("src"),originalRoomImage,
          name+" profile room image must change");
        assert.match(await roomImage.getAttribute("alt"),/gamer playing/i);
        assert.equal(await page.locator("#lounge-preview-link").getAttribute("href"),"/arcade.html#profile",
          name+" cannot select the player profile room");
        const profileRoomImage=await roomImage.getAttribute("src");
        await page.locator(".lounge-hotspot--profile").press("End");
        assert.notEqual(await roomImage.getAttribute("src"),profileRoomImage,
          name+" keyboard selection must change the room image");
        assert.equal(await page.locator("#lounge-preview-link").getAttribute("href"),"#join",
          name+" End key does not select the final room");
        await page.locator(".lounge-hotspot--crew").press("Home");
        assert.equal(await page.locator("#lounge-preview-link").getAttribute("href"),"/arcade.html",
          name+" Home key does not select the first room");
        const hitboxes=await page.locator(".lounge-hotspot").evaluateAll(buttons=>buttons.map(button=>{
          const b=button.getBoundingClientRect();return {width:b.width,height:b.height};
        }));
        assert.ok(hitboxes.every(b=>b.width>=44&&b.height>=44),
          name+"/"+width+" has a room hotspot smaller than 44px: "+JSON.stringify(hitboxes));

        await page.locator(".brand-smoke-image").evaluate(img=>img.decode());
        assert.equal(await page.locator(".brand-smoke-image").evaluate(el=>el.complete && el.naturalWidth>0),true,name+" failed animated smoke load");
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
        assert.ok(await countPaintedPixels(page.locator(".brand-smoke-image"))>200,name+" wordmark image paints no pixels");
        const renderedMark=await page.locator(".brand-smoke-image").evaluate(img=>({
          width:img.naturalWidth,height:img.naturalHeight
        }));
        assert.equal(renderedMark.width,280,name+" smoke asset width mismatch");
        assert.equal(renderedMark.height,176,name+" smoke asset height mismatch");
        assert.ok(await countPaintedPixels(page.locator(".cheers-art"))>200,name+" photographic Cheers art paints no pixels");
        const composition=await page.evaluate(()=>{
          const rect=s=>document.querySelector(s).getBoundingClientRect();
          const after=rect(".hero-heading-cheers > span:first-child"),
                cheers=rect(".headline-cheers"),art=rect(".cheers-art"),
                play=rect(".hero-heading-cheers > span.headline-highlight"),
                scene=rect(".hero-scene"),hero=rect(".hero");
          const c=document.querySelector(".headline-cheers"),a=document.querySelector(".cheers-art");
          const cs=getComputedStyle(c),as=getComputedStyle(a);
          const css=document.querySelector('link[href^="/cheers-hero-v1.css"]');
          return {afterBottom:after.bottom,cheersTop:cheers.top,cheersBottom:cheers.bottom,
            artTop:art.top,artBottom:art.bottom,playTop:play.top,sceneTop:scene.top,heroTop:hero.top,
            pseudo:getComputedStyle(c,"::before").content,
            debug:{
              headline:{fontSize:cs.fontSize,height:cs.height,width:cs.width,position:cs.position,display:cs.display},
              image:{fontSize:as.fontSize,height:as.height,width:as.width,position:as.position,display:as.display,objectFit:as.objectFit},
              tag:{height:a.getAttribute("height"),width:a.getAttribute("width")},
              stylesheet:{href:css?.href,loaded:!!css?.sheet,rules:css?.sheet?.cssRules?.length ?? null},
              mobile:matchMedia("(max-width:760px)").matches,
              topHeading:{fontSize:getComputedStyle(document.querySelector(".hero-heading-cheers")).fontSize}
            }};
        });
        assert.equal(composition.pseudo,"none",name+" duplicate CHEERS pseudo text");
        assert.ok(Math.abs(composition.artTop-composition.cheersTop)<=3 &&
          Math.abs(composition.artBottom-composition.cheersBottom)<=3,
          name+" detached CHEERS artwork: "+JSON.stringify(composition));
        assert.ok(composition.cheersTop-composition.afterBottom>=-10 &&
          composition.cheersTop-composition.afterBottom<=20,
          name+" giant AFTER/CHEERS gap: "+JSON.stringify(composition));
        assert.ok(composition.playTop-composition.cheersBottom>=-10 &&
          composition.playTop-composition.cheersBottom<=24,
          name+" giant CHEERS/PLAY gap: "+JSON.stringify(composition));
        if(mobile) assert.ok(Math.abs(composition.sceneTop-composition.heroTop)<=15,
          name+" displaced controller relative to hero: "+JSON.stringify(composition));
        if(mobile){
          assert.equal(await page.locator(".cheers-leaf").count(),0,name+" old overlay leaf still present");
        }
        assert.equal(await page.locator(".cheers-art").evaluate(el=>el.complete && el.naturalWidth===1100),true,name+" failed realistic smoke and blunt load");
        assert.equal(await page.locator(".cheers-word").textContent(),"CHEERS,");
        assert.equal(await page.locator(".sesh-item").count(),0,"No targets before start");
        const completeLogo=await page.locator(".brand-smoke-image").boundingBox();
        assert.ok(completeLogo && completeLogo.width>=65,name+" real smoke is too small or missing");
        if(width>760&&width<=1050){
          assert.ok(await page.locator("#menu-toggle").isVisible(),name+" tablet menu toggle hidden");
          assert.equal(await page.locator("#primary-nav").isVisible(),false,name+" desktop links should collapse on tablet");
          await page.locator("#menu-toggle").click();
          assert.equal(await page.locator("#primary-nav").isVisible(),true,name+" tablet menu failed to open");
          await page.locator("#menu-toggle").click();
          assert.equal(await page.locator("#primary-nav").isVisible(),false,name+" tablet menu failed to close");
        }
        const logoBounds=await page.locator(".brand-smoke-image").boundingBox();
        if(mobile){
          assert.ok(logoBounds && logoBounds.width<=Math.min(240,width*.6),"Mobile brand exceeds available space: "+JSON.stringify(logoBounds));
        }
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
        if(overflow>2) {
          const details=await page.evaluate(()=>{
            const candidates=[...document.body.querySelectorAll("*")].map(el=>{
              const r=el.getBoundingClientRect(),style=getComputedStyle(el);
              return {node:el.tagName.toLowerCase()+(el.id?"#"+el.id:"")+
                (typeof el.className==="string"?"."+el.className.trim().split(/\s+/).slice(0,2).join("."):""),
                left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),
                overflow:style.overflowX,display:style.display};
            }).filter(x=>x.right>innerWidth+2||x.left< -2)
              .sort((a,b)=>b.right-a.right).slice(0,35);
            const headerElements=["html","body",".header-shell",".logo",".brand-smoke-image",".logo-type",".header-actions","#fx-toggle","#menu-toggle",".desktop-nav"].map(selector=>{
              const node=document.querySelector(selector);
              if(!node)return {selector,missing:true};
              const r=node.getBoundingClientRect(),computed=getComputedStyle(node);
              return {selector,left:r.left,right:r.right,width:r.width,display:computed.display,
                font:computed.font,whiteSpace:computed.whiteSpace,overflowX:computed.overflowX};
            });
            const gameLink=document.querySelector('link[href="/sesh-signal-v3.css"]');
            return {viewport:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,headerElements,
              loaded:!!gameLink?.sheet,arcadeDisplay:getComputedStyle(document.querySelector(".arcade-layout")).display,
              stageHeight:document.querySelector("#sesh-stage").getBoundingClientRect().height,
              candidates};
          });
          console.error("OVERFLOW DEBUG "+name+"/"+width+": "+JSON.stringify(details));
        }
        assert.ok(overflow<=2,name+"/"+width+" overflow: "+overflow+"px");
        assert.equal(await page.locator("#hero-heading").evaluate(el=>getComputedStyle(el).opacity),"1");
        if(mobile){
          await page.locator("#menu-toggle").click();
          assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"),"true");
          await page.locator("#menu-toggle").click();
          assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"),"false");
          const controls=await page.evaluate(()=>{
            const rect=selector=>document.querySelector(selector).getBoundingClientRect();
            return {logo:rect(".logo"),mark:rect(".brand-smoke-image"),fx:rect("#fx-toggle"),menu:rect("#menu-toggle"),header:rect(".header-shell"),eyebrow:rect(".hero-copy-block .eyebrow")};
          });
          assert.ok(controls.mark.width>=65,name+" mobile smoke number is too small: "+JSON.stringify(controls.mark));
          assert.ok(controls.mark.bottom<=controls.header.bottom+5,name+" smoke artwork outside header");
          assert.ok(controls.logo.left>=controls.header.left-2 && controls.logo.right<=controls.header.right+2,name+" full brand outside header");
          assert.ok(controls.menu.left>=controls.header.left-2 && controls.fx.right<=controls.header.right+2,name+" header controls outside bounds");
          assert.ok(controls.header.height<=96,name+" mobile header is too thick");
          assert.ok(Math.abs((controls.logo.left+controls.logo.right)/2-(controls.header.left+controls.header.right)/2)<=2,
            name+" brand not centered: "+JSON.stringify(controls));
          assert.ok(controls.menu.right+3<=controls.logo.left,name+" menu and brand overlap");
          assert.ok(controls.logo.right+3<=controls.fx.left,name+" brand and FX overlap: "+JSON.stringify(controls));
          assert.ok(controls.eyebrow.top-controls.header.bottom>=135 && controls.eyebrow.top-controls.header.bottom<=240,name+" hero top gap out of range");
        }
        assert.equal(await page.locator("#sesh-start").isDisabled(),true,name+" game start must require Discord login");
        await page.locator("#sesh-start").evaluate(button => button.dispatchEvent(new MouseEvent("click",{bubbles:true})));
        await page.waitForTimeout(100);
        assert.equal(await page.locator(".sesh-item").count(),0,name+" unauthenticated visitor started a round");
        assert.equal(unauthenticatedRunRequests,0,name+" unauthenticated client attempted a run");
        assert.deepEqual(errors,[],name+" had browser JS errors");
        await page.close();
        console.log("PASS "+name+" "+width+"px responsive hero, safe header, controls, Discord play gate");
      }
    }finally{
      if(browser)await browser.close();
    }
  }
}finally{
  await new Promise(done=>server.close(done));
}
