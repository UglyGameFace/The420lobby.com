import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handleRequest} from "../functions/_lib/app.mjs";
import {discordIdentity, hash, randomToken, SESSION_COOKIE, OAUTH_COOKIE} from "../functions/_lib/auth.mjs";
import {createGame} from "../shared/arcade-rules.mjs";

// Exercise the actual D1 SQL against SQLite, including transactions, unique
// constraints, windows, RETURNING, and ON CONFLICT. No real OAuth or network.
class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec(readFileSync(new URL("../migrations/0001_arcade.sql", import.meta.url), "utf8"));
    this.batchQueue = Promise.resolve();
  }
  prepare(sql) {
    const sqlite = this.sqlite;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() { return sqlite.prepare(sql).get(...this.values) || null; },
      async all() { return {results: sqlite.prepare(sql).all(...this.values), success: true}; },
      async run() { const result = sqlite.prepare(sql).run(...this.values); return {success: true, meta: {changes: Number(result.changes)}}; }
    };
  }
  batch(statements) {
    const result = this.batchQueue.then(async () => {
      this.sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        this.sqlite.exec("COMMIT");
        return results;
      } catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
    });
    this.batchQueue = result.catch(() => {});
    return result;
  }
}

function fixture() {
  const env = {DB: new TestD1(), SITE_ORIGIN: "https://arcade.test", DISCORD_CLIENT_ID: "123456789012345678", DISCORD_CLIENT_SECRET: "test-server-only-secret"};
  return {
    env,
    async request(path, {method = "GET", body, rawBody, headers = {}, session, fetcher, next, origin = env.SITE_ORIGIN} = {}) {
      const requestHeaders = new Headers(headers);
      if (session) requestHeaders.set("Cookie", `${SESSION_COOKIE}=${session.token}`);
      if (method !== "GET" && method !== "HEAD") {
        if (!requestHeaders.has("Origin")) requestHeaders.set("Origin", origin);
        if (session?.csrf && !requestHeaders.has("X-CSRF-Token")) requestHeaders.set("X-CSRF-Token", session.csrf);
      }
      if (body !== undefined && !requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
      const request = new Request(`${origin}${path}`, {method, headers: requestHeaders, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))});
      return handleRequest({request, env, next: next || (() => new Response("game module"))}, {fetcher});
    },
    async login(id = "123456789012345679", username = "lobby_friend") {
      const token = randomToken(), now = Date.now();
      await env.DB.prepare("INSERT INTO users (id, username, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, username, "https://cdn.discordapp.com/embed/avatars/0.png", now, now).run();
      await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await hash(token), id, now, now + 604800000).run();
      return {token, csrf: await hash(`csrf:${token}`), id};
    }
  };
}

const data = response => response.json();
const errorCode = async response => (await data(response)).error.code;
const oauthBrowserCookie = response => response.headers.getSetCookie().find(value => value.startsWith(`${OAUTH_COOKIE}=`)).split(";")[0];

test("unconfigured backend fails closed and session endpoint contains no secret", async () => {
  const app = fixture(); delete app.env.DISCORD_CLIENT_SECRET;
  const response = await app.request("/api/session");
  assert.deepEqual(await data(response), {user: null, csrfToken: null, configured: false});
  for (const path of ["/auth/discord", "/sesh-signal.js", "/arcade-games.js"]) {
    const result = await app.request(path);
    assert.equal(result.status, 503);
    assert.equal(await errorCode(result), "setup_required");
  }
});

