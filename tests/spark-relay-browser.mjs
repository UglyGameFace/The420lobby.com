/* Spark Relay end-to-end browser interactions. Isolated API fixture,
   no production Discord account, database, or bot connection required. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,sep,extname} from "node:path";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)("playwright");
const root=resolve(import.meta.dirname,"..");
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
  ".svg":"image/svg+xml",".webp":"image/webp",".png":"image/png"};
const server=createServer(async(req,res)=>{
  try{
    const relative=new URL(req.url,"http://localhost").pathname;
    const path=resolve(root,"."+decodeURIComponent(relative==="/"?"/index.html":relative));
    if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);
    res.writeHead(200,{"Content-Type":mime[extname(path)]||"application/octet-stream",
      "Cache-Control":"no-store"});res.end(bytes);
  }catch(_){res.writeHead(404);res.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url="http://127.0.0.1:"+server.address().port;
const rules={durationMs:42000,firstBeatMs:3000,beatIntervalMs:3800,hitWindowMs:950,beatCount:10};
let browser;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  await mkdir("artifacts",{recursive:true});
  for(const width of [390,960]){
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:"reduce"});
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    let round=null,attempts=0,online=false,looking=false;
    await page.route(/\/api\/cheers(?:\/spark|\/presence)?(?:\?.*)?$/,async route=>{
      const req=route.request();
      let body;
      if(req.method()==="GET")body={serverTime:Date.now(),rules,round,gameReady:true,
        setupPending:false,bestScore:340,onlinePlayers:Number(online),lookingPlayers:Number(looking)};
      else if(new URL(req.url()).pathname==="/api/cheers/presence"){
        const payload=req.postDataJSON();
        assert.equal(req.headers()["x-csrf-token"],"browser-csrf");
        assert.equal(typeof payload.online,"boolean");
        assert.equal(typeof payload.looking,"boolean");
        online=payload.online;looking=payload.looking;
        body={serverTime:Date.now(),rules,round,gameReady:true,bestScore:340,
          onlinePlayers:Number(online),lookingPlayers:Number(looking),presence:{online,looking}};
      }
      else if(new URL(req.url()).pathname==="/api/cheers"){
        assert.equal(req.headers()["x-csrf-token"],"browser-csrf");
        const now=Date.now();
        round={id:42,startedAt:now-3000,endsAt:now-3000+42000,
          participants:2,teamScore:0,combo:0,maxCombo:0,hits:[]};
        body={serverTime:now,rules,round,bestScore:340,gameReady:true,joined:true,setupPending:false};
      }else{
        const b=req.postDataJSON();attempts++;
        assert.deepEqual(b,{roundId:42,beat:0});
        assert.equal(req.headers()["x-csrf-token"],"browser-csrf");
        round={...round,teamScore:150,combo:1,maxCombo:1,
          hits:[{beat:0,points:150}]};
        body={serverTime:Date.now(),rules,round,bestScore:340,gameReady:true,captured:true,awarded:150,setupPending:false};
      }
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
    });
    await page.route(/\/api\/session$/,route=>route.fulfill({
      status:200,contentType:"application/json",body:JSON.stringify({
        configured:true,user:{id:"123456789012345678",username:"tester",avatarUrl:""},csrfToken:"browser-csrf"
      })
    }));
    await page.goto(url,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.querySelector("#lounge-cheers-join")?.disabled===false);
    assert.equal(await page.locator(".spark-step").count(),10);
    const bounds=await page.locator("#spark-arena").boundingBox();
    assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+2,"Spark Relay clips on "+width);
    assert.equal(await page.locator("#spark-online").textContent(),"0");
    await page.locator("#spark-presence-toggle").click();
    await page.waitForFunction(()=>document.querySelector("#spark-online")?.textContent==="1");
    assert.equal(await page.locator("#spark-looking").textContent(),"1");
    assert.equal(await page.locator("#spark-presence-toggle").textContent(),"LEAVE LOOKING LIST");
    await page.locator("#lounge-cheers-join").click();
    await page.waitForFunction(()=>document.querySelector("#spark-arena")?.dataset.phase==="live",{timeout:2000});
    await page.waitForFunction(()=>document.querySelector("#spark-looking")?.textContent==="0");
    assert.equal(await page.locator("#spark-online").textContent(),"1");
    assert.equal(await page.locator("#lounge-cheers-participants").textContent(),"2");
    assert.equal(await page.locator("#spark-score").textContent(),"0");
    assert.equal(await page.locator("#lounge-spark-button").isDisabled(),false,
      "A real signed-in player must be able to catch the spark");
    await page.locator("#lounge-spark-button").click();
    await page.waitForFunction(()=>document.querySelector("#spark-score")?.textContent==="150");
    assert.equal(attempts,1);
    assert.equal(await page.locator("#spark-combo").textContent(),"1");
    assert.equal(await page.locator("#spark-captured").textContent(),"1/10");
    assert.equal(await page.locator('.spark-step[data-beat="0"]').getAttribute("data-state"),"caught");
    assert.equal(await page.locator("#lounge-spark-button").isDisabled(),true,
      "Player cannot score the same beat again");
    const image=page.locator(".lounge-cheers-art");
    assert.match(await image.getAttribute("data-smoke-motion"),/cheers-real-smoke-blunt-loop/);
    assert.equal(await page.locator("#spark-presence-leave").isVisible(),true,
      "A player must be able to opt out of being listed online");
    await page.locator("#spark-relay").screenshot({
      path:"artifacts/spark-relay-"+width+".png",animations:"disabled"
    });
    await page.locator("#spark-presence-leave").click();
    await page.waitForFunction(()=>document.querySelector("#spark-online")?.textContent==="0");
    await page.locator("#spark-presence-leave").waitFor({state:"hidden",timeout:2500});
    assert.equal(await page.locator("#spark-presence-leave").isVisible(),false);
    await page.locator("#spark-presence-toggle").click();
    await page.waitForFunction(()=>document.querySelector("#spark-looking")?.textContent==="1");
    assert.equal(await page.locator("#spark-online").textContent(),"1");
    assert.deepEqual(errors,[],"Spark Relay frontend threw an error");
    await page.close();
    console.log("PASS Spark Relay "+width+"px: join, synchronized spark, server points, disabled duplicate, responsive stage");
  }
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
