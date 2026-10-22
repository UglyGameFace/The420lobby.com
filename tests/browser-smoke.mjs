import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".webp":"image/webp"};
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
    {name:"tablet-960",size:{width:960,height:1200},mobile:false},
    {name:"tablet-1050",size:{width:1050,height:900},mobile:false},
    {name:"desktop-edge-1051",size:{width:1051,height:900},mobile:false},
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
    const tabletOrPhone=scenario.size.width<=1050;
    const nav=page.locator("#primary-nav"), menuButton=page.locator("#menu-toggle");
    assert.equal(await menuButton.getAttribute("aria-expanded"),"false",
      scenario.name+" navigation must start closed");
    assert.equal(await nav.isVisible(),!tabletOrPhone,
      scenario.name+" navigation panel displayed without being opened");
    if(tabletOrPhone){
      assert.equal(await menuButton.isVisible(),true,scenario.name+" hamburger is hidden");
      await menuButton.click();
      assert.equal(await nav.isVisible(),true,scenario.name+" menu should open on tap");
      const joinContrast=await page.locator("#primary-nav .nav-join").evaluate(link=>{
        const color=getComputedStyle(link).color,background=getComputedStyle(link).backgroundColor;
        const linear=(part)=>{const v=part/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
        const luminance=(value)=>{
          const rgb=value.match(/[\d.]+/g)?.slice(0,3).map(Number)||[0,0,0];
          return .2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
        };
        const a=luminance(color),b=luminance(background);
        return {color,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      });
      assert.ok(joinContrast.ratio>=4.5,
        scenario.name+" JOIN THE SERVER contrast is unreadable: "+JSON.stringify(joinContrast));

      assert.equal(await menuButton.getAttribute("aria-expanded"),"true");
      await page.locator(".logo").click();
      assert.equal(await nav.isVisible(),false,scenario.name+" outside tap should dismiss nav");
      await menuButton.click();
      await page.evaluate(()=>window.dispatchEvent(new Event("pageshow")));
      assert.equal(await nav.isVisible(),false,scenario.name+" BFCache restore should reset nav");
      await menuButton.click();
      await page.keyboard.press("Escape");
      assert.equal(await nav.isVisible(),false,scenario.name+" Escape should dismiss nav");
    }

    assert.equal(await page.locator(".experience-card").count(),4);

    assert.equal(await page.locator("#interactive-lounge").count(),1,"interactive lounge missing");

    assert.equal(await page.locator("#spark-relay").count(),1,"Spark Relay game missing");
    assert.equal(await page.locator("#lounge-cheers-join").count(),1);
    assert.equal(await page.locator(".cheers-how-steps li").count(),3,
      "Spark Relay needs three first-time instructions");
    assert.equal(await page.locator("#spark-relay").evaluate(el=>el.closest(".lounge-side")===null),
      true,"The game must not be nested inside the theme sidebar");
    assert.equal(await page.locator("#spark-relay").evaluate(el=>el.closest("#cheers-game")!==null),
      true,"CHEERS should have a dedicated playable game section");
    const gameActionBeforeArena=await page.evaluate(()=>
      document.querySelector("#lounge-cheers-join").compareDocumentPosition(
        document.querySelector("#spark-arena"))&Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(gameActionBeforeArena,scenario.name+" start button must precede the ember stage");
    assert.equal(await page.locator("#spark-presence-leave").isVisible(),false,
      "Offline button should not appear until the visitor opts into presence");
    assert.equal(await page.locator(".spark-step").count(),10,"shared round must have ten visible beats");
    assert.equal(await page.locator("#lounge-spark-button").isDisabled(),true,
      "public visitors cannot submit authenticated sparks without joining");
    const sparkBounds=await page.locator("#spark-arena").boundingBox();
    assert.ok(sparkBounds&&sparkBounds.width>=190&&sparkBounds.height>=230&&
      sparkBounds.x>=-1&&sparkBounds.x+sparkBounds.width<=scenario.size.width+2,
      "Spark Relay stage clips on "+scenario.name+": "+JSON.stringify(sparkBounds));

    assert.equal(await page.locator(".lounge-hotspot").count(),4,"lounge destinations missing");
    const loungeImage=page.locator("#lounge-scene-photo");
    const arcadeImage=await loungeImage.getAttribute("src");
    const expectedImages=new Set(await page.locator(".lounge-hotspot").evaluateAll(buttons=>buttons.map(button=>button.dataset.roomImage)));
    assert.equal(expectedImages.size,4,"each lounge room needs a distinct picture");
    await page.locator(".lounge-hotspot--cinema").click();
    const cinemaImage=await loungeImage.getAttribute("src");
    assert.notEqual(cinemaImage,arcadeImage,"cinema must replace arcade photo");
    assert.match(cinemaImage,/Empty_Movie_Theater/);
    assert.match(await loungeImage.getAttribute("alt"),/movie theater/i);
    if(scenario.name==="desktop"){
      await loungeImage.evaluate(img=>img.decode());
      await page.waitForFunction(()=>document.querySelector("#lounge-scene-photo").dataset.photoState==="ready",
        null,{timeout:10000});
      assert.equal(await loungeImage.getAttribute("data-photo-state"),"ready",
        "cinema scene never becomes visible after loading");
    }
    assert.equal(await page.locator("#lounge-preview-title").textContent(),"MOVIE NIGHTS");
    assert.equal(await page.locator("#lounge-preview-link").getAttribute("href"),"#after-dark");
    await page.locator(".lounge-hotspot--cinema").press("ArrowRight");
    assert.notEqual(await loungeImage.getAttribute("src"),cinemaImage,
      "keyboard navigation must change the scene image");
    assert.match(await loungeImage.getAttribute("src"),/Man_playing_video_games/);
    assert.equal(await page.locator("#lounge-preview-title").textContent(),"YOUR PLAYER CORNER");
    assert.equal(await page.locator("#lounge-preview-link").getAttribute("href"),"https://arcade.the420lobby.com/#profile");
    assert.equal(await page.locator(".lounge-hotspot--profile").getAttribute("aria-pressed"),"true");
    await page.locator(".lounge-hotspot--crew").click();
    assert.match(await loungeImage.getAttribute("src"),/Gamer_friends_playing_video_game/);
    assert.equal(await page.locator("#lounge-preview-link").getAttribute("href"),"#join");
    await page.locator(".lounge-hotspot--arcade").click();
    assert.equal(await loungeImage.getAttribute("src"),arcadeImage,"arcade image should restore");
    assert.equal(await page.locator("#lounge-preview-link").getAttribute("href"),"https://arcade.the420lobby.com/");
    const loungeBox=await page.locator(".lounge-layout").boundingBox();
    assert.ok(loungeBox && loungeBox.x>=-2 && loungeBox.x+loungeBox.width<=scenario.size.width+2,
      "interactive lounge overflows "+scenario.name+": "+JSON.stringify(loungeBox));
    await page.locator('button[data-lounge-theme="midnight"]').click();
    assert.equal(await page.locator('html').getAttribute("data-lounge-theme"),"midnight");
    assert.equal(await page.locator('button[data-lounge-theme="midnight"]').getAttribute("aria-pressed"),"true");
    assert.equal(await page.evaluate(()=>localStorage.getItem("lobby:theme:v1")),"midnight");
    await page.locator("#lounge-secret").click({clickCount:4});
    assert.equal(await page.locator('html').getAttribute("data-lounge-theme"),"halloween");

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

    assert.equal(await page.locator('a[href="https://discord.gg/the420lobby"]').count(),8);
    assert.equal(await page.locator("img.lounge-illustration").evaluate(el=>el.complete && el.naturalWidth>0),true,"hero illustration failed");
    await page.locator(".leaf-seal").scrollIntoViewIfNeeded();
    await page.locator(".leaf-seal img.seal-cannabis-photo").evaluate(img => img.decode());
    assert.ok(await page.locator(".leaf-seal img.seal-cannabis-photo").evaluate(img => img.complete && img.naturalWidth>0),
      "photographic Good Stuff badge leaf failed to load");
    await page.locator(".shield-card").scrollIntoViewIfNeeded();
    const brand=page.locator(".shield-card img.dank-shield-weedtech-art");
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
    assert.ok(shieldGeometry.loaded,"weed-tech Shield artwork failed to decode: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.card.left>=-2 && shieldGeometry.card.right<=scenario.size.width+2,
      "Shield card overflows viewport: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.documentWidth<=scenario.size.width+2,
      "page has horizontal overflow: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.img.width>=160 && shieldGeometry.img.height>=170,
      "Shield weed-tech artwork must fill the media well: "+JSON.stringify(shieldGeometry));
    assert.ok(Math.abs(shieldGeometry.art.width-shieldGeometry.img.width)<=2 &&
      Math.abs(shieldGeometry.art.height-shieldGeometry.img.height)<=2,
      "Shield imagery must cover its dedicated visual well: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.title.width>80&&shieldGeometry.title.height>45,
      "Shield title collapsed: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.cta.height>=30,
      "Shield CTA not tappable: "+JSON.stringify(shieldGeometry));
    assert.ok(shieldGeometry.art.bottom<=shieldGeometry.copy.top+3,
      "Shield visual should stack above copy like the other three cards: "+JSON.stringify(shieldGeometry));
    await page.locator(".shield-card").screenshot({
      path:"artifacts/"+scenario.name+"-shield-card.png",
      animations:"disabled",
    });
    const featureMedia = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      return [".hangout-card .card-visual",".shield-card .shield-feature-art",
        ".cinema-card .card-visual",".minecraft-card .card-visual"]
        .map(selector => ({height:rect(selector).height,width:rect(selector).width}));
    });
    assert.ok(Math.max(...featureMedia.map(r=>r.height))-Math.min(...featureMedia.map(r=>r.height))<=3,
      "all four cards require matching media panel heights: "+JSON.stringify(featureMedia));
    for (const selector of [".cinema-card .cinema-photo",".minecraft-card .minecraft-photo"]) {
      const photo=page.locator(selector);
      await photo.scrollIntoViewIfNeeded();
      await photo.evaluate(img=>img.decode());
      assert.ok(await photo.evaluate(img=>img.complete&&img.naturalWidth>=500),
        "the licensed photo/gameplay image is unavailable: "+selector);
    }
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
    await page.locator("img.brand-smoke-image").evaluate(img=>img.decode());
    assert.equal(await page.locator("img.brand-smoke-image").evaluate(el=>el.complete && el.naturalWidth>0),true,"animated smoke 420 failed");
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
    assert.ok(await countPaintedPixels(page.locator("img.brand-smoke-image"))>200,"rendered wordmark loaded but is invisible");
    assert.ok(await countPaintedPixels(page.locator("img.cheers-art"))>200,"CHEERS smoke art loaded but is invisible");
    assert.ok(await countPaintedPixels(page.locator("img.botanical-foreground"))>100,"new leaf asset loaded but is invisible");
    if(scenario.mobile) {
      assert.equal(await page.locator("img.cheers-leaf").count(),0,"old overlay leaf must not cover realistic CHEERS");
      assert.ok(await countPaintedPixels(page.locator("img.hero-smoke-trail"))>100,"natural left smoke image is invisible");
    }
    assert.equal(await page.locator(".cheers-art").evaluate(el=>el.complete && el.naturalWidth===1100),true,"realistic joint and smoke asset failed to load");
    assert.equal(await page.locator(".cheers-word").textContent(),"CHEERS,","hero slogan regressed");
    assert.equal(await page.locator(".logo-glyph").count(),0,"outdated sticky-note mark still present");
    assert.match(await page.locator(".brand-smoke-image").getAttribute("src"),/\/assets\/lobby-smoke-420-(?:still|loop)\.webp/);
    assert.equal(await page.locator(".logo-prefix").textContent(),"THE");
    assert.equal(await page.locator(".logo-suffix").textContent(),"LOBBY");
    assert.equal(await page.locator(".logo").textContent(),"THELOBBY","420 is an animated image, not CSS lettering");
    assert.equal(await page.locator(".lobby-brand-banner img").getAttribute("src"),"/assets/the420lobby-neon-lounge.webp");
    assert.equal(await page.locator(".logo").getAttribute("aria-label"),"The 420 Lobby home");
    // Previous image and hero checks scroll to lower-page sections; narrow phones
    // can leave the non-sticky header above the viewport. Restore the real
    // initial viewport before measuring navbar clipping and tap-target spacing.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior="auto";
      window.scrollTo(0,0);
    });
    await page.waitForFunction(() => window.scrollY === 0);
    const layout = await page.evaluate(() => {
      const get = selector => {
        const rect=document.querySelector(selector).getBoundingClientRect();
        return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height};
      };
      return {viewport:window.innerWidth,header:get(".header-shell"),logo:get(".logo"),
        mark:get(".brand-smoke-image"),fx:get("#fx-toggle"),menu:get("#menu-toggle"),
        heading:get("#hero-heading"),eyebrow:get(".hero-copy-block .eyebrow"),smokeLabel:get(".scene-label"),
         labels:{the:parseFloat(getComputedStyle(document.querySelector(".brand-lockup__the")).fontSize),
           lobby:parseFloat(getComputedStyle(document.querySelector(".brand-lockup__lobby")).fontSize)}};
    });
    assert.ok(layout.labels.the >= (scenario.size.width < 350 ? 13 : scenario.mobile ? 15 : 18) &&
      layout.labels.lobby >= (scenario.size.width < 350 ? 13 : scenario.mobile ? 15 : 18),
      "THE and LOBBY must be readable beside the animated 420: "+JSON.stringify(layout.labels));
    if(scenario.mobile){
      assert.ok(layout.mark.top >= 0,"smoke 420 image must not crop above the viewport");
      const imgBounds=await page.locator(".brand-smoke-image").boundingBox();
      assert.ok(imgBounds.width>=82,"real smoke numeral compressed beyond legibility: "+JSON.stringify(imgBounds));
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
    const logoPixels=await page.locator(".brand-smoke-image").evaluate(image=>({
      width:image.naturalWidth,height:image.naturalHeight,complete:image.complete
    }));
    assert.ok(logoPixels.complete && logoPixels.width===280 && logoPixels.height===176,
      "The photo-derived smoke frames must decode at 280x176: "+JSON.stringify(logoPixels));
    assert.equal(await page.locator(".lobby-brand-banner img").evaluate(img=>img.complete && img.naturalWidth===2172),true,
      "The full original lounge artwork must be present, not a redraw");
    assert.equal(await page.locator(".reality-prism").count(),1,"optical prism missing");
    const cheersArt=await page.evaluate(()=>{
      const rect=s=>{
        const r=document.querySelector(s).getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
      };
      return {
        cheers:rect(".headline-cheers"),artwork:rect(".cheers-art"),
        joint:rect(".cheers-art"),
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
    assert.equal(liveHaze.animationName,"none","CHEERS image must not pulse or bob as one object");
    assert.match(await page.locator(".cheers-art").getAttribute("data-smoke-motion"),
      /\/assets\/cheers-real-smoke-blunt-loop\.webp/,"CHEERS must run a real internal smoke-flow loop");
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
      assert.equal(await page.locator(".cheers-leaf").count(),0,"photoreal composition needs no vector leaf");
    }
    assert.ok(cheersArt.artwork.left < cheersArt.after.left-3 &&
      cheersArt.after.left-cheersArt.artwork.left < cheersArt.artwork.width*.06,
      "CHEERS needs a small left optical correction without moving the joint separately: "+JSON.stringify(cheersArt));
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
