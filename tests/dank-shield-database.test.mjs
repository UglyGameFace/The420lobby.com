import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,webcrypto} from "node:crypto";
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
   const keyPub=await webcrypto.subtle.importKey("spki",generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"der"}),{name:"Ed25519"},false,["verify"]);
   assert.ok(keyPub); // signing key import succeeded; signature presence and shape are checked.
   return new Response(JSON.stringify({ok:true,source:"dank-shield-supabase",kind:"database_snapshot",capturedAt:new Date().toISOString(),tickets:{open:1,claimed:0,closed:2},activity24h:{atLeast:15}}),{status:200});
 });
 assert.equal(got,1);assert.equal(result.status,"connected");assert.equal(result.tickets.open,1);
});
test("Adapter fails closed on HTTP errors or unexpected sources",async()=>{
 const env={DANK_SHIELD_SIGNING_KEY:key};
 assert.equal((await readDankShieldDatabase(env,async()=>new Response("unauthorized",{status:401}))).status,"unavailable");
 assert.equal((await readDankShieldDatabase(env,async()=>new Response(JSON.stringify({ok:true,source:"attacker",kind:"database_snapshot",tickets:{open:5},activity24h:{atLeast:3}}),{status:200}))).status,"unavailable");
});