test("Discord state is browser-bound, single-use, and exchanged only on the server", async () => {
  const app = fixture(), begin = await app.request("/auth/discord");
  assert.equal(begin.status, 302);
  const authorize = new URL(begin.headers.get("Location"));
  assert.equal(authorize.origin, "https://discord.com");
  assert.equal(authorize.searchParams.get("scope"), "identify");
  assert.equal(authorize.searchParams.get("redirect_uri"), "https://arcade.test/auth/callback");
  assert.equal(authorize.searchParams.has("client_secret"), false);
  const state = authorize.searchParams.get("state"), browser = oauthBrowserCookie(begin);
  assert.match(begin.headers.getSetCookie()[0], /HttpOnly; Secure; SameSite=Lax/);
  const persisted = app.env.DB.sqlite.prepare("SELECT * FROM oauth_states").get();
  assert.notEqual(persisted.state_hash, state);
  assert.notEqual(persisted.browser_hash, browser.split("=")[1]);
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    if (url.endsWith("/oauth2/token")) {
      assert.equal(options.body.get("client_secret"), "test-server-only-secret");
      assert.equal(options.body.get("code"), "authorization-code");
      return Response.json({access_token: "secret-discord-access-token", token_type: "Bearer"});
    }
    assert.equal(options.headers.Authorization, "Bearer secret-discord-access-token");
    return Response.json({id: "123456789012345679", username: "lobby_friend", avatar: "abc123abc123abc123abc123abc123ab"});
  };
  const mismatch = await app.request(`/auth/callback?state=${state}&code=authorization-code`, {fetcher});
  assert.match(mismatch.headers.get("Location"), /auth=expired$/);
  assert.equal(calls, 0);
  const callback = await app.request(`/auth/callback?state=${state}&code=authorization-code`, {headers: {Cookie: browser}, fetcher});
  assert.equal(callback.headers.get("Location"), "https://arcade.test/arcade.html");
  assert.equal(calls, 2);
  const sessionCookie = callback.headers.getSetCookie().find(value => value.startsWith(`${SESSION_COOKIE}=`));
  assert.match(sessionCookie, /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800/);
  const rawToken = sessionCookie.split(";")[0].split("=")[1];
  const stored = app.env.DB.sqlite.prepare("SELECT * FROM sessions").get();
  assert.notEqual(stored.token_hash, rawToken);
  assert.equal(stored.token_hash, await hash(rawToken));
  const sessionResponse = await app.request("/api/session", {headers: {Cookie: sessionCookie.split(";")[0]}});
  const sessionText = await sessionResponse.text();
  assert.equal(sessionText.includes("secret-discord-access-token"), false);
  assert.equal(sessionText.includes("test-server-only-secret"), false);
  assert.equal(sessionText.includes(rawToken), false);
  assert.equal(JSON.parse(sessionText).user.username, "lobby_friend");
  const replay = await app.request(`/auth/callback?state=${state}&code=authorization-code`, {headers: {Cookie: browser}, fetcher});
  assert.match(replay.headers.get("Location"), /auth=expired$/);
  assert.equal(calls, 2);
});

test("OAuth expired and denied callbacks never create a session", async () => {
  const app = fixture(), begin = await app.request("/auth/discord");
  const state = new URL(begin.headers.get("Location")).searchParams.get("state");
  const result = await app.request(`/auth/callback?state=${state}&error=access_denied`, {headers: {Cookie: oauthBrowserCookie(begin)}, fetcher: () => { throw new Error("must not fetch"); }});
  assert.match(result.headers.get("Location"), /auth=cancelled$/);
  assert.equal(app.env.DB.sqlite.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
  const second = await app.request("/auth/discord");
  app.env.DB.sqlite.prepare("UPDATE oauth_states SET expires_at = 0").run();
  const expired = await app.request(`/auth/callback?state=${new URL(second.headers.get("Location")).searchParams.get("state")}&code=expired`, {headers: {Cookie: oauthBrowserCookie(second)}});
  assert.match(expired.headers.get("Location"), /auth=expired$/);
});

test("session expires, protected assets reject visitors, and logout requires Origin and CSRF", async () => {
  const app = fixture(), session = await app.login();
  assert.equal((await app.request("/sesh-signal.js")).status, 401);
  const asset = await app.request("/arcade-games.js", {session});
  assert.equal(await asset.text(), "game module");
  assert.equal(asset.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await app.request("/auth/logout", {method: "GET", session})).status, 405);
  const badOrigin = await app.request("/auth/logout", {method: "POST", session, headers: {Origin: "https://attacker.test"}});
  assert.equal(await errorCode(badOrigin), "invalid_origin");
  const badCsrf = await app.request("/auth/logout", {method: "POST", session, headers: {"X-CSRF-Token": "wrong"}});
  assert.equal(await errorCode(badCsrf), "invalid_csrf");
  const logout = await app.request("/auth/logout", {method: "POST", session});
  assert.deepEqual(await data(logout), {ok: true});
  assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0$/);
  assert.equal((await data(await app.request("/api/session", {session}))).user, null);
  const expiredSession = await app.login("123456789012345680");
  app.env.DB.sqlite.prepare("UPDATE sessions SET expires_at = 0").run();
  assert.equal((await app.request("/api/profile", {session: expiredSession})).status, 401);
});

