import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const fileTypes = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml"};
const server = createServer(async(req,res)=>{
  try{
    const path = new URL(req.url,"http://localhost").pathname;
    const file = resolve(root,"."+decodeURIComponent(path==="/" ? "/index.html" : path));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const content = await readFile(file);
    const type = Object.entries(fileTypes).find(([extension])=>file.endsWith(extension))?.[1] || "application/octet-stream";
    res.writeHead(200,{"Content-Type":type});res.end(content);
  }catch(_){res.writeHead(404);res.end("Not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url = "http://127.0.0.1:"+server.address().port;
const engines = {chromium,firefox,webkit};
try{
  for(const [name,engine] of Object.entries(engines)){
    let browser;
    try{
      browser=await engine.launch({headless:true});
      for(const width of [390,1440]){
        const mobile=width===390;
        const page=await browser.newPage({viewport:{width,height:mobile?844:900},reducedMotion:"reduce"});
        const errors=[];
        page.on("pageerror",e=>errors.push(e.message));
        const cssFailures=[];
        page.on("requestfailed",request=>{if(request.url().endsWith(".css"))cssFailures.push(request.url()+": "+request.failure()?.errorText);});
        await page.goto(url,{waitUntil:"domcontentloaded"});
        try {
          await page.waitForFunction(() => {
            const site=document.querySelector('link[href="/styles.css"]');
            const arcade=document.querySelector('link[href="/sesh-signal-v3.css"]');
            const hero=document.querySelector(".hero");
            return !!site?.sheet && !!arcade?.sheet && !!hero &&
              getComputedStyle(hero).overflowX==="hidden" &&
              getComputedStyle(document.querySelector(".arcade-layout")).display==="grid";
          }, {timeout:11000});
        }catch(error){
          const detail=await page.evaluate(()=>{
            const base=document.querySelector('link[href="/styles.css"]');
            const arcade=document.querySelector('link[href="/sesh-signal-v3.css"]');
            return {baseLoaded:!!base?.sheet,arcadeLoaded:!!arcade?.sheet,
              heroOverflow:getComputedStyle(document.querySelector(".hero")).overflowX,
              arcadeDisplay:getComputedStyle(document.querySelector(".arcade-layout")).display};
          });
          throw new Error(name+"/"+width+" failed to load stylesheets: "+JSON.stringify({detail,cssFailures})+" "+String(error));
        }
        await page.locator("#hero-heading").waitFor({state:"visible"});
        assert.equal(await page.locator(".logo-smoke").evaluate(el=>el.complete && el.naturalWidth>0),true,name+" failed smoke logo load");
        assert.equal(await page.locator(".cheers-roll img").evaluate(el=>el.complete && el.naturalWidth>0),true,name+" failed joint art load");
        assert.equal(await page.locator(".cheers-word").textContent(),"CHEERS,");
        assert.equal(await page.locator(".sesh-item").count(),0,"No targets before start");
        const logoBounds=await page.locator(".logo-smoke").boundingBox();
        if(mobile){
          assert.ok(logoBounds && logoBounds.width<=150,"WebKit must honor mobile smoke logo width: "+JSON.stringify(logoBounds));
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
            const headerElements=["html","body",".header-shell",".logo",".logo-smoke",".logo-type",".header-actions","#fx-toggle","#menu-toggle",".desktop-nav"].map(selector=>{
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
            return {logo:rect(".logo"),mark:rect(".logo-smoke"),fx:rect("#fx-toggle"),menu:rect("#menu-toggle"),header:rect(".header-shell"),eyebrow:rect(".hero-copy-block .eyebrow")};
          });
          assert.ok(controls.mark.bottom<=controls.header.bottom+2,name+" smoke artwork outside header");
          assert.ok(controls.logo.left>=controls.header.left-2 && controls.logo.right<=controls.header.right+2,name+" full brand outside header");
          assert.ok(controls.menu.left>=controls.header.left-2 && controls.fx.right<=controls.header.right+2,name+" header controls outside bounds");
          assert.ok(controls.header.height<=102,name+" mobile header is too thick");
          assert.ok(Math.abs((controls.logo.left+controls.logo.right)/2-(controls.header.left+controls.header.right)/2)<=2,name+" brand not centered");
          assert.ok(controls.menu.right+3<=controls.logo.left,name+" menu and brand overlap");
          assert.ok(controls.logo.right+3<=controls.fx.left,name+" brand and FX overlap");
          assert.ok(controls.eyebrow.top-controls.header.bottom>=55 && controls.eyebrow.top-controls.header.bottom<=260,name+" hero top gap out of range");
        }
        await page.evaluate(()=>{Math.random=()=>0.5;});
        await page.locator("#sesh-start").click();
        const wisp=page.locator(".sesh-item--grinder").first();
        await wisp.waitFor({state:"visible",timeout:6000});
        await wisp.click({timeout:3500});
        assert.ok(Number(await page.locator("#sesh-score").textContent())>0,name+" tap did not award points");
        await page.locator("#sesh-pause").click();
        assert.equal(await page.locator("#sesh-stage").getAttribute("data-mode"),"paused");
        await page.locator("#sesh-pause").click();
        assert.equal(await page.locator("#sesh-stage").getAttribute("data-mode"),"playing");
        await page.locator("#sesh-start").click();
        assert.equal(await page.locator("#sesh-score").textContent(),"0000",name+" restart didn't reset");
        assert.deepEqual(errors,[],name+" had browser JS errors");
        await page.close();
        console.log("PASS "+name+" "+width+"px responsive hero, safe header, controls, game interactions");
      }
    }finally{
      if(browser)await browser.close();
    }
  }
}finally{
  await new Promise(done=>server.close(done));
}
