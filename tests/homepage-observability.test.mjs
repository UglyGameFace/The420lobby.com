import test from "node:test";
import assert from "node:assert/strict";
import {errorResponse} from "../functions/_lib/http.mjs";

test("unexpected API failures are diagnosable without leaking browser secrets into logs",()=>{
  const log=[], saved=console.error;
  const secret="DISCORD_AUTH_CODE_PRIVATE_SAMPLE";
  console.error=(...args)=>log.push(args);
  try{
    const req=new Request("https://the420lobby.com/auth/callback?code="+secret,
      {headers:{"Cookie":"__Host-420_session=PRIVATE_SESSION","CF-Ray":"83920abc-US"}});
    const response=errorResponse(new Error("SQL contains "+secret),req);
    assert.equal(response.status,503);
    assert.equal(response.headers.get("Cache-Control"),"no-store");
  } finally {console.error=saved}
  assert.equal(log.length,1);
  assert.equal(log[0][0],"Arcade request failed");
  assert.deepEqual(log[0][1],{route:"/auth/callback",method:"GET",kind:"Error",ray:"83920abc-US"});
  assert.doesNotMatch(JSON.stringify(log),/PRIVATE|DISCORD_AUTH|SQL contains|__Host/);
});

test("run IDs and arbitrary URLs are never stored in error telemetry",()=>{
  const logs=[],saved=console.error;
  console.error=(...args)=>logs.push(args);
  try{
    errorResponse(new TypeError("secret1"),new Request("https://the420lobby.com/api/arcade-v2/runs/USER_IDENTIFYING_RUN/finish"));
    errorResponse(new Error("secret2"),new Request("https://the420lobby.com/something/private-identifier"));
  }finally{console.error=saved}
  assert.equal(logs[0][1].route,"/api/arcade-v2/runs/:id/finish");
  assert.equal(logs[1][1].route,"/other");
  assert.doesNotMatch(JSON.stringify(logs),/USER_IDENTIFYING_RUN|private-identifier|secret1|secret2/);
});