test("Discord usernames are bounded and avatar URLs only use Discord CDN", () => {
  const user = discordIdentity({id: "123456789012345679", username: "\u202ehi\n" + "x".repeat(100), avatar: "https://attacker.test/tracker"});
  assert.equal(user.username.length, 80);
  assert.equal(user.username.includes("\n"), false);
  assert.match(user.avatarUrl, /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
  assert.throws(() => discordIdentity({id: "not-a-discord-id", username: "friend"}));
});

test("ranked runs verify replay, persist one score, update profile, and reject changed resubmission", async () => {
  const app = fixture(), session = await app.login(), originalNow = Date.now;
  let now = originalNow(); Date.now = () => now;
  try {
    const started = await app.request("/api/runs", {method: "POST", session, body: {game: "bong-blitz"}});
    assert.equal(started.status, 201);
    const run = await data(started), game = createGame(run.game, run.seed);
    const events = game.targets.map(target => ({type: "hit", id: target.id, at: target.sweetAt}));
    const premature = await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events, elapsedMs: 30000}});
    assert.equal(premature.status, 422);
    now += 30050;
    const finish = await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events, elapsedMs: 30000}});
    assert.equal(finish.status, 200);
    const result = await data(finish);
    assert.ok(result.score > 0);
    assert.ok(result.achievements.includes("first-spark"));
    assert.equal(result.isPersonalBest, true);
    assert.equal(result.best, result.score);
    const repeat = await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events, elapsedMs: 30000}});
    assert.deepEqual(await data(repeat), result);
    assert.equal(app.env.DB.sqlite.prepare("SELECT COUNT(*) n FROM scores").get().n, 1);
    const changed = await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events: [], elapsedMs: 30000}});
    assert.equal(changed.status, 409);
    const profile = await data(await app.request("/api/profile", {session}));
    assert.equal(profile.stats.runs, 1);
    assert.equal(profile.stats.totalScore, result.score);
    assert.equal(profile.bests[0].score, result.score);
    assert.ok(profile.achievements.some(item => item.id === "first-spark"));
    const board = await data(await app.request("/api/leaderboards?game=bong-blitz&period=all"));
    assert.equal(board.entries[0].user.id, session.id);
    assert.equal(board.entries[0].score, result.score);
    assert.equal(board.entries[0].rank, 1);
  } finally { Date.now = originalNow; }
});

test("run ownership, abandonment, expiry, and impossible events are enforced", async () => {
  const app = fixture(), session = await app.login(), stranger = await app.login("123456789012345680");
  const run = await data(await app.request("/api/runs", {method: "POST", session, body: {game: "sesh-signal"}}));
  const body = {events: [], elapsedMs: 42000};
  assert.equal((await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session: stranger, body})).status, 404);
  assert.equal((await app.request(`/api/runs/${run.id}/finish`, {method: "POST", body})).status, 401);
  const impossible = await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events: [{type: "catch", id: 999999, at: 1000}], elapsedMs: 42000}});
  assert.equal(impossible.status, 422);
  const second = await data(await app.request("/api/runs", {method: "POST", session, body: {game: "sesh-signal"}}));
  assert.equal((await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body})).status, 409);
  app.env.DB.sqlite.prepare("UPDATE game_runs SET expires_at = 0 WHERE id = ?").run(second.id);
  assert.equal((await app.request(`/api/runs/${second.id}/finish`, {method: "POST", session, body})).status, 410);
  assert.equal(app.env.DB.sqlite.prepare("SELECT COUNT(*) n FROM scores").get().n, 0);
});

