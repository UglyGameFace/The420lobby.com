import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handleRequest} from "../functions/_lib/app.mjs";
import {hash,randomToken,SESSION_COOKIE} from "../functions/_lib/auth.mjs";

class D1 {
  constructor(skipCheersMigration=false){
    this.db=new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys=ON");
    for(const migration of skipCheersMigration?["0001_arcade.sql"]:["0001_arcade.sql","0002_cheers.sql","0003_spark_relay.sql","0004_cheers_presence.sql"])
      this.db.exec(readFileSync(new URL("../migrations/"+migration,import.meta.url),"utf8"));
  }
  prepare(sql) {
    const db=this.db;
    return {args:[],
      bind(...args){this.args=args;return this;},
      async first(){return db.prepare(sql).get(...this.args)||null;},
      async all(){return {results:db.prepare(sql).all(...this.args)};},
      async run(){const result=db.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}
    };
  }
}
const origin="https://lounge.test";
const make=(skipCheersMigration=false)=>{
  const env={DB:new D1(skipCheersMigration),SITE_ORIGIN:origin,DISCORD_CLIENT_ID:"123456789012345678",DISCORD_CLIENT_SECRET:"test-only-value"};
  return {
    env,
    async login(id){
      const token=randomToken(),now=Date.now();
      await env.DB.prepare("INSERT INTO users(id,username,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,"test_user","https://cdn.discordapp.com/embed/avatars/0.png",now,now).run();
      await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)").bind(await hash(token),id,now,now+1000000).run();
      return {token,csrf:await hash("csrf:"+token)};
    },
    async call(method="GET",body,auth,headers={},path="/api/cheers"){
      const h=new Headers(headers);
      if(auth){h.set("Cookie",SESSION_COOKIE+"="+auth.token);if(!h.has("X-CSRF-Token"))h.set("X-CSRF-Token",auth.csrf);}
      if(method==="POST"){h.set("Content-Type","application/json");if(!h.has("Origin"))h.set("Origin",origin);}
      return handleRequest({request:new Request(origin+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env,next:()=>new Response("not a static route")});
    }
  };
};

test("Cheers requires a real login and reports only real participant counts",async()=>{
 const a=make();
 assert.equal((await (await a.call()).json()).round,null);
 assert.equal((await a.call("POST",{})).status,401);
 const u=await a.login("123456789012345678");
 const response=await a.call("POST",{},u);
 assert.equal(response.status,200);
 const joined=await response.json();
 assert.equal(joined.joined,true);
 assert.equal(joined.round.participants,1);
 assert.equal(joined.round.endsAt-joined.round.startedAt,42000);
 const duplicate=await (await a.call("POST",{},u)).json();
 assert.equal(duplicate.joined,false);
 assert.equal(duplicate.round.participants,1);
 const v=await a.login("123456789012345680");
 const second=await (await a.call("POST",{},v)).json();
 assert.equal(second.joined,true);
 assert.equal(second.round.id,joined.round.id);
 assert.equal(second.round.participants,2);
 const publicState=await (await a.call()).json();
 assert.equal(publicState.round.participants,2);
 assert.equal(JSON.stringify(publicState).includes("123456789012345678"),false);
 assert.equal(JSON.stringify(publicState).includes("123456789012345680"),false);
 a.env.DB.db.prepare("UPDATE cheers_rounds SET ends_at=?").run(Date.now()-1);
 assert.equal((await (await a.call()).json()).round,null);
 const renewed=await (await a.call("POST",{},u)).json();
 assert.notEqual(renewed.round.id,joined.round.id);
 assert.equal(renewed.round.participants,1);
});
test("Cheers rejects invalid origins, CSRF, extra fields and methods",async()=>{
 const a=make(),u=await a.login("123456789012345679");
 const foreign=await a.call("POST",{},u,{Origin:"https://bad.invalid"});
 assert.equal(foreign.status,403);
 const csrf=await a.call("POST",{},u,{"X-CSRF-Token":"wrong"});
 assert.equal(csrf.status,403);
 const extra=await a.call("POST",{score:999},u);
 assert.equal(extra.status,400);
 assert.equal((await extra.json()).error.code,"unexpected_field");
 assert.equal((await a.call("DELETE")).status,405);
 assert.equal(a.env.DB.db.prepare("SELECT COUNT(*) AS n FROM cheers_participants").get().n,0);
});

test("First signed-in Cheers automatically adds only missing schema to existing D1",async()=>{
  const a=make(true),db=a.env.DB.db;
  const before=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cheers_rounds'").get();
  assert.equal(before,undefined);
  const initial=await (await a.call()).json();
  assert.equal(initial.round,null);
  assert.equal(initial.setupPending,true);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cheers_rounds'").get(),undefined,
    "anonymous reads must never run production schema updates");
  assert.equal((await a.call("POST",{})).status,401);
  const signedIn=await a.login("123456789012345789");
  assert.equal((await a.call("POST",{},signedIn,{Origin:"https://forged.invalid"})).status,403);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cheers_rounds'").get(),undefined,
    "unauthenticated or invalid-origin requests must not install new tables");
  const first=await a.call("POST",{},signedIn);
  assert.equal(first.status,200);
  const firstResult=await first.json();
  assert.equal(firstResult.joined,true);
  assert.equal(firstResult.round.participants,1);
  assert.equal(firstResult.setupPending,false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cheers_rounds").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,1);
  assert.equal((await (await a.call()).json()).setupPending,false);
  const duplicate=await (await a.call("POST",{},signedIn)).json();
  assert.equal(duplicate.joined,false);
  assert.equal(duplicate.round.participants,1);
});


