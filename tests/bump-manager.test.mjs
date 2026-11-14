import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handleRequest} from "../functions/_lib/app.mjs";
import {hash, randomToken, SESSION_COOKIE} from "../functions/_lib/auth.mjs";
import {deliverDueReminders} from "../workers/bump-scheduler.mjs";

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec(readFileSync(new URL("../migrations/0001_arcade.sql", import.meta.url),"utf8"));
  }
  prepare(sql) {
    const sqlite = this.sqlite;
    return {
      values: [],
      bind(...values) {this.values = values; return this;},
      async first() {return sqlite.prepare(sql).get(...this.values)||null;},
      async all() {return {success:true,results:sqlite.prepare(sql).all(...this.values)};},
      async run() {const x=sqlite.prepare(sql).run(...this.values);return {success:true,meta:{changes:Number(x.changes)}};}
    };
  }
}
const base = "https://the420lobby.com";
const channel = "https://discord.com/channels/123456789012345678/123456789012345679";
function fixture(){
  const env = {DB:new TestD1(),SITE_ORIGIN:base,DISCORD_CLIENT_ID:"123456789012345678",DISCORD_CLIENT_SECRET:"local-test-only",
    BUMP_MANAGER_OWNER_ID:"123456789012345679",BUMP_REMINDER_WEBHOOK_URL:"https://discord.com/api/webhooks/123456789012345678/"+ "a".repeat(40)};
  async function login(id = env.BUMP_MANAGER_OWNER_ID) {
    const token=randomToken(),csrf=await hash("csrf:"+token),now=Date.now();
    await env.DB.prepare("INSERT INTO users(id,username,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?)")
      .bind(id,"owner","https://cdn.discordapp.com/embed/avatars/0.png",now,now).run();
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?,?)".replace("VALUES(?,?,?,?,?)","VALUES(?,?,?,?)"))
      .bind(await hash(token),id,now,now+600000).run();
    return {token,csrf};
  }
  async function request(path,session,body,headers={}) {
    const method=body===undefined?"GET":"POST";
    const opts={method,headers:{
      ...(session?{"Cookie":SESSION_COOKIE+"="+session.token}:{}),
      ...(body!==undefined?{"Content-Type":"application/json","Origin":base,"X-CSRF-Token":session?.csrf||""}:{}),...headers
    }};
    if(body!==undefined)opts.body=JSON.stringify(body);
    return handleRequest({request:new Request(base+path,opts),env,next:()=>new Response("static")});
  }
  return {env,login,request};
}
const data = r=>r.json();
const error = async r=>(await r.json()).error?.code;

test("bump-manager routes are private, fail closed and do not mutate public D1 on GET",async()=>{
  const app=fixture(),owner=await app.login();
  assert.equal((await app.request("/api/bump-manager")).status,401);
  assert.equal((await app.request("/api/bump-manager",owner)).status,200);
  assert.equal((await data(await app.request("/api/bump-manager",owner))).setupPending,true);
  assert.equal(await error(await app.request("/api/bump-manager/setup",owner,{},{"X-CSRF-Token":"wrong"})),"invalid_csrf");
  delete app.env.BUMP_MANAGER_OWNER_ID;
  assert.equal(await error(await app.request("/api/bump-manager",owner)),"owner_setup_required");
});

test("non-owner cannot initialize, inspect or change services",async()=>{
  const app=fixture(),stranger=await app.login("999999999999999999");
  assert.equal(await error(await app.request("/api/bump-manager",stranger)),"owner_only");
  assert.equal(await error(await app.request("/api/bump-manager/setup",stranger,{})),"owner_only");
  const table=await app.env.DB.prepare("SELECT name FROM sqlite_master WHERE name='bump_services'").first();
  assert.equal(table,null);
});

