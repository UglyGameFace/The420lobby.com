import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handleRequest} from "../functions/_lib/app.mjs";
import {hash,randomToken,SESSION_COOKIE} from "../functions/_lib/auth.mjs";

class D1 {
  constructor(){
    this.db=new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys=ON");
    for(const migration of ["0001_arcade.sql","0002_cheers.sql"])
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
const make=()=>{
  const env={DB:new D1(),SITE_ORIGIN:origin,DISCORD_CLIENT_ID:"123456789012345678",DISCORD_CLIENT_SECRET:"test-only-value"};
  return {
    env,
    async login(id){
      const token=randomToken(),now=Date.now();
      await env.DB.prepare("INSERT INTO users(id,username,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id,"test_user","https://cdn.discordapp.com/embed/avatars/0.png",now,now).run();
      await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)").bind(await hash(token),id,now,now+1000000).run();
      return {token,csrf:await hash("csrf:"+token)};
    },
    async call(method="GET",body,auth,headers={}){
      const h=new Headers(headers);
      if(auth){h.set("Cookie",SESSION_COOKIE+"="+auth.token);if(!h.has("X-CSRF-Token"))h.set("X-CSRF-Token",auth.csrf);}
      if(method==="POST"){h.set("Content-Type","application/json");if(!h.has("Origin"))h.set("Origin",origin);}
      return handleRequest({request:new Request(origin+"/api/cheers",{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env,next:()=>new Response("not a static route")});
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