test("Spark Relay's server awards a unique beat only once and values genuine player handoffs", async()=>{
  const a=make();
  const first=await a.login("123456789012345701");
  const second=await a.login("123456789012345702");
  const joined=await (await a.call("POST",{},first)).json();
  const roundId=joined.round.id;
  assert.equal(joined.rules.beatCount,10);
  assert.equal(joined.rules.durationMs,42000);
  assert.equal(joined.round.teamScore,0);
  assert.equal(joined.round.maxCombo,0);
  await a.call("POST",{},second);
  const sql=a.env.DB.db.prepare("UPDATE cheers_rounds SET started_at=?,ends_at=? WHERE id=?");
  const beat0=Date.now()-3000;
  sql.run(beat0,beat0+42000,roundId);
  const shot=await a.call("POST",{roundId,beat:0},first,{},"/api/cheers/spark");
  assert.equal(shot.status,200);
  const hit=await shot.json();
  assert.equal(hit.captured,true);
  assert.equal(hit.awarded,150);
  assert.equal(hit.round.teamScore,150);
  assert.equal(hit.round.hits.length,1);
  assert.deepEqual(hit.round.hits[0],{beat:0,points:150});
  const duplicate=await (await a.call("POST",{roundId,beat:0},first,{},"/api/cheers/spark")).json();
  assert.equal(duplicate.captured,false);
  assert.equal(duplicate.awarded,0);
  const secondAttempt=await (await a.call("POST",{roundId,beat:0},second,{},"/api/cheers/spark")).json();
  assert.equal(secondAttempt.captured,false);
  sql.run(Date.now()-6800,Date.now()-6800+42000,roundId);
  const pass=await (await a.call("POST",{roundId,beat:1},second,{},"/api/cheers/spark")).json();
  assert.equal(pass.captured,true);
  assert.equal(pass.awarded,190,"a different user on the consecutive beat earns +40 relay points");
  assert.equal(pass.round.teamScore,340);
  assert.equal(pass.round.maxCombo,2);
  assert.equal(pass.round.participants,2);
  const publicBoard=await (await a.call()).json();
  assert.equal(publicBoard.round.hits.length,2);
  assert.equal(publicBoard.round.teamScore,340);
  assert.equal(publicBoard.bestScore,340);
  assert.equal(JSON.stringify(publicBoard).includes("123456789012345701"),false);
  assert.equal(JSON.stringify(publicBoard).includes("123456789012345702"),false);
});
test("Spark Relay enforces login, CSRF, round membership, time window and input validation",async()=>{
  const a=make();
  const first=await a.login("123456789012345703");
  const stranger=await a.login("123456789012345704");
  const round=(await (await a.call("POST",{},first)).json()).round;
  const id=round.id,path="/api/cheers/spark";
  assert.equal((await a.call("POST",{roundId:id,beat:0},null,{},path)).status,401);
  assert.equal((await a.call("POST",{roundId:id,beat:0},stranger,{},path)).status,403);
  assert.equal((await a.call("POST",{roundId:id,beat:0},first,{Origin:"https://evil.invalid"},path)).status,403);
  assert.equal((await a.call("POST",{roundId:id,beat:0},first,{"X-CSRF-Token":"bad"},path)).status,403);
  for(const invalid of [{roundId:id,beat:99},{roundId:id,beat:0,score:999},{roundId:"1",beat:0}]){
    assert.equal((await a.call("POST",invalid,first,{},path)).status,400);
  }
  assert.equal((await a.call("GET",undefined,first,{},path)).status,405);
  assert.equal((await a.call("POST",{roundId:id,beat:8},first,{},path)).status,409);
  assert.equal(a.env.DB.db.prepare("SELECT COUNT(*) AS c FROM cheers_sparks").get().c,0);
  a.env.DB.db.prepare("UPDATE cheers_rounds SET started_at=?, ends_at=? WHERE id=?")
    .run(Date.now()-45000,Date.now()-3000,id);
  assert.equal((await a.call("POST",{roundId:id,beat:0},first,{},path)).status,409);
});
test("Spark Relay bootstraps the scoreboard only after an authorized first join",async()=>{
  const a=make(true);
  const db=a.env.DB.db;
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='cheers_sparks'").get(),undefined);
  const guest=await (await a.call()).json();
  assert.equal(guest.gameReady,false);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='cheers_sparks'").get(),undefined);
  const first=await a.login("123456789012345705");
  await a.call("POST",{},first);
  const ready=await (await a.call()).json();
  assert.equal(ready.gameReady,true);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='cheers_sparks'").get());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,1);
});

