import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleRequest} from "../functions/_lib/app.mjs";
import {hash, randomToken, SESSION_COOKIE} from "../functions/_lib/auth.mjs";

class DB {
  constructor() { this.sqlite = new DatabaseSync(":memory:"); this.sqlite.exec(readFileSync(new URL("../migrations/0001_arcade.sql",import.meta.url),"utf8")); }
  prepare(sql) {
    const db=this.sqlite;
    return {values:[],bind(...v){this.values=v;return this;},async first(){return db.prepare(sql).get(...this.values)||null;},async all(){return {results:db.prepare(sql).all(...this.values)};},async run(){db.prepare(sql).run(...this.values);return {success:true}}};
  }
  async batch(rows) {for(const row of rows) await row.run();}
}
const owner="123456789012345679", main="https://the420lobby.com", shield="https://shield.the420lobby.com";
function fixture() {
  const env={DB:new DB(), SITE_ORIGIN:main, DISCORD_CLIENT_ID:"123456789012345678", DISCORD_CLIENT_SECRET:"test-not-live",
    BUMP_MANAGER_OWNER_ID:owner, ASSETS:{fetch:async req=>new Response("asset:"+new URL(req.url).pathname)}};
  const request=async (origin,path,cookie="",options={})=>handleRequest({request:new Request(origin+path,{headers:cookie?{Cookie:cookie}:{}}),env,next:()=>new Response("public-static")},options);
  const login=async id=>{
    const t=randomToken(),now=Date.now();
    await env.DB.prepare("INSERT INTO users(id,username,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?)")
      .bind(id,"tester","https://cdn.discordapp.com/embed/avatars/0.png",now,now).run();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)")
      .bind(await hash(t),id,now,now+600000).run();
    return SESSION_COOKIE+"="+t;
  };
  return {env,request,login};
}
test("Shield homepage requires owner, remains absent from the public site",async()=>{
  const app=fixture();
  const publicPage=await app.request(main,"/");
  assert.equal(publicPage.status,200);
  assert.equal(publicPage.headers.get("Location"),null);
  assert.equal((await app.request(main,"/shield.html")).status,404);
  assert.equal((await app.request(main,"/bump-manager.css")).status,404);
  const anon=await app.request(shield,"/");
  assert.equal(anon.status,200);
  assert.match(await anon.text(),/Sign in with Discord/);
  assert.equal((await app.request(shield,"/shield.css")).status,401);
  assert.equal((await app.request(shield,"/bump-manager")).status,401);
  const guest=await app.login("999999999999999999");
  assert.equal((await app.request(shield,"/",guest)).status,403);
  const cookie=await app.login(owner);
  const home=await app.request(shield,"/",cookie);
  assert.equal(home.status,200);
  assert.match(await home.text(),/asset:\/shield/);
  assert.equal(home.headers.get("Cache-Control"),"private, no-store");
  const manager=await app.request(shield,"/bump-manager",cookie);
  assert.equal(manager.status,200);
  assert.match(await manager.text(),/asset:\/bump-manager/);
});
test("Shield sign-in starts a browser-bound handoff to the original OAuth callback",async()=>{
  const app=fixture();
  const response=await app.request(shield,"/auth/discord");
  assert.equal(response.status,302);
  assert.match(response.headers.get("Location")||"",/^https:\/\/the420lobby.com\/auth\/discord\?shield_nonce_hash=[a-f0-9]{64}$/);
  const set=response.headers.get("Set-Cookie")||"";
  assert.match(set,/__Host-420_shield_browser=/);
  assert.match(set,/Secure/);
  assert.match(set,/HttpOnly/);
  assert.equal((await app.request(main,"/auth/claim")).status,404);
});

function responseCookie(response, name) {
  const cookies = response.headers.getSetCookie?.() || [response.headers.get("Set-Cookie") || ""];
  const match = cookies.join(",").match(new RegExp(name + "=([A-Za-z0-9_-]{43,64})"));
  assert.ok(match, "Expected a secure session cookie named " + name);
  return name + "=" + match[1];
}
const identityFetcher = async url => {
  if (url.endsWith("/oauth2/token")) {
    return new Response(JSON.stringify({token_type:"Bearer",access_token:"fake-test-token"}),{status:200});
  }
  if (url.endsWith("/users/@me")) {
    return new Response(JSON.stringify({id:owner,username:"staff_owner",avatar:null}),{status:200});
  }
  throw Error("Unexpected outgoing request to "+url);
};
test("complete Shield OAuth handoff stays browser bound, one-use and host-only",async()=>{
  const app=fixture();
  const start=await app.request(shield,"/auth/discord");
  const shieldBrowser=responseCookie(start,"__Host-420_shield_browser");
  const mainLink=new URL(start.headers.get("Location"));
  assert.equal(mainLink.origin,main);
  const mainStart=await app.request(main,mainLink.pathname+mainLink.search);
  const oauthCookie=responseCookie(mainStart,"__Host-420_oauth");
  const shieldFlow=responseCookie(mainStart,"__Host-420_shield_flow");
  const authorize=new URL(mainStart.headers.get("Location"));
  const state=authorize.searchParams.get("state");
  assert.match(state||"",/^[A-Za-z0-9_-]{43}$/);
  assert.equal(authorize.searchParams.get("redirect_uri"),main+"/auth/callback");
  const callback=await app.request(main,"/auth/callback?state="+encodeURIComponent(state)+"&code=test",oauthCookie+"; "+shieldFlow,{fetcher:identityFetcher});
  assert.equal(callback.status,302);
  const claimUrl=new URL(callback.headers.get("Location"));
  assert.equal(claimUrl.origin,shield);
  assert.equal(claimUrl.pathname,"/auth/claim");
  const unauthClaim=await app.request(shield,claimUrl.pathname+claimUrl.search);
  assert.equal(unauthClaim.headers.get("Location"),shield+"/?auth=expired");
  const claim=await app.request(shield,claimUrl.pathname+claimUrl.search,shieldBrowser);
  assert.equal(claim.status,302);
  assert.equal(claim.headers.get("Location"),shield+"/");
  const shieldSession=responseCookie(claim,SESSION_COOKIE);
  const homepage=await app.request(shield,"/",shieldSession);
  assert.equal(homepage.status,200);
  assert.match(await homepage.text(),/asset:\/shield/);
  const replay=await app.request(shield,claimUrl.pathname+claimUrl.search,shieldBrowser);
  assert.equal(replay.headers.get("Location"),shield+"/?auth=denied");
  assert.equal((await app.request(main,"/bump-manager",shieldSession)).status,404);
});