test("writes bound bodies, reject client totals and unknown games, and rate-limit starts", async () => {
  const app = fixture(), session = await app.login();
  assert.equal((await app.request("/api/runs", {method: "POST", body: {game: "sesh-signal"}})).status, 401);
  assert.equal((await app.request("/api/runs", {method: "POST", session, body: {game: "invented"}})).status, 400);
  assert.equal((await app.request("/api/runs", {method: "POST", session, body: {game: "sesh-signal", score: 9999}})).status, 400);
  assert.equal((await app.request("/api/runs", {method: "POST", session, rawBody: "hello", headers: {"Content-Type": "text/plain"}})).status, 415);
  const run = await data(await app.request("/api/runs", {method: "POST", session, body: {game: "sesh-signal"}}));
  assert.equal((await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events: [], elapsedMs: 42000, score: 999999}})).status, 400);
  assert.equal((await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events: new Array(1001).fill(null), elapsedMs: 42000}})).status, 400);
  assert.equal((await app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, rawBody: "x".repeat(66000), headers: {"Content-Type": "application/json"}})).status, 413);
  for (let i = 1; i < 12; i++) assert.equal((await app.request("/api/runs", {method: "POST", session, body: {game: "sesh-signal"}})).status, 201);
  assert.equal((await app.request("/api/runs", {method: "POST", session, body: {game: "sesh-signal"}})).status, 429);
  assert.equal(app.env.DB.sqlite.prepare("SELECT COUNT(*) n FROM game_runs WHERE status = 'active'").get().n, 1);
});

test("competing valid finishes commit one result, and replacement during verification blocks a stale finish", async () => {
  const app = fixture(), session = await app.login(), originalNow = Date.now;
  let now = originalNow(); Date.now = () => now;
  try {
    const run = await data(await app.request("/api/runs", {method: "POST", session, body: {game: "bong-blitz"}}));
    const game = createGame(run.game, run.seed), events = game.targets.map(target => ({type: "hit", id: target.id, at: target.sweetAt}));
    now += 30050;
    const results = await Promise.all([
      app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events, elapsedMs: 30000}}),
      app.request(`/api/runs/${run.id}/finish`, {method: "POST", session, body: {events: [], elapsedMs: 30000}})
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(app.env.DB.sqlite.prepare("SELECT COUNT(*) n FROM scores").get().n, 1);
    const committed = app.env.DB.sqlite.prepare("SELECT result_json FROM game_runs WHERE id = ?").get(run.id);
    assert.equal(JSON.parse(committed.result_json).score, app.env.DB.sqlite.prepare("SELECT score FROM scores").get().score);

    const stale = await data(await app.request("/api/runs", {method: "POST", session, body: {game: "bong-blitz"}}));
    now += 30050;
    let release, observed;
    const paused = new Promise(resolve => { release = resolve; });
    const readObserved = new Promise(resolve => { observed = resolve; });
    const originalPrepare = app.env.DB.prepare.bind(app.env.DB);
    app.env.DB.prepare = sql => {
      const statement = originalPrepare(sql);
      if (sql === "SELECT * FROM game_runs WHERE id = ? AND user_id = ?") {
        const originalFirst = statement.first.bind(statement);
        statement.first = async () => { const row = await originalFirst(); observed(); await paused; return row; };
      }
      return statement;
    };
    const pendingFinish = app.request(`/api/runs/${stale.id}/finish`, {method: "POST", session, body: {events: [], elapsedMs: 30000}});
    await readObserved;
    assert.equal((await app.request("/api/runs", {method: "POST", session, body: {game: "sesh-signal"}})).status, 201);
    release();
    assert.equal((await pendingFinish).status, 409);
    assert.equal(app.env.DB.sqlite.prepare("SELECT COUNT(*) n FROM scores").get().n, 1);
    assert.equal(app.env.DB.sqlite.prepare("SELECT status FROM game_runs WHERE id = ?").get(stale.id).status, "abandoned");
  } finally { Date.now = originalNow; }
});

test("leaderboards retain one best per player, filter the rolling week, and use stable score ties", async () => {
  const app = fixture(), first = await app.login(), second = await app.login("123456789012345680", "second_friend"), now = Date.now();
  async function recorded(user, score, playedAt) {
    const id = randomToken();
    await app.env.DB.prepare("INSERT INTO game_runs (id, user_id, game, seed, rules_version, status, started_at, expires_at) VALUES (?, ?, 'sesh-signal', 'fixture', '1', 'finished', ?, ?)")
      .bind(id, user.id, playedAt - 42000, playedAt + 900000).run();
    await app.env.DB.prepare("INSERT INTO scores (run_id, user_id, game, score, played_at) VALUES (?, ?, 'sesh-signal', ?, ?)").bind(id, user.id, score, playedAt).run();
  }
  await recorded(first, 500, now - 8 * 86400000);
  await recorded(first, 100, now - 2000);
  await recorded(first, 300, now - 1000);
  await recorded(second, 300, now);
  const all = await data(await app.request("/api/leaderboards?game=sesh-signal&period=all"));
  assert.deepEqual(all.entries.map(entry => [entry.user.id, entry.score]), [[first.id, 500], [second.id, 300]]);
  const weekly = await data(await app.request("/api/leaderboards?game=sesh-signal&period=week"));
  assert.deepEqual(weekly.entries.map(entry => [entry.user.id, entry.score]), [[first.id, 300], [second.id, 300]]);
  assert.equal((await app.request("/api/leaderboards?game=unknown")).status, 400);
  assert.equal((await app.request("/api/leaderboards?period=year")).status, 400);
});


