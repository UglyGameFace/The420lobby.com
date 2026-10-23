import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,sep,extname} from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)("playwright");
const root=resolve(import.meta.dirname,"../dist");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".webp":"image/webp",".woff2":"font/woff2",".ttf":"font/ttf"};
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,"http://localhost").pathname;
    const file=resolve(root,"."+decodeURIComponent(path==="/"?"/index.html":path));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);
    res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
    res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const host="http://127.0.0.1:"+server.address().port;
const member={id:"123456789012345678",username:"420tester",avatarUrl:"/favicon.svg"};
async function wire(page,loggedIn){
  const calls=[];
  await page.route("**/api/**",async route=>{
    const req=route.request(),url=new URL(req.url());
    let body,status=200;
    if(url.pathname==="/api/session")body={user:loggedIn?member:null,csrfToken:loggedIn?"browser-fixture-csrf":null,configured:true};
    else if(url.pathname==="/api/arcade-v2/profile")body={user:member,stats:{runs:4,totalScore:1240,gamesPlayed:2},achievements:[],bests:[]};
    else if(url.pathname==="/api/arcade-v2/leaderboards")body={entries:loggedIn?[{rank:1,game:"sesh-invaders",score:1240,user:member,playedAt:Date.now()}]:[],verification:"discord-account-and-plausibility-only"};
    else if(url.pathname==="/api/arcade-v2/runs"&&req.method()==="POST"){
      assert.equal(req.headers()["x-csrf-token"],"browser-fixture-csrf");
      const data=req.postDataJSON();
      calls.push(data);
      body={id:"fixture-run",game:data.game,expiresAt:Date.now()+900000};
      status=201;
    }else{status=404;body={error:{message:"Unexpected arcade request: "+url.pathname}};}
    await route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  });
  return calls;
}
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:["--no-sandbox"]});
  await mkdir("artifacts",{recursive:true});
  for(const width of [320,390,820,1440]){
    const page=await browser.newPage({viewport:{width,height:width===390?844:900},reducedMotion:"reduce"});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const calls=await wire(page,false);
    await page.goto(host+"/arcade.html",{waitUntil:"domcontentloaded"});
    await page.getByText("CHOOSE YOUR SESH").waitFor();
    // The arcade must display the actual homepage smoke lockup and navigation,
    // not merely match colors or substitute the old leaf logo.
    const logo=page.locator(".site-header .logo.brand-lockup");
    assert.equal(await logo.getAttribute("href"),"/");
    const mark=logo.locator("img.brand-smoke-image");
    assert.equal(await mark.getAttribute("src"),"/assets/lobby-smoke-420-still.webp?v=20261017-smoke-flow4");
    await mark.evaluate(async img=>{await img.decode();});
    assert.ok(await mark.evaluate(img=>img.naturalWidth>0),"main site logo did not load at "+width);
    assert.ok((await logo.locator(".brand-lockup__the").evaluate(el=>getComputedStyle(el).fontFamily)).includes("Unbounded"),"homepage brand font missing");
    assert.equal(await logo.locator(".brand-lockup__the").innerText(),"THE");
    assert.equal(await logo.locator(".brand-lockup__lobby").innerText(),"LOBBY");
    const menu=page.locator("#menu-toggle");
    const nav=page.locator("#primary-nav");
    if(width<=1050){
      const bounds=await logo.boundingBox();
      assert.ok(bounds && Math.abs(bounds.x+bounds.width/2-width/2)<=3,
        "official smoke logo is not centered at "+width+"px: "+JSON.stringify(bounds));
      assert.equal(await menu.isVisible(),true,"mobile/tablet navigation toggle absent");
      assert.equal(await nav.isVisible(),false,"mobile/tablet nav started open");
      await menu.click();
      assert.equal(await nav.isVisible(),true,"nav did not open");
      assert.equal(await menu.getAttribute("aria-expanded"),"true");
      await page.keyboard.press("Escape");
      assert.equal(await nav.isVisible(),false,"Escape failed to dismiss navigation");
    }else{
      assert.equal(await nav.isVisible(),true,"desktop navigation missing");
      assert.equal(await menu.isVisible(),false,"desktop menu toggle should be hidden");
    }
    assert.equal(await page.locator("#fx-toggle").isDisabled(),true,"reduced-motion preference should disable decorative effects");
    const banner=page.locator(".lobby-brand-banner-frame img");
    assert.ok((await banner.getAttribute("src"))?.includes("the420lobby-neon-lounge.webp"),"site branded banner missing");
    await banner.scrollIntoViewIfNeeded();
    await banner.evaluate(async img=>{await img.decode();});
    assert.ok(await banner.evaluate(img=>img.naturalWidth>0),"real lounge artwork failed to load");
    const roster=page.locator(".indie-spotlight__fighter-image");
    assert.equal(await roster.count(),6,"arcade should show six game-creator portraits");
    const realSources=[
      "https://boondocksbrawl.com/portraits/huey.webp",
      "https://boondocksbrawl.com/portraits/riley.webp",
      "https://boondocksbrawl.com/portraits/granddad.webp",
      "/assets/friday-roster-craig.webp",
      "/assets/friday-roster-smokey.webp",
      "/assets/friday-roster-deebo.webp"
    ];
    assert.deepEqual(await roster.evaluateAll(images=>images.map(img=>img.getAttribute("src"))),realSources);
    // The previous implementation checked URLs only, allowing all three Friday
    // characters to render as broken images. Assert actual decoding of the
    // same-origin assets from the compiled Pages static output.
    const fridayImages=page.locator(".indie-spotlight__card--purple .indie-spotlight__fighter-image");
    assert.equal(await fridayImages.count(),3);
    for(let i=0;i<3;i++){
      const image=fridayImages.nth(i);
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async el=>{await el.decode();});
      assert.ok(await image.evaluate(el=>el.complete && el.naturalWidth>0 && el.naturalHeight>0),
        "Friday Fighters portrait "+i+" failed to decode");
    }
    assert.equal(await page.locator(".indie-spotlight__fighter-name").count(),6);
    assert.deepEqual(await page.locator(".indie-spotlight__card").evaluateAll(links=>links.map(a=>a.href)),
      ["https://boondocksbrawl.com/","https://fridayfighters.com/"]);
    // Layout must not rely on third-party portrait load timing, but the actual
    // source and grid fit are checked at every mobile and desktop breakpoint.
    const rosterWidth=await page.locator(".indie-spotlight__roster").first().boundingBox();
    assert.ok(rosterWidth && rosterWidth.x>=0 && rosterWidth.x+rosterWidth.width<=width+2,
      "indie fighter roster spills past "+width+"px viewport");
    assert.equal(await page.locator(".arcade-site-footer .footer-logo").getAttribute("href"),"/");
    assert.ok((await page.locator(".arcade-site-footer .footer-links").innerText()).includes("THE VIBE"));

    assert.equal(await page.locator("button").filter({hasText:"Launch Sesh Invaders"}).count(),1);
    assert.equal(await page.locator("button").filter({hasText:"Play Bong Blitz"}).count(),1);
    assert.equal(await page.locator("button").filter({hasText:"Launch Canna-Runner"}).count(),1);
    assert.equal(await page.locator("body").evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(8, 15, 14)");
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    if(overflow>2){
      const offenders=await page.evaluate(()=>{
        const w=innerWidth;
        return [...document.body.querySelectorAll("*")].map(el=>{
          const r=el.getBoundingClientRect(),css=getComputedStyle(el);
          const clipped=!!el.closest(".overflow-hidden,[style*='overflow: hidden']");
          return {tag:el.tagName,id:el.id,classes:String(el.className).slice(0,130),
            left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),
            overflowX:css.overflowX,clipped};
        }).filter(x=>x.right>w+2||x.left < -2).sort((a,b)=>b.right-a.right).slice(0,30);
      });
      console.error("Arcade viewport "+width+" overflow "+overflow+"px; protruding elements="+JSON.stringify(offenders));
    }
    assert.ok(overflow<=2,"mobile horizontal overflow at "+width+" ("+overflow+"px)");
    await page.locator("main section").first().getByRole("button",{name:"Connect Discord ↗"}).click();
    await page.getByText("YOUR DISCORD IDENTITY").waitFor();
    assert.equal(await page.locator('a[href="/auth/discord"]').isVisible(),true,"discord login was inaccessible after header restoration");
    await page.getByRole("button",{name:"← BACK TO THE ARCADE"}).click();
    await page.getByText("CHOOSE YOUR SESH").waitFor();
    await page.getByRole("button",{name:/Launch Sesh Invaders/i}).click();
    await page.getByText("THE GAME ROOM").waitFor();
    assert.deepEqual(calls,[],"guest should not create an authenticated scoring run");
    await page.screenshot({path:"artifacts/arcade-v2-guest-"+width+".png",fullPage:false,animations:"disabled"});
    assert.deepEqual(errors,[],"guest browser errors at "+width+": "+errors.join(","));
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:"reduce"});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  const calls=await wire(page,true);
  await page.goto(host+"/arcade.html",{waitUntil:"domcontentloaded"});
  await page.getByText("420tester").first().waitFor();
  await page.getByText("1,240").first().waitFor();
  await page.getByRole("button",{name:/Play Bong Blitz/i}).click();
  await page.getByText("THE GAME ROOM").waitFor();
  assert.deepEqual(calls,[{game:"bong-blitz"}],"signed-in game should start a server-issued round");
  assert.deepEqual(errors,[],"signed-in browser errors: "+errors.join(","));
  await page.close();
  // Preserve the shared smoke controller on the client-rendered header.
  const motion=await browser.newPage({viewport:{width:1200,height:900},reducedMotion:"no-preference"});
  await wire(motion,false);
  await motion.goto(host+"/arcade.html",{waitUntil:"domcontentloaded"});
  const toggle=motion.locator("#fx-toggle");
  const mark=motion.locator(".site-header .brand-smoke-image");
  await mark.waitFor();
  await motion.waitForFunction(()=>document.querySelector(".brand-smoke-image")?.getAttribute("src")?.includes("lobby-smoke-420-loop.webp"));
  assert.equal(await toggle.getAttribute("aria-pressed"),"true");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-pressed"),"false");
  assert.ok((await mark.getAttribute("src"))?.includes("lobby-smoke-420-still.webp"),"FX off did not restore the real still image");
  await toggle.click();
  assert.ok((await mark.getAttribute("src"))?.includes("lobby-smoke-420-loop.webp"),"FX on did not restore the original motion image");
  await motion.close();
  console.log("PASS new arcade: original smoke logo/header, responsive navigation, shared image banner, footer, effects, Discord game launch and leaderboards");
}finally{await browser?.close();server.close();}
