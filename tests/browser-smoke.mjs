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
    assert.equal(await page.title(),"The 420 Lobby | After Cheers, We Play");
    assert.equal(await page.locator(".experience-card").count(),4);
    assert.equal(await page.locator(".card-body").count(),4,"custom feature card content needs to be present");
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
    assert.equal(await page.locator("img.botanical-foreground").evaluate(el=>el.complete && el.naturalWidth>0),true,"leaf illustration failed");
    assert.equal(await page.locator("img.logo-smoke").evaluate(el=>el.complete && el.naturalWidth>0),true,"smoke 420 logo failed");
    assert.equal(await page.locator(".cheers-roll img").evaluate(el=>el.complete && el.naturalWidth>0),true,"approved joint art failed to load");
    assert.equal(await page.locator(".cheers-word").textContent(),"CHEERS,","hero slogan regressed");
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
      assert.ok(layout.logo.left >= layout.header.left-2 && layout.logo.right <= layout.header.right+2,
        "full brand must fit inside the header");
      assert.ok(layout.menu.left >= layout.header.left-2 && layout.fx.right <= layout.header.right+2,
        "header controls must fit inside the header");
      assert.ok(layout.menu.right+3 <= layout.fx.left, "effects and menu buttons overlap");
      if(layout.viewport<=460){
        assert.ok(layout.logo.top >= Math.max(layout.menu.bottom,layout.fx.bottom)-2,
          "narrow mobile brand and header controls overlap vertically");
      }else{
        assert.ok(layout.menu.right+3 <= layout.logo.left, "menu and brand overlap");
        assert.ok(layout.logo.right+3 <= layout.fx.left, "brand and FX controls overlap");
      }
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
    const cheersArt=await page.locator(".headline-cheers").evaluate(el=>{
      const r=el.getBoundingClientRect();
      const roll=el.querySelector(".cheers-roll img").getBoundingClientRect();
      const font=getComputedStyle(el).fontFamily;
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,rollHeight:roll.height,font};
    });
    assert.ok(cheersArt.rollHeight>8,"joint must be visibly scaled");
    assert.ok(cheersArt.left>=0 && cheersArt.right<=scenario.size.width+2,
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
    if (scenario.name === "mobile" || scenario.name === "narrow-mobile") {
      await page.locator("#sesh-signal").scrollIntoViewIfNeeded();
      await page.evaluate(()=>{Math.random=()=>0.5;});
      await page.locator("#sesh-start").click();
      await page.locator(".sesh-item--grinder").first().waitFor({state:"visible",timeout:6500});
      const firstWisp=page.locator(".sesh-item--grinder").first();
      const relativeHitbox = () => firstWisp.evaluate(button => {
        const b=button.getBoundingClientRect();
        const board=document.querySelector("#sesh-stage").getBoundingClientRect();
        return {x:b.x-board.x,y:b.y-board.y,width:b.width,height:b.height,scrollY:window.scrollY};
      });
      const hitbox1=await relativeHitbox();
      await page.waitForTimeout(120);
      const hitbox2=await relativeHitbox();
      const stable=Math.abs(hitbox1.width-hitbox2.width)<0.5 &&
        Math.abs(hitbox1.height-hitbox2.height)<0.5 &&
        Math.abs(hitbox1.x-hitbox2.x)<0.5 &&
        Math.abs(hitbox1.y-hitbox2.y)<0.5;
      assert.ok(stable,"Smoke hitbox moves relative to game board: "+JSON.stringify({hitbox1,hitbox2}));
      // A real click must work, even if the browser needs to scroll the page to the board.
      await firstWisp.click({timeout:5000});
      const points=Number(await page.locator("#sesh-score").textContent());
      assert.ok(points>0,"tapping a grinder should award points");
      assert.ok(await page.locator('[data-kit="grinder"]').evaluate(el=>el.classList.contains("is-collected")),"grinder should visibly advance kit tracker");
      await page.locator("#sesh-pause").click();
      assert.equal(await page.locator("#sesh-stage").getAttribute("data-mode"),"paused");
      const frozen=await page.locator("#sesh-time").textContent();
      await page.waitForTimeout(250);
      assert.equal(await page.locator("#sesh-time").textContent(),frozen,"pausing must stop the clock");
      await page.locator("#sesh-pause").click();
      assert.equal(await page.locator("#sesh-stage").getAttribute("data-mode"),"playing");
      await page.locator("#sesh-sound").click();
      assert.equal(await page.locator("#sesh-sound").getAttribute("aria-pressed"),"true");
      await page.locator("#sesh-sound").click();
      assert.equal(await page.locator("#sesh-sound").getAttribute("aria-pressed"),"false");
      await page.locator("#sesh-start").click();
      assert.equal(await page.locator("#sesh-score").textContent(),"0000","restarting resets the score");
      await page.locator("#sesh-pause").click();
      await page.locator(".arcade-machine").screenshot({path:"artifacts/"+scenario.name+"-arcade.png",animations:"disabled"});
      await page.evaluate(()=>{Math.random=()=>0.08;});
      await page.locator("#sesh-start").click();
      const broken=page.locator(".sesh-item--broken-bong").first();
      await broken.waitFor({state:"visible",timeout:6500});
      assert.match(await broken.getAttribute("aria-label"),/avoid clicking/);
      await broken.click({timeout:5000});
      assert.equal(await page.locator("#sesh-combo").textContent(),"x0","broken glass must wipe combo");
      assert.equal(await page.locator(".sesh-kit-tracker .is-collected").count(),0,"broken glass must reset kit tracker");
      assert.match(await page.locator("#sesh-announcement").textContent(),/Broken glass/);
      await page.evaluate(()=>{Math.random=()=>0.96;});
      await page.locator("#sesh-start").click();
      const rare=page.locator(".sesh-item--clean-glass").first();
      await rare.waitFor({state:"visible",timeout:6500});
      await rare.click({timeout:5000});
      assert.ok(Number(await page.locator("#sesh-score").textContent())>=45,"intact glass must award bonus");
      await page.locator("#sesh-pause").click();
            if (scenario.name === "mobile") {
        await page.evaluate(()=>{Math.random=()=>0.35;});
        await page.locator("#sesh-start").click();
        await page.locator(".sesh-item--lighter").first().click({timeout:6000});
        await page.evaluate(()=>{Math.random=()=>0.55;});
        await page.locator(".sesh-item--grinder").first().click({timeout:6000});
        await page.evaluate(()=>{Math.random=()=>0.80;});
        await page.locator(".sesh-item--papers").first().click({timeout:6000});
        assert.ok(Number(await page.locator("#sesh-score").textContent())>=117,
          "one of each kit item must yield +75 set bonus");
        assert.equal(await page.locator(".sesh-kit-tracker .is-collected").count(),0,
          "three-piece kit should reset after completion");
        assert.match(await page.locator("#sesh-announcement").textContent(),/Full sesh kit complete/);
        await page.locator("#sesh-pause").click();
      }
      console.log("PASS "+scenario.name+" arcade: accessories, glass hazards, completed kit, score, pause, resume, audio toggle, restart");
    }
    if(scenario.name==="desktop" || scenario.name==="mobile" || scenario.name==="narrow-mobile") {
      await page.locator("#sesh-signal").scrollIntoViewIfNeeded();
      await page.locator(".arcade-machine").screenshot({path:"artifacts/"+scenario.name+"-arcade-styled.png",animations:"disabled",timeout:10000});
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
  await stale.route("**/styles.css",route=>route.fulfill({
    status:200,contentType:"text/css",body:":root{--lime:#b8f875} body{margin:0}"
  }));
  await stale.goto(address,{waitUntil:"domcontentloaded"});
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