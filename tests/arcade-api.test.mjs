import { test } from "node:test";
import assert from "node:assert/strict";
import { arcadeRequest, startAuthenticatedRun, saveAuthenticatedRun } from "../arcade-api.js";

function mockFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => { globalThis.fetch = original; });
}
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{"Content-Type":"application/json"}});

test("expired and guest sessions cannot create a game run", async t => {
  const calls = [];
  mockFetch(t, async (path, options) => {
    calls.push({path, options});
    return json({configured:true,user:null,csrfToken:null});
  });
  await assert.rejects(startAuthenticatedRun("sesh-signal"), error => error.code === "login_required" && error.status === 401);
  assert.deepEqual(calls.map(call => call.path), ["/api/session"]);
});

test("an unavailable backend cannot silently fall back to anonymous play", async t => {
  mockFetch(t, async () => json({configured:false,user:null,csrfToken:null}));
  await assert.rejects(startAuthenticatedRun("bong-blitz"), error => error.code === "not_configured");
});

test("each round refreshes authentication and sends the session CSRF value", async t => {
  const calls = [];
  mockFetch(t, async (path, options) => {
    calls.push({path, options});
    if (path === "/api/session") return json({configured:true,user:{id:"discord-player"},csrfToken:"session-csrf"});
    return json({id:"run-123",game:"green-room-match",seed:"server-seed"});
  });
  const {run, session} = await startAuthenticatedRun("green-room-match");
  assert.equal(run.id, "run-123");
  assert.equal(session.user.id, "discord-player");
  assert.deepEqual(calls.map(call => call.path), ["/api/session", "/api/runs"]);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["X-CSRF-Token"], "session-csrf");
  assert.equal(calls[1].options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[1].options.body), {game:"green-room-match"});
});

test("leaderboard submissions contain input events and timing, never a trusted score", async t => {
  let submission;
  mockFetch(t, async (path, options) => {
    submission = {path, options};
    return json({score:42,verified:true});
  });
  const events = [{type:"tap",at:500}];
  await saveAuthenticatedRun({id:"run-123"}, {csrfToken:"session-csrf"}, events, 30000);
  assert.equal(submission.path, "/api/runs/run-123/finish");
  assert.equal(submission.options.headers["X-CSRF-Token"], "session-csrf");
  assert.deepEqual(JSON.parse(submission.options.body), {events,elapsedMs:30000});
  assert.equal(submission.options.credentials, "same-origin");
});

test("server rejection and malformed responses become actionable request errors", async t => {
  mockFetch(t, async () => json({error:{code:"invalid_run",message:"Round expired."}}, 409));
  await assert.rejects(arcadeRequest("/api/runs/expired/finish", {body:{events:[]}}), error => error.code === "invalid_run" && error.message === "Round expired.");
  globalThis.fetch = async () => new Response("<html>Offline</html>", {status:503});
  await assert.rejects(arcadeRequest("/api/session"), error => error.code === "server_unavailable");
});
