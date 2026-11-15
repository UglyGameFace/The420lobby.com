import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,sep,extname} from "node:path";
import {createRequire} from "node:module";
import assert from "node:assert/strict";
const {chromium}=createRequire(import.meta.url)("playwright");

const root=resolve(import.meta.dirname,"../dist");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,"http://localhost").pathname;
    const target=resolve(root,"."+decodeURIComponent(path));
    if(!target.startsWith(root+sep)) {res.writeHead(403);res.end();return;}
    const data=await readFile(target);
    res.writeHead(200,{"Content-Type":mime[extname(target)]||"application/octet-stream"});
    res.end(data);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const host="http://127.0.0.1:"+server.address().port;
let browser;
try {
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [320,390,820,1440]) {
    const page=await browser.newPage({viewport:{width,height:width<500?840:900},reducedMotion:"reduce"});
    const errors=[], calls=[];
    page.on("pageerror",error=>errors.push(error.message));
    const state={services:[],events:[],setupPending:false,role:"owner",
      scheduler:{lastTickAt:Date.now(),webhookConfigured:1,attempted:0,sent:0,failed:0}};
    await page.route("**/api/**",async route=>{
      const req=route.request(),path=new URL(req.url()).pathname;
      let result={},status=200;
      if(path==="/api/session") {
        result={user:{id:"123456789012345678",username:"Tester"},csrfToken:"fixture-csrf",configured:true};
      } else if(path==="/api/shield/status" && req.method()==="GET") {
        result={role:"owner",dankShield:{
          database:{status:"connected",tickets:{open:1},activity24h:{atLeast:15},checkedAt:Date.now()},
          liveBot:{status:"heartbeat_recent",guildCount:10,lastSeenAt:new Date().toISOString()},
          sourceCi:{status:"passed"}
        }};
      } else if(path==="/api/bump-manager" && req.method()==="GET") {
        result={...state,serverTime:Date.now()};
      } else if(req.method()==="POST") {
        assert.equal(req.headers()["x-csrf-token"],"fixture-csrf");
        const body=req.postDataJSON();calls.push({path,body});
        if(path==="/api/bump-manager/services") {
          const id="123e4567-e89b-42d3-a456-426614174000",now=Date.now();
          state.services.push({id,name:body.name,channelUrl:body.channelUrl,cooldownMinutes:body.cooldownMinutes,
            enabled:true,nextDueAt:now+body.cooldownMinutes*60000,lastCompletedAt:null,
            reminderStatus:"none",lastReminderDueAt:null,updatedAt:now});
          result={ok:true,id};status=201;
        } else if(path.endsWith("/complete")) {
          const row=state.services[0];row.lastCompletedAt=Date.now();
          row.nextDueAt=row.lastCompletedAt+row.cooldownMinutes*60000;
          result={ok:true};
        } else if(path.endsWith("/state")) {
          state.services[0].enabled=body.enabled;result={ok:true};
        } else {status=404;result={error:{message:"Unexpected request: "+path}};}
      } else {status=404;result={error:{message:"Unexpected request: "+path}};}
      await route.fulfill({status,contentType:"application/json",body:JSON.stringify(result)});
    });
    await page.goto(host+"/bump-manager.html",{waitUntil:"domcontentloaded"});
    await page.locator("#dashboard").waitFor({state:"visible"});
    assert.match(await page.locator("#connection").innerText(),/Scheduler online/);
    await page.waitForFunction(()=>document.getElementById("dank-summary")?.textContent.includes("Connected to Dank Shield database"));
    assert.match(await page.locator("#dank-summary").innerText(),/1 open tickets/);
    assert.match(await page.locator("#dank-heartbeat").innerText(),/heartbeat recent/i);
    await page.locator("#add-toggle").click();
    await page.locator("#service-name").fill("DISBOARD");
    await page.locator("#channel-url").fill("https://discord.com/channels/123456789012345678/123456789012345679");
    await page.locator("#cooldown-minutes").fill("120");
    await page.locator("#save-service").click();
    await page.locator(".service").waitFor();
    assert.equal(await page.locator(".service").count(),1);
    assert.ok((await page.locator(".service").innerText()).includes("DISBOARD"));
    assert.equal(await page.locator("#active-count").innerText(),"1");
    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:"I completed this"}).click();
    await page.waitForFunction(()=>document.querySelector(".service-meta")?.textContent.includes("Owner marked complete:")&&
      !document.querySelector(".service-meta")?.textContent.includes("Not recorded"));
    assert.ok(calls.some(c=>c.path.endsWith("/complete")));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=2,"Dashboard overflows at "+width+"px by "+overflow);
    assert.deepEqual(errors,[],"Browser errors at "+width+"px");
    await page.close();
  }
  // Staff can inspect service status, but mutations and editor controls are absent.
  const staff=await browser.newPage({viewport:{width:390,height:840}});
  await staff.route("**/api/**",route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==="/api/session") return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({user:{id:"123456789012345680",username:"Staff"},csrfToken:"test",configured:true})});
    if(path==="/api/bump-manager") return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({role:"staff",setupPending:false,services:[],events:[],scheduler:null})});
    return route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:{code:"owner_only"}})});
  });
  await staff.goto(host+"/bump-manager.html");
  await staff.locator("#dashboard").waitFor({state:"visible"});
  assert.equal(await staff.locator("#add-toggle").isVisible(),false);
  assert.equal(await staff.locator("#editor").isVisible(),false);
  await staff.close();
  const guest=await browser.newPage();
  await guest.route("**/api/session",route=>route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({user:null,csrfToken:null,configured:true})}));
  await guest.goto(host+"/bump-manager.html");
  await guest.locator("#auth-panel").waitFor({state:"visible"});
  assert.equal(await guest.locator("#dashboard").isVisible(),false);
  await guest.close();
  console.log("Bump manager mobile, desktop, manual actions and guest-gating browser tests passed.");
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