test("new arcade persists CSRF-authenticated scores, isolates classic records, and rejects replay tampering", async () => {
  const app = fixture(), owner = await app.login(), other = await app.login("123456789012345680", "second_friend"), originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    assert.equal((await app.request("/api/arcade-v2/runs", {method:"POST", body:{game:"bong-blitz"}})).status, 401);
    const csrf = await app.request("/api/arcade-v2/runs", {method:"POST", body:{game:"bong-blitz"},session:owner,headers:{"X-CSRF-Token":"bad"}});
    assert.equal(await errorCode(csrf),"invalid_csrf");
    assert.equal((await app.request("/api/arcade-v2/runs", {method:"POST",session:owner,body:{game:"unknown"}})).status,400);

    const started = await app.request("/api/arcade-v2/runs", {method:"POST",session:owner,body:{game:"bong-blitz"}});
    assert.equal(started.status,201);
    const run = await data(started);
    assert.equal(run.game,"bong-blitz");
    assert.ok(/^[A-Za-z0-9_-]{43}$/.test(run.id));
    assert.equal(app.env.DB.sqlite.prepare("SELECT rules_version FROM game_runs WHERE id=?").get(run.id).rules_version,"arcade-v2:1");

    const resultBody={score:520,elapsedMs:35000,difficulty:"Normal",stats:{perfectHits:3,niceHits:1,misses:4,accuracy:50,durationSeconds:35}};
    const path="/api/arcade-v2/runs/"+run.id+"/finish";
    assert.equal((await app.request(path,{method:"POST",session:other,body:resultBody})).status,404);
    assert.equal((await app.request(path,{method:"POST",session:owner,body:resultBody})).status,422,"premature finish accepted");
    now += 36000;
    const submitted=await app.request(path,{method:"POST",session:owner,body:resultBody});
    assert.equal(submitted.status,200);
    const saved=await data(submitted);
    assert.equal(saved.score,520);
    assert.equal(saved.verification,"discord-account-and-plausibility-only");
    assert.equal(saved.isPersonalBest,true);

    const replay=await app.request(path,{method:"POST",session:owner,body:resultBody});
    assert.deepEqual(await data(replay),saved,"idempotent submission changed result");
    assert.equal((await app.request(path,{method:"POST",session:owner,body:{...resultBody,score:999999}})).status,409);
    assert.equal(app.env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM scores WHERE run_id=?").get(run.id).n,1);

    const board=await data(await app.request("/api/arcade-v2/leaderboards?game=bong-blitz&period=all"));
    assert.equal(board.entries.length,1);
    assert.equal(board.entries[0].user.id,owner.id);
    assert.equal(board.entries[0].score,520);
    const profile=await data(await app.request("/api/arcade-v2/profile",{session:owner}));
    assert.equal(profile.stats.runs,1);
    assert.equal(profile.stats.totalScore,520);
    assert.equal(profile.bests[0].score,520);

    const classicBoard=await data(await app.request("/api/leaderboards?game=bong-blitz&period=all"));
    assert.equal(classicBoard.entries.length,0,"v2 scores leaked into classic leaderboard");
    const classicProfile=await data(await app.request("/api/profile",{session:owner}));
    assert.equal(classicProfile.stats.runs,0,"v2 scores leaked into classic profile");
    assert.equal(classicProfile.stats.totalScore,0);

    assert.equal((await app.request("/api/arcade-v2/leaderboards?game=invalid")).status,400);
    assert.equal((await app.request("/api/arcade-v2/leaderboards?period=year")).status,400);
  } finally {
    Date.now=originalNow;
  }
});


