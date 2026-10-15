import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { chromium } from "playwright";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml"};
const server = createServer(async(req,res)=>{
  try {
    const pathname = new URL(req.url,"http://localhost").pathname;
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
  browser = await chromium.launch({headless:true,args:["--enable-webgl","--use-gl=angle","--use-angle=swiftshader"]});
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
    await page.locator("#hero-heading").waitFor({state:"visible"});
    await page.evaluate(()=>document.fonts.ready);
    const initialHeroOpacity = await page.locator("#hero-heading").evaluate(el=>getComputedStyle(el).opacity);
    assert.equal(initialHeroOpacity,"1","hero text must be readable immediately, not hidden behind scroll observer");
    assert.equal(await page.title(),"The 420 Lobby | After Dark, We Play");
    assert.equal(await page.locator(".experience-card").count(),4);
    assert.equal(await page.locator(".card-body").count(),4,"custom feature card content needs to be present");
    assert.equal(await page.locator('a[href="https://discord.gg/the420lobby"]').count(),4);
    assert.equal(await page.locator("img.lounge-illustration").evaluate(el=>el.complete && el.naturalWidth>0),true,"hero illustration failed");
    assert.equal(await page.locator("img.botanical-foreground").evaluate(el=>el.complete && el.naturalWidth>0),true,"leaf illustration failed");
    assert.equal(await page.locator("img.logo-smoke").evaluate(el=>el.complete && el.naturalWidth>0),true,"smoke 420 logo failed");
    assert.equal(await page.locator(".logo-glyph").count(),0,"outdated sticky-note mark still present");
    const layout = await page.evaluate(() => {
      const get = selector => {
        const rect=document.querySelector(selector).getBoundingClientRect();
        return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height};
      };
      return {viewport:window.innerWidth,header:get(".header-shell"),logo:get(".logo"),
        mark:get(".logo-smoke"),fx:get("#fx-toggle"),menu:get("#menu-toggle"),
        heading:get("#hero-heading"),smokeLabel:get(".scene-label")};
    });
    if(scenario.mobile){
      assert.ok(layout.mark.top >= 0,"smoke 420 image must not crop above the viewport");
      assert.ok(layout.mark.bottom <= layout.header.bottom+2,"smoke 420 image must fit inside the header");
      assert.ok(layout.logo.right+3 <= layout.fx.left, "brand and FX controls overlap");
      assert.ok(layout.fx.right+3 <= layout.menu.left, "effects and menu buttons overlap");
      assert.ok(layout.menu.right <= layout.viewport+1,"menu is offscreen");
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
    await page.screenshot({path:"artifacts/"+scenario.name+".png",animations:"disabled",timeout:10000});
    for (const selector of ["#vibe","#experiences",".hangout-card",".shield-card",".cinema-card",".minecraft-card","#after-dark",".community-proof","#join"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(90);
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:"artifacts/"+scenario.name+"-full.png",fullPage:true,animations:"disabled",timeout:30000});
    assert.deepEqual(errors,[],"uncaught browser errors");
    await page.close();
    console.log("PASS "+scenario.name+" "+scenario.size.width+"x"+scenario.size.height+": links, artwork, navigation, effects toggle, no overflow");
  }
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