import assert from "node:assert/strict";
import {createHmac, randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {handleTDLVoteWebhook, signedTDLRequest, LOBBY_GUILD_ID} from "../functions/_lib/tdl-vote-webhook.mjs";
import {handleRequest} from "../functions/_lib/app.mjs";

const SECRET = "tdl-signed-endpoint-test-secret-no-production";
const NOW = 1794949500000;

function event(overrides = {}) {
  return {
    id: randomUUID(), event: "listing.upvoted", created_at: new Date(NOW).toISOString(),
    listing: {id: LOBBY_GUILD_ID, type: "server", name: "The 420 Lobby"},
    data: {user: {id: "123456789098765432", username: "example"}},
    ...overrides,
  };
}
function signed(payload = event(), options = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const when = options.when ?? Math.floor(NOW / 1000);
  const signature = createHmac("sha256", options.secret ?? SECRET)
    .update(String(when) + "." + body).digest("hex");
  return new Request("https://the420lobby.com/api/tdl/vote-webhook", {
    method: "POST", headers: {
      "Content-Type": "application/json",
      "X-TDL-Signature": `t=${when},v1=${signature}`,
      "X-TDL-Delivery": options.delivery ?? randomUUID(),
    }, body,
  });
}

function fakeDb() {
  const items = new Map();
  const calls = [];
  return {
    items, calls,
    prepare(query) {
      assert.match(query, /INSERT OR IGNORE INTO tdl_vote_receipts/);
      return {bind(deliveryId, listingId, receivedAt) {
        return {async run() {
          calls.push({deliveryId, listingId, receivedAt});
          if (items.has(deliveryId)) return {meta: {changes: 0}};
          items.set(deliveryId, {listingId, receivedAt});
          return {meta: {changes: 1}};
        }};
      }};
    },
  };
}

test("TDL signed delivery is stored once and does not retain voter identity", async () => {
  const db = fakeDb();
  const delivery = randomUUID();
  const first = await handleTDLVoteWebhook(signed(event(), {delivery}), {DB: db, TDL_WEBHOOK_SECRET: SECRET}, NOW);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {received: true, duplicate: false});
  const second = await handleTDLVoteWebhook(signed(event(), {delivery}), {DB: db, TDL_WEBHOOK_SECRET: SECRET}, NOW);
  assert.deepEqual(await second.json(), {received: true, duplicate: true});
  assert.equal(db.items.size, 1);
  assert.equal(db.calls[0].listingId, LOBBY_GUILD_ID);
  assert.equal(JSON.stringify([...db.items.values()]).includes("123456789098765432"), false);
});

test("TDL API route works on main site and rejects unsigned requests", async () => {
  const db = fakeDb();
  const env = {DB: db, TDL_WEBHOOK_SECRET: SECRET, SITE_ORIGIN: "https://the420lobby.com"};
  const context = {request: signed(), env, next: async () => new Response("static")};
  const accepted = await handleRequest(context);
  assert.equal(accepted.status, 200);
  assert.equal(db.items.size, 1);
  const unauth = await handleRequest({...context,
    request: new Request("https://the420lobby.com/api/tdl/vote-webhook", {
      method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(event()),
    }),
  });
  assert.equal(unauth.status, 401);
  assert.equal(db.items.size, 1);
  const wrongMethod = await handleRequest({...context,
    request: new Request("https://the420lobby.com/api/tdl/vote-webhook", {method: "GET"}),
  });
  assert.equal(wrongMethod.status, 405);
});

test("TDL webhook.ping acknowledges but never increments vote tally", async () => {
  const db = fakeDb();
  const ping = await handleTDLVoteWebhook(signed({event:"webhook.ping"}), {DB: db, TDL_WEBHOOK_SECRET: SECRET}, NOW);
  assert.deepEqual(await ping.json(), {received: true, ping: true});
  assert.equal(db.items.size, 0);
});

test("TDL never accepts wrong listing, wrong type, or non-upvote events", async () => {
  const invalid = [
    event({listing: {id:"1514374173517152419", type:"server"}}),
    event({listing: {id:LOBBY_GUILD_ID, type:"bot"}}),
    event({event:"listing.bumped"}),
    event({data:{user: null}}),
    event({data:{user:{}}}),
  ];
  for (const bad of invalid) {
    await assert.rejects(signedTDLRequest(signed(bad), SECRET, NOW),
      {status: 422, code: "unexpected_vote_event"});
  }
});

test("TDL signatures are enforced over raw bytes with freshness and secret checks", async () => {
  const base = event();
  await assert.rejects(signedTDLRequest(signed(base, {secret:"wrong-secret-but-long-enough"}), SECRET, NOW),
    {status: 401, code:"invalid_vote_signature"});
  await assert.rejects(signedTDLRequest(signed(base, {when: Math.floor(NOW/1000) - 301}), SECRET, NOW),
    {status: 401, code:"expired_vote_signature"});
  await assert.rejects(signedTDLRequest(signed(base), "", NOW),
    {status: 503, code:"vote_webhook_unconfigured"});
  const req = signed(base);
  req.headers.set("X-TDL-Delivery", "not-a-uuid");
  await assert.rejects(signedTDLRequest(req, SECRET, NOW),
    {status:401, code:"invalid_vote_signature"});
  // Re-encoding JSON changes the signature bytes and must not be trusted.
  const original = JSON.stringify(base);
  const formatted = JSON.stringify(base, null, 2);
  const tampered = signed(original);
  const badSignature = tampered.headers.get("X-TDL-Signature");
  const changedBody = new Request(tampered.url, {
    method:"POST",
    headers: {...Object.fromEntries(tampered.headers), "X-TDL-Signature": badSignature},
    body:formatted,
  });
  await assert.rejects(signedTDLRequest(changedBody, SECRET, NOW),
    {status:401, code:"invalid_vote_signature"});
});

test("TDL oversized payload and unavailable storage fail safely", async () => {
  const huge = signed(JSON.stringify({...event(), extra:"x".repeat(40000)}));
  await assert.rejects(signedTDLRequest(huge, SECRET, NOW),
    {status:413, code:"payload_too_large"});
  await assert.rejects(handleTDLVoteWebhook(signed(), {TDL_WEBHOOK_SECRET: SECRET}, NOW),
    {status:503, code:"vote_store_unavailable"});
});

test("TDL additive migration provides a unique delivery id", () => {
  const migration = readFileSync(new URL("../migrations/0005_tdl_vote_receipts.sql", import.meta.url), "utf8");
  assert.match(migration, /delivery_id TEXT PRIMARY KEY/);
  assert.doesNotMatch(migration, /user_id|token|raw_payload/);
});