test("arcade subdomain uses the main OAuth callback with single-use browser-bound handoff and host-only cookies", async () => {
  const app = fixture(), primary = "https://the420lobby.com", arcade = "https://arcade.the420lobby.com";
  app.env.SITE_ORIGIN = primary;

  let requestedAsset = null;
  const home = await app.request("/", {origin:primary, next:request=>{
    requestedAsset=new URL(request?.url||primary+"/").pathname;
    return new Response("home-site");
  }});
  assert.equal(await home.text(),"home-site");
  assert.equal(requestedAsset,"/", "main website root was rewritten");

  app.env.ASSETS={fetch:async request=>{
    requestedAsset=new URL(request.url).pathname;
    // Cloudflare Pages redirects a direct .html asset fetch to its pretty URL.
    if (requestedAsset === "/arcade.html") return new Response(null, {status:308,headers:{Location:"/arcade"}});
    return new Response("new-react-arcade", {headers:{"Content-Type":"text/html"}});
  }};
  const lobby = await app.request("/", {origin:arcade,next:()=>{
    throw new Error("Arcade root should use the authoritative Pages ASSETS binding");
  }});
  assert.equal(lobby.status,200);
  assert.equal(await lobby.text(),"new-react-arcade");
  assert.equal(requestedAsset,"/arcade", "the asset fetch must not invoke the Pages .html redirect");
  assert.equal(lobby.headers.get("Location"),null, "arcade root must render without redirecting");

  const begin = await app.request("/auth/discord", {origin:arcade});
  assert.equal(begin.status,302);
  const nonceCookie=begin.headers.getSetCookie().find(c=>c.startsWith("__Host-420_arcade_browser="));
  assert.ok(nonceCookie);
  assert.match(nonceCookie,/Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  assert.equal(nonceCookie.includes("Domain="),false);
  const loginAtRoot=new URL(begin.headers.get("Location"));
  assert.equal(loginAtRoot.origin,primary);
  assert.equal(loginAtRoot.pathname,"/auth/discord");
  assert.match(loginAtRoot.searchParams.get("arcade_nonce_hash"),/^[a-f0-9]{64}$/);

  const rootBegin=await app.request(loginAtRoot.pathname+loginAtRoot.search,{origin:primary});
  const authorize=new URL(rootBegin.headers.get("Location"));
  assert.equal(authorize.origin,"https://discord.com");
  assert.equal(authorize.searchParams.get("redirect_uri"),primary+"/auth/callback");
  const rootOAuthCookie=oauthBrowserCookie(rootBegin);
  const continuationCookie=rootBegin.headers.getSetCookie().find(c=>c.startsWith("__Host-420_arcade_flow=")).split(";")[0];
  const state=authorize.searchParams.get("state");
  const fetcher=async url=>{
    if(url.endsWith("/oauth2/token"))return Response.json({token_type:"Bearer",access_token:"test-token"});
    if(url.endsWith("/users/@me"))return Response.json({id:"123456789012345679",username:"arcade_guest",avatar:null});
    throw new Error("Unexpected Discord endpoint");
  };
  const callbackPath="/auth/callback?state="+encodeURIComponent(state)+"&code=sample-code";
  const rootReturn=await app.request(callbackPath,{origin:primary,headers:{Cookie:rootOAuthCookie+"; "+continuationCookie},fetcher});
  const claimUrl=new URL(rootReturn.headers.get("Location"));
  assert.equal(claimUrl.origin,arcade);
  assert.equal(claimUrl.pathname,"/auth/claim");
  assert.match(claimUrl.searchParams.get("ticket"),/^[A-Za-z0-9_-]{43}$/);
  assert.equal(rootReturn.headers.getSetCookie().some(c=>c.includes("Domain=")),false);

  const claimPath=claimUrl.pathname+claimUrl.search;
  assert.equal((await app.request(claimPath,{origin:arcade})).headers.get("Location"),arcade+"/?auth=expired","claim without nonce worked");
  const falseNonce="__Host-420_arcade_browser="+randomToken();
  assert.equal((await app.request(claimPath,{origin:arcade,headers:{Cookie:falseNonce}})).headers.get("Location"),arcade+"/?auth=expired","another browser redeemed ticket");
  assert.equal((await app.request(claimPath,{origin:primary,headers:{Cookie:nonceCookie.split(";")[0]}})).status,404,"main origin redeemed arcade ticket");
  const redeemed=await app.request(claimPath,{origin:arcade,headers:{Cookie:nonceCookie.split(";")[0]}});
  assert.equal(redeemed.headers.get("Location"),arcade+"/");
  const newCookie=redeemed.headers.getSetCookie().find(c=>c.startsWith(SESSION_COOKIE+"="));
  assert.match(newCookie,/Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800/);
  assert.equal(newCookie.includes("Domain="),false);
  const secondUse=await app.request(claimPath,{origin:arcade,headers:{Cookie:nonceCookie.split(";")[0]}});
  assert.equal(secondUse.headers.get("Location"),arcade+"/?auth=expired");

  const userState=await data(await app.request("/api/session",{origin:arcade,headers:{Cookie:newCookie.split(";")[0]}}));
  assert.equal(userState.user.username,"arcade_guest");
  assert.ok(userState.csrfToken);
  const run=await app.request("/api/arcade-v2/runs",{origin:arcade,method:"POST",headers:{Cookie:newCookie.split(";")[0],"X-CSRF-Token":userState.csrfToken},body:{game:"sesh-invaders"}});
  assert.equal(run.status,201,"arcade host could not create an authenticated run");
  const forged=await app.request("/api/arcade-v2/runs",{origin:arcade,method:"POST",headers:{Cookie:newCookie.split(";")[0],Origin:primary,"X-CSRF-Token":userState.csrfToken},body:{game:"sesh-invaders"}});
  assert.equal(await errorCode(forged),"invalid_origin");
  const different=await app.request("/api/arcade-v2/runs",{origin:arcade,method:"POST",headers:{Cookie:newCookie.split(";")[0],"X-CSRF-Token":"invalid"},body:{game:"sesh-invaders"}});
  assert.equal(await errorCode(different),"invalid_csrf");
});

test("arcade login handoff cannot be replayed after expiration or mismatched callback binding", async () => {
  const app=fixture(),primary="https://the420lobby.com",arcade="https://arcade.the420lobby.com";
  app.env.SITE_ORIGIN=primary;
  const incoming=await app.request("/auth/discord",{origin:arcade});
  const nonce=incoming.headers.getSetCookie().find(c=>c.startsWith("__Host-420_arcade_browser=")).split(";")[0];
  const rootBegin=await app.request(new URL(incoming.headers.get("Location")).pathname+new URL(incoming.headers.get("Location")).search,{origin:primary});
  const authorization=new URL(rootBegin.headers.get("Location"));
  const state=authorization.searchParams.get("state");
  const oauthCookie=oauthBrowserCookie(rootBegin);
  const flow=rootBegin.headers.getSetCookie().find(c=>c.startsWith("__Host-420_arcade_flow=")).split(";")[0];
  const path="/auth/callback?state="+encodeURIComponent(state)+"&code=x";
  const missingFlow=await app.request(path,{origin:primary,headers:{Cookie:oauthCookie}});
  assert.equal(missingFlow.headers.get("Location"),primary+"/arcade.html?auth=expired");
  const fakeFetcher=async url=>url.endsWith("/oauth2/token")
    ? Response.json({token_type:"Bearer",access_token:"token"})
    : Response.json({id:"123456789012345679",username:"trusted_user",avatar:null});
  const success=await app.request(path,{origin:primary,headers:{Cookie:oauthCookie+"; "+flow},fetcher:fakeFetcher});
  const url=new URL(success.headers.get("Location")),ticket=url.searchParams.get("ticket");
  assert.ok(ticket);
  const nonceHash=await hash(nonce.split("=")[1]);
  app.env.DB.sqlite.prepare("UPDATE sessions SET expires_at=0 WHERE token_hash=?")
    .run(await hash("arcade-ticket:"+ticket+":"+nonceHash));
  const expired=await app.request("/auth/claim?ticket="+ticket,{origin:arcade,headers:{Cookie:nonce}});
  assert.equal(expired.headers.get("Location"),arcade+"/?auth=expired");
  assert.equal((await app.request(path,{origin:primary,headers:{Cookie:oauthCookie+"; "+flow},fetcher:fakeFetcher})).headers.get("Location"),
    arcade+"/?auth=expired","replayed callback created another ticket");
});
