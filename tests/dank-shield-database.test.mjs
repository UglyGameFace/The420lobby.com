import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createPublicKey,webcrypto} from "node:crypto";
import {readDankShieldDatabase} from "../functions/_lib/dank-shield-database.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const priv=generateKeyPairSync("ed25519").privateKey;
const key=priv.export({type:"pkcs8",format:"der"}).toString("base64url");
test("Adapter refuses missing key and never makes unsigned fetch",async()=>{
 let invoked=0;
 const result=await readDankShieldDatabase({},async()=>{invoked++;throw Error("must not fetch")});
 assert.equal(result.status,"not_configured");assert.equal(invoked,0);
});
test("Adapter signs exact request and validates an aggregate-only response",async()=>{
 let got=0;
 const result=await readDankShieldDatabase({DANK_SHIELD_SIGNING_KEY:key},async(url,options)=>{
   got++;assert.equal(url,"https://viamriafkbqhquvrsnua.supabase.co/functions/v1/shield-aggregate-status");
   assert.equal(options.method,"GET");
   const ts=options.headers["x-shield-timestamp"],nonce=options.headers["x-shield-nonce"],sig=options.headers["x-shield-signature"];
   assert.match(ts,/^\d{13}$/);assert.match(nonce,/^[a-f0-9]{32}$/);assert.match(sig,/^[A-Za-z0-9_-]{86}$/);
   const keyPub=await webcrypto.subtle.importKey("spki",createPublicKey(priv).export({type:"spki",format:"der"}),{name:"Ed25519"},false,["verify"]);
   const bytes=Buffer.from(sig,"base64url");
   const payload=new TextEncoder().encode("GET\n/shield-aggregate-status\n"+ts+"\n"+nonce);
   assert.equal(await webcrypto.subtle.verify("Ed25519",keyPub,bytes,payload),true);
   assert.equal(await webcrypto.subtle.verify("Ed25519",keyPub,bytes,new TextEncoder().encode("tampered")),false);
   return new Response(JSON.stringify({ok:true,source:"dank-shield-supabase",kind:"database_snapshot",capturedAt:new Date().toISOString(),tickets:{open:1,claimed:0,closed:2},activity24h:{atLeast:15},runtime:{status:"heartbeat_recent",lastSeenAt:new Date().toISOString(),guildCount:10}}),{status:200});
 });
 assert.equal(got,1);assert.equal(result.status,"connected");assert.equal(result.tickets.open,1);assert.equal(result.runtime.status,"heartbeat_recent");
});
test("Adapter fails closed on HTTP errors or unexpected sources",async()=>{
 const env={DANK_SHIELD_SIGNING_KEY:key};
 assert.equal((await readDankShieldDatabase(env,async()=>new Response("unauthorized",{status:401}))).status,"unavailable");
 assert.equal((await readDankShieldDatabase(env,async()=>new Response(JSON.stringify({ok:true,source:"attacker",kind:"database_snapshot",tickets:{open:5},activity24h:{atLeast:3}}),{status:200}))).status,"unavailable");
});

test("Adapter reports HTTP, timeout and invalid payload separately without exposing secrets",async()=>{
 const env={DANK_SHIELD_SIGNING_KEY:key};
 assert.equal((await readDankShieldDatabase(env,async()=>new Response("denied",{status:401}))).reason,"upstream_http_401");
 assert.equal((await readDankShieldDatabase(env,async()=>new Response("error",{status:503}))).reason,"upstream_http_503");
 assert.equal((await readDankShieldDatabase(env,async()=>new Response("not-json",{status:200}))).reason,"unreadable_response");
 assert.equal((await readDankShieldDatabase(env,async()=>{const e=new Error("timed out");e.name="TimeoutError";throw e})).reason,"timeout");
});
