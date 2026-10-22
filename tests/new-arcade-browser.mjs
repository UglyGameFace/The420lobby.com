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
    else if(url.pathname==="/api/profile")body={user:member,stats:{runs:4,totalScore:1240,gamesPlayed:2},achievements:[],bests:[]};
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
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:width===390?844:900},reducedMotion:"reduce"});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const calls=await wire(page,false);
    await page.goto(host+"/arcade.html",{waitUntil:"domcontentloaded"});
    await page.getByText("CHOOSE YOUR SESH").waitFor();
    assert.equal(await page.locator("button").filter({hasText:"Launch Sesh Invaders"}).count(),1);
    assert.equal(await page.locator("button").filter({hasText:"Play Bong Blitz"}).count(),1);
    assert.equal(await page.locator("button").filter({hasText:"Launch Canna-Runner"}).count(),1);
    assert.equal(await page.locator("body").evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(8, 15, 14)");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=2),"mobile horizontal overflow at "+width);
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
  console.log("PASS new arcade: real-session fixtures, new cabinets, signed-in run creation, guest fallback, palette and responsiveness");
}finally{await browser?.close();server.close();}