test("manager setup, add, edit, pause, completion, archive and truthful audit",async()=>{
  const app=fixture(),owner=await app.login();
  assert.equal((await app.request("/api/bump-manager/setup",owner,{})).status,200);
  assert.equal((await app.request("/api/bump-manager/setup",owner,{})).status,200);
  assert.equal(await error(await app.request("/api/bump-manager/services",owner,{name:"OneBump",channelUrl:"javascript:alert(1)",cooldownMinutes:120})),"invalid_channel");
  assert.equal(await error(await app.request("/api/bump-manager/services",owner,{name:"OneBump",channelUrl:channel,cooldownMinutes:0})),"invalid_cooldown");
  assert.equal(await error(await app.request("/api/bump-manager/services",owner,{name:"OneBump",channelUrl:"https://evil.test/channels/123456789012345678/123456789012345679",cooldownMinutes:120})),"invalid_channel");
  const created=await data(await app.request("/api/bump-manager/services",owner,{name:"OneBump",channelUrl:channel,cooldownMinutes:120}));
  assert.equal(created.ok,true);
  const id=created.id;
  assert.equal(await error(await app.request("/api/bump-manager/services",owner,{name:"onebump",channelUrl:channel,cooldownMinutes:120})),"service_exists");
  assert.equal((await data(await app.request("/api/bump-manager",owner))).services.length,1);
  await app.request("/api/bump-manager/services/"+id+"/state",owner,{enabled:false});
  assert.equal(await error(await app.request("/api/bump-manager/services/"+id+"/complete",owner,{})),"paused");
  await app.request("/api/bump-manager/services/"+id+"/state",owner,{enabled:true});
  await app.request("/api/bump-manager/services/"+id+"/complete",owner,{});
  let row=(await data(await app.request("/api/bump-manager",owner))).services[0];
  assert.ok(row.lastCompletedAt>0);
  assert.ok(row.nextDueAt>row.lastCompletedAt);
  await app.request("/api/bump-manager/services/"+id+"/edit",owner,{name:"OneBump New",channelUrl:channel,cooldownMinutes:180});
  row=(await data(await app.request("/api/bump-manager",owner))).services[0];
  assert.equal(row.name,"OneBump New"); assert.equal(row.cooldownMinutes,180);
  await app.request("/api/bump-manager/services/"+id+"/archive",owner,{});
  const state=await data(await app.request("/api/bump-manager",owner));
  assert.equal(state.services.length,0);
  assert.ok(state.events.some(e=>e.event==="owner_marked_complete"&&e.detail.includes("not independently verified")));
  assert.ok(state.events.some(e=>e.event==="archived"));
});

test("cron sends only reminders once per due window, not bump commands",async()=>{
  const app=fixture(),owner=await app.login();
  await app.request("/api/bump-manager/setup",owner,{});
  const id=(await data(await app.request("/api/bump-manager/services",owner,{name:"DISBOARD",channelUrl:channel,cooldownMinutes:120}))).id;
  const calls=[];
  const sender=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return new Response(null,{status:204});
  };
  let outcome=await deliverDueReminders(app.env,sender,Date.now()+1000);
  assert.deepEqual([outcome.attempted,outcome.sent,outcome.failed],[1,1,0]);
  outcome=await deliverDueReminders(app.env,sender,Date.now()+2000);
  assert.equal(outcome.attempted,0);assert.equal(calls.length,1);
  assert.match(calls[0].body.content,/Manual bump reminder/);
  assert.doesNotMatch(calls[0].body.content,/\/bump/);
  assert.deepEqual(calls[0].body.allowed_mentions,{parse:[]});
  assert.equal((await data(await app.request("/api/bump-manager",owner))).services[0].reminderStatus,"sent");
  await app.request("/api/bump-manager/services/"+id+"/complete",owner,{});
  outcome=await deliverDueReminders(app.env,sender,Date.now()+5000);
  assert.equal(outcome.attempted,0);
});

test("failed or ambiguous webhook delivery is not retried blindly",async()=>{
  const app=fixture(),owner=await app.login();
  await app.request("/api/bump-manager/setup",owner,{});
  await app.request("/api/bump-manager/services",owner,{name:"Discodus",channelUrl:channel,cooldownMinutes:120});
  let count=0;
  const sender=async()=>{count++;throw new Error("network timeout");};
  const t=Date.now()+1000;
  const first=await deliverDueReminders(app.env,sender,t);
  const second=await deliverDueReminders(app.env,sender,t+2000);
  assert.equal(first.failed,1);assert.equal(second.attempted,0);assert.equal(count,1);
  const rows=await data(await app.request("/api/bump-manager",owner));
  assert.equal(rows.services[0].reminderStatus,"delivery_unknown");
  app.env.BUMP_REMINDER_WEBHOOK_URL="";
  assert.equal((await deliverDueReminders(app.env,sender,t+5000)).configured,false);
  assert.equal(count,1);
});