test("Live lobby shows only consented recent participants, ages out and protects identity",async()=>{
  const a=make(),u=await a.login("123456789012345750"),v=await a.login("123456789012345751");
  const path="/api/cheers/presence";
  const publicStart=await (await a.call()).json();
  assert.equal(publicStart.onlinePlayers,0);
  assert.equal(publicStart.lookingPlayers,0);
  assert.equal((await a.call("POST",{online:true,looking:true},null,{},path)).status,401);
  assert.equal((await a.call("POST",{online:true,looking:true},u,{Origin:"https://phishing.invalid"},path)).status,403);
  assert.equal((await a.call("POST",{online:false,looking:true},u,{},path)).status,400);
  assert.equal((await a.call("POST",{online:true,looking:true,spoofedId:"123"},u,{},path)).status,400);
  assert.equal((await a.call("GET",undefined,u,{},path)).status,405);
  assert.equal((await a.call("POST",{online:true,looking:true},u,{},path)).status,200);
  assert.equal((await a.call("POST",{online:true,looking:false},v,{},path)).status,200);
  const online=await (await a.call()).json();
  assert.equal(online.onlinePlayers,2);
  assert.equal(online.lookingPlayers,1);
  assert.equal(JSON.stringify(online).includes("123456789012345750"),false);
  await a.call("POST",{online:false,looking:false},u,{},path);
  const after=await (await a.call()).json();
  assert.equal(after.onlinePlayers,1);
  assert.equal(after.lookingPlayers,0);
  a.env.DB.db.prepare("UPDATE cheers_presence SET expires_at=?").run(Date.now()-1000);
  assert.equal((await (await a.call()).json()).onlinePlayers,0);
});
test("Spark Relay is harder and irregular, but still server-scored",async()=>{
  const a=make(),player=await a.login("123456789012345755");
  const rules=(await (await a.call()).json()).rules;
  assert.equal(rules.hitWindowMs,550);
  assert.equal(rules.beatOffsetsMs.length,10);
  const gaps=rules.beatOffsetsMs.slice(1).map((x,i)=>x-rules.beatOffsetsMs[i]);
  assert.ok(new Set(gaps).size>=4,"beats must change cadence");
  const join=await (await a.call("POST",{},player)).json();
  const round=join.round,db=a.env.DB.db;
  db.prepare("UPDATE cheers_rounds SET started_at=?,ends_at=? WHERE id=?")
    .run(Date.now()-3900,Date.now()-3900+42000,round.id);
  assert.equal((await a.call("POST",{roundId:round.id,beat:0},player,{},"/api/cheers/spark")).status,409,
    "900ms after the target cannot score as before");
});
