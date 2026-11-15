import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleRequest} from "../functions/_lib/app.mjs";
import {hash, randomToken, SESSION_COOKIE, shieldRole} from "../functions/_lib/auth.mjs";

class DB {
  constructor() {this.db=new DatabaseSync(":memory:");this.db.exec(readFileSync(new URL("../migrations/0001_arcade.sql",import.meta.url),"utf8"));}
  prepare(sql) {
    const db=this.db;
    return {args:[],bind(...v){this.args=v;return this;},async first(){return db.prepare(sql).get(...this.args)||null;},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){db.prepare(sql).run(...this.args);return {success:true}}};
  }
}
const shield="https://shield.the420lobby.com",main="https://the420lobby.com";
const OWNER="123456789012345679",STAFF="123456789012345680",VISITOR="123456789012345681";
async function fixture() {
 const env={DB:new DB(),SITE_ORIGIN:main,BUMP_MANAGER_OWNER_ID:OWNER,SHIELD_STAFF_IDS:STAFF,DISCORD_CLIENT_ID:"123456789012345678",DISCORD_CLIENT_SECRET:"dev-only",ASSETS:{fetch:async r=>new Response("asset")}};
 async function login(id) {
   const t=randomToken(),now=Date.now();
   await env.DB.prepare("INSERT INTO users(id,username,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,"testing","https://cdn.discordapp.com/embed/avatars/0.png",now,now).run();
   await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)").bind(await hash(t),id,now,now+600000).run();
   return SESSION_COOKIE+"="+t;
 }
 async function req(origin,path,cookie="",method="GET",body=null,fetcher) {
   const opts={method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==="POST"?{"Content-Type":"application/json","Origin":origin,"X-CSRF-Token":"bad"}:{})}};
   if(method==="POST")opts.body=JSON.stringify(body);
   return handleRequest({request:new Request(origin+path,opts),env,next:()=>new Response("PUBLIC HOME")},{fetcher});
 }
 return {env,login,req};
}
test("Shield staff read-only access never becomes owner mutation",async()=>{
 const x=await fixture(),owner=await x.login(OWNER),staff=await x.login(STAFF),visitor=await x.login(VISITOR);
 assert.equal(shieldRole(x.env,STAFF),"staff");
 assert.equal(shieldRole(x.env,OWNER),"owner");
 assert.equal(shieldRole(x.env,VISITOR),null);
 assert.equal((await x.req(shield,"/",staff)).status,200);
 assert.equal((await x.req(shield,"/shield.js",staff)).status,200);
 assert.equal((await x.req(shield,"/bump-manager",staff)).status,200);
 assert.equal((await x.req(shield,"/api/bump-manager",staff)).status,200);
 assert.equal((await x.req(shield,"/api/bump-manager",visitor)).status,403);
 assert.equal((await x.req(shield,"/api/bump-manager/setup",staff,"POST",{})).status,403);
 assert.equal((await x.req(shield,"/api/bump-manager/setup",owner,"POST",{})).status,403); // CSRF not satisfied
 assert.equal((await x.req(main,"/shield.js",owner)).status,404);
 assert.equal((await x.req(main,"/api/shield/status",owner)).status,404);
});
test("Source CI is explicitly not live runtime health and external errors remain unknown",async()=>{
 const x=await fixture(),owner=await x.login(OWNER);
 let called=0;
 const fetcher=async url=>{called++;assert.match(url,/api\.github\.com/);return new Response(JSON.stringify({workflow_runs:[{status:"completed",conclusion:"success",html_url:"https://github.com/UglyGameFace/Dank-Shield/actions/runs/123",head_sha:"a".repeat(40)}]}),{status:200});};
 const response=await x.req(shield,"/api/shield/status",owner,"GET",null,fetcher);
 assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.role,"owner");assert.equal(data.dankShield.sourceCi.status,"passed");
 assert.equal(data.dankShield.liveBot.status,"not_connected");
 assert.equal(data.dankShield.structuredApi.status,"private");
 assert.equal(called,1);
 const down=await x.req(shield,"/api/shield/status",owner,"GET",null,async()=>{throw Error("down");});
 assert.equal((await down.json()).dankShield.sourceCi.status,"unavailable");
});
test("broken site origin cannot turn Shield hostname into the public website",async()=>{
 const x=await fixture();
 x.env.SITE_ORIGIN="";
 const r=await x.req(shield,"/");
 assert.notEqual(await r.text(),"PUBLIC HOME");
 assert.notEqual(r.status,200);
});
test("explicit staff access is disabled when owner ID is not configured",async()=>{
 const x=await fixture();
 x.env.BUMP_MANAGER_OWNER_ID="";
 const staff=await x.login(STAFF);
 assert.equal(shieldRole(x.env,STAFF),null);
 assert.equal((await x.req(shield,"/",staff)).status,503);
 assert.equal((await x.req(shield,"/api/shield/status",staff)).status,503);
});
