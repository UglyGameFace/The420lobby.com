import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac, randomUUID, webcrypto } from "node:crypto";
import { handle } from "../apps/multibump/worker.mjs";
import {
  COOKIE,
  FLOW_COOKIE,
  hash,
  encrypt,
  decrypt,
  random,
  manages,
} from "../apps/multibump/core.mjs";
import { begin, callback } from "../apps/multibump/auth.mjs";
import { PROVIDERS, confirmedProvider } from "../apps/multibump/catalog.mjs";
import {
  setup,
  service,
  report,
  receipt,
  snapshot,
  permissionsFor,
} from "../apps/multibump/service.mjs";
import { tick, remind, poll } from "../apps/multibump/scheduler.mjs";
import { connect, webhook, voteLink } from "../apps/multibump/votes.mjs";
import { COMMAND } from "../apps/multibump/commands.mjs";
const A = "1514374173517152418",
  B = "1514374173517152419",
  CA = "1564259023266512948",
  CB = "1564259023266512949",
  USER = "123456789012345678",
  BOT = "223456789012345678",
  ROLE = "323456789012345678";
const BASE = "https://bump.the420lobby.com",
  NOW = Date.now(),
  SECRET = "tdl-test-signing-secret-no-production";
class D1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(
      readFileSync(
        new URL("../apps/multibump/migrations/0001_public.sql", import.meta.url),
        "utf8",
      ),
    );
  }
  prepare(sql) {
    const db = this.db;
    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...this.values) || null;
      },
      async all() {
        return { success: true, results: db.prepare(sql).all(...this.values) };
      },
      async run() {
        const stmt = db.prepare(sql);
        const rows = stmt.columns().length ? stmt.all(...this.values) : null;
        if (!rows) stmt.run(...this.values);
        return {
          success: true,
          results: rows || [],
          meta: { changes: db.prepare("SELECT changes() AS n").get().n },
        };
      },
    };
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec("COMMIT");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
async function fixture() {
  const env = {
    DB: new D1(),
    PUBLIC_ORIGIN: BASE,
    DISCORD_CLIENT_ID: BOT,
    DISCORD_CLIENT_SECRET: "test-client-secret",
    DISCORD_BOT_TOKEN: "test-bot-token",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    ENCRYPTION_KEY: "cd".repeat(32),
  };
  const calls = [],
    pending = [];
  let managed = [
      { id: A, name: "Server A", permissions: "32" },
      { id: B, name: "Server B", permissions: "8" },
    ],
    messages = [];
  const sender = async (url, options = {}) => {
    calls.push({ url, options });
    const u = new URL(url),
      path = u.pathname;
    if (path === "/api/v10/users/@me/guilds") return Response.json(managed);
    if (path === "/api/v10/users/@me") return Response.json({ id: USER, username: "owner" });
    if (path === "/api/v10/oauth2/token")
      return Response.json({
        token_type: "Bearer",
        access_token: "oauth-test-token",
        expires_in: 7200,
        scope: "identify guilds",
      });
    if (path.includes("/webhooks/")) return Response.json({ id: "423456789012345678" });
    const gid = path.split("/")[4];
    if (/^\/api\/v10\/guilds\/\d+$/.test(path))
      return Response.json({
        id: gid,
        name: gid === A ? "Server A" : "Server B",
        owner_id: USER,
      });
    if (path.endsWith("/channels"))
      return Response.json([
        {
          id: gid === A ? CA : CB,
          guild_id: gid,
          name: "bump",
          type: 0,
          permission_overwrites: [],
        },
      ]);
    if (path.endsWith("/roles"))
      return Response.json([
        { id: gid, name: "@everyone", permissions: "84992" },
        { id: ROLE, name: "Bump helpers", permissions: "0", mentionable: true },
      ]);
    if (path.includes("/members/"))
      return Response.json({ user: { id: path.split("/").at(-1) }, roles: [] });
    if (path.includes("/messages") && options.method === "POST")
      return Response.json({ id: "523456789012345678" });
    if (path.includes("/messages")) return Response.json(messages);
    throw new Error("Unexpected Discord call " + path);
  };
  const token = random(),
    tokenHash = await hash(token),
    csrf = await hash("csrf:" + token);
  await env.DB.prepare(
    "INSERT INTO mb_sessions(token_hash,user_id,username,oauth_cipher,expires_at) VALUES(?,?,?,?,?)",
  )
    .bind(
      tokenHash,
      USER,
      "owner",
      await encrypt(env, "oauth-test-token", "oauth:" + tokenHash),
      Date.now() + 3600000,
    )
    .run();
  async function request(path, body, extra = {}) {
    return handle(
      new Request(BASE + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: COOKIE + "=" + token,
          ...(body === undefined
            ? {}
            : {
                Origin: BASE,
                "Content-Type": "application/json",
                "X-CSRF-Token": csrf,
              }),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      { waitUntil: (p) => pending.push(p) },
      sender,
    );
  }
  async function install(guild = A) {
    await setup(env, guild, USER, { channelId: guild === A ? CA : CB }, sender, NOW - 60000);
  }
  return {
    env,
    sender,
    calls,
    pending,
    request,
    install,
    token,
    csrf,
    setManaged: (value) => {
      managed = value;
    },
    setMessages: (value) => {
      messages = value;
    },
  };
}
function message(extra = {}) {
  return {
    id: "623456789012345678",
    channel_id: CA,
    guild_id: A,
    author: { id: PROVIDERS.disboard.applicationId, bot: true },
    interaction: { name: "bump" },
    timestamp: new Date(NOW).toISOString(),
    embeds: [{ description: "Bump done!" }],
    ...extra,
  };
}
function signedVote(
  guild = A,
  { payload, delivery = randomUUID(), secret = SECRET, stamp = Math.floor(NOW / 1000) } = {},
) {
  const data = payload || {
    id: randomUUID(),
    event: "listing.upvoted",
    created_at: new Date(NOW).toISOString(),
    listing: { id: guild, type: "server" },
    data: { user: { id: USER } },
  };
  const body = JSON.stringify(data);
  return new Request(BASE + "/api/webhooks/tdl/" + guild, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TDL-Delivery": delivery,
      "X-TDL-Signature":
        "t=" +
        stamp +
        ",v1=" +
        createHmac("sha256", secret)
          .update(stamp + "." + body)
          .digest("hex"),
    },
    body,
  });
}

test("public landing and setup status do not expose private manager assets or require credentials", async () => {
  const f = await fixture();
  delete f.env.DISCORD_BOT_TOKEN;
  let r = await f.request("/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Your server/);
  r = await f.request("/api/session");
  assert.deepEqual(await r.json(), { ready: false, user: null, guilds: [] });
  assert.equal((await f.request("/auth/discord")).status, 503);
  assert.equal((await f.request("/bump-manager.js")).status, 404);
  assert.match(r.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
});
test("authentication, CSRF and exact-host enforcement fail closed", async () => {
  const f = await fixture();
  assert.equal((await f.request("/api/session", undefined, { Cookie: "" })).status, 401);
  assert.equal(
    (
      await f.request(
        "/api/guilds/" + A + "/setup",
        { channelId: CA },
        { Origin: "https://evil.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await f.request("/api/guilds/" + A + "/setup", { channelId: CA }, { "X-CSRF-Token": "wrong" }))
      .status,
    403,
  );
  assert.equal((await handle(new Request("https://shield.the420lobby.com/"), f.env)).status, 404);
  assert.equal((await f.request("/api/session", {})).status, 405);
});
test("server permission loss immediately blocks reads and writes across every tenant route", async () => {
  const f = await fixture();
  await f.install();
  await f.install(B);
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 });
  f.setManaged([{ id: B, name: "Server B", permissions: "32" }]);
  for (const [path, body] of [
    ["", undefined],
    ["/channels", undefined],
    ["/export", undefined],
    ["/setup", { channelId: CA }],
    ["/pause", { paused: true }],
    ["/services/disboard", { enabled: false, cooldownMinutes: 120 }],
    ["/services/disboard/report", {}],
    ["/tdl", { secret: SECRET }],
    ["/disconnect", { confirm: A }],
  ])
    assert.equal((await f.request("/api/guilds/" + A + path, body)).status, 403, path);
  assert.equal((await f.request("/api/guilds/" + B)).status, 200);
});
test("tenant isolation covers same provider names, settings, audit, votes and deletion", async () => {
  const f = await fixture();
  await f.install();
  await f.install(B);
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW);
  await service(f.env, B, "disboard", { enabled: true, cooldownMinutes: 180 }, NOW);
  await report(f.env, A, "disboard", NOW + 1000);
  let a = await snapshot(f.env, A),
    b = await snapshot(f.env, B);
  assert.equal(a.services[0].cooldown_minutes, 120);
  assert.equal(b.services[0].cooldown_minutes, 180);
  assert.equal(b.services[0].last_reported_at, null);
  assert.equal(
    b.events.some((e) => e.event === "member_reported"),
    false,
  );
  await connect(f.env, A, { secret: SECRET });
  await webhook(signedVote(), f.env, A, NOW);
  assert.equal((await snapshot(f.env, B)).votes.length, 0);
  assert.equal((await f.request("/api/guilds/" + A + "/disconnect", { confirm: A })).status, 200);
  for (const table of ["mb_guilds", "mb_services", "mb_events", "mb_receipts", "mb_integrations"])
    assert.equal(
      f.env.DB.db.prepare("SELECT COUNT(*) AS n FROM " + table + " WHERE guild_id=?").get(A).n,
      0,
    );
  assert.equal((await snapshot(f.env, B)).services.length, 1);
});
test("channel and role validation reject cross-server channels and privilege-lacking destinations", async () => {
  const f = await fixture();
  assert.equal((await f.request("/api/guilds/" + A + "/setup", { channelId: CB })).status, 403);
  assert.equal(
    (
      await f.request("/api/guilds/" + A + "/setup", {
        channelId: CA,
        roleId: A,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request("/api/guilds/" + A + "/setup", {
        channelId: CA,
        roleId: ROLE,
      })
    ).status,
    200,
  );
  const a = await snapshot(f.env, A);
  assert.equal(a.guild.role_id, ROLE);
  assert.equal(a.guild.channel_id, CA);
});
test("permission evaluation follows everyone, role and member overwrites including administrator", () => {
  const guild = { id: A, owner_id: USER },
    member = { user: { id: BOT }, roles: [ROLE] },
    roles = [
      { id: A, permissions: "84992" },
      { id: ROLE, permissions: "0" },
    ];
  assert.equal(
    permissionsFor(guild, roles, member, { permission_overwrites: [] }) & 84992n,
    84992n,
  );
  assert.equal(
    permissionsFor(guild, roles, member, {
      permission_overwrites: [{ id: A, type: 0, deny: "2048", allow: "0" }],
    }) & 2048n,
    0n,
  );
  assert.equal(
    permissionsFor(guild, roles, member, {
      permission_overwrites: [
        { id: A, type: 0, deny: "2048", allow: "0" },
        { id: ROLE, type: 0, deny: "0", allow: "2048" },
        { id: BOT, type: 1, deny: "2048", allow: "0" },
      ],
    }) & 2048n,
    0n,
  );
  assert.ok(
    permissionsFor(guild, [{ id: A, permissions: "8" }], member, {
      permission_overwrites: [],
    }) & 2048n,
  );
});
test("service initialization is conservative and reports remain separate from confirmations", async () => {
  const f = await fixture();
  await f.install();
  assert.equal(
    (
      await f.request("/api/guilds/" + A + "/services/disboard", {
        enabled: true,
        cooldownMinutes: 0,
      })
    ).status,
    400,
  );
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW);
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 30 }, NOW + 1000);
  let s = (await snapshot(f.env, A)).services[0];
  assert.equal(s.next_due_at, NOW + 120 * 60000);
  await report(f.env, A, "disboard", NOW + 2000);
  s = (await snapshot(f.env, A)).services[0];
  assert.equal(s.last_confirmed_at, null);
  assert.equal(s.last_reported_at, NOW + 2000);
  assert.equal(s.next_due_at, NOW + 2000 + 30 * 60000);
  assert.equal(
    (await snapshot(f.env, A)).events.some((e) => e.event === "provider_confirmed"),
    false,
  );
});
test("public confirmations reject spoofed bots, webhooks, failures, wrong channels and future timestamps", () => {
  assert.equal(confirmedProvider(message(), CA, A, NOW).provider, "disboard");
  for (const extra of [
    { author: { id: USER, bot: true } },
    { author: { id: PROVIDERS.disboard.applicationId, bot: false } },
    { webhook_id: USER },
    { channel_id: CB },
    { guild_id: B },
    { embeds: [{ description: "Already bumped; please wait." }] },
    { embeds: [{ description: "Bump done but error: not bumped" }] },
    { timestamp: new Date(NOW + 60000).toISOString() },
    { content: "", embeds: [] },
  ])
    assert.equal(confirmedProvider(message(extra), CA, A, NOW), null, JSON.stringify(extra));
});
test("provider receipts are idempotent, ordered and cannot shorten a later administrator report", async () => {
  const f = await fixture();
  await f.install();
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW);
  const c = { provider: "disboard", sourceId: "723456789012345678", at: NOW };
  await report(f.env, A, "disboard", NOW + 10000);
  assert.equal(await receipt(f.env, A, c), true);
  assert.equal(await receipt(f.env, A, c), false);
  assert.equal(
    await receipt(f.env, A, {
      ...c,
      sourceId: "723456789012345679",
      at: NOW - 5000,
    }),
    true,
  );
  const data = await snapshot(f.env, A);
  assert.equal(data.services[0].last_confirmed_at, NOW);
  assert.equal(data.services[0].next_due_at, NOW + 10000 + 120 * 60000);
  assert.equal(data.events.filter((e) => e.event === "provider_confirmed").length, 2);
});
test("reminders use each server channel and opt-in role, claim once and survive restarts", async () => {
  const f = await fixture();
  await f.install();
  await f.install(B);
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW - 121 * 60000);
  await service(f.env, B, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW - 121 * 60000);
  await f.env.DB.prepare("UPDATE mb_guilds SET role_id=? WHERE guild_id=?").bind(ROLE, A).run();
  const result = await remind(f.env, f.sender, NOW);
  assert.equal(result.sent, 2);
  const sent = f.calls.filter((c) => c.options.method === "POST");
  assert.ok(sent[0].url.includes("/channels/" + CA + "/"));
  assert.ok(sent[1].url.includes("/channels/" + CB + "/"));
  const bodies = sent.map((c) => JSON.parse(c.options.body));
  assert.deepEqual(bodies[0].allowed_mentions, { parse: [], roles: [ROLE] });
  assert.deepEqual(bodies[1].allowed_mentions, { parse: [], roles: [] });
  assert.equal((await remind(f.env, f.sender, NOW + 60000)).attempted, 0);
});
test("paused schedules and disabled services do not send reminders", async () => {
  const f = await fixture();
  await f.install();
  await service(f.env, A, "disboard", { enabled: false, cooldownMinutes: 120 }, NOW - 121 * 60000);
  assert.equal((await remind(f.env, f.sender, NOW)).sent, 0);
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW - 121 * 60000);
  await f.env.DB.prepare("UPDATE mb_guilds SET paused=1 WHERE guild_id=?").bind(A).run();
  assert.equal((await remind(f.env, f.sender, NOW)).sent, 0);
});
test("ambiguous and forbidden sends are recorded and never blindly retried", async () => {
  for (const failure of [
    () => {
      throw new Error("network timeout");
    },
    () => new Response("", { status: 403 }),
    () => new Response("", { status: 429, headers: { "Retry-After": "30" } }),
  ]) {
    const f = await fixture();
    await f.install();
    await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW - 121 * 60000);
    assert.equal((await remind(f.env, failure, NOW)).failed, 1);
    assert.equal((await remind(f.env, failure, NOW + 60000)).attempted, 0);
    assert.equal(
      (await snapshot(f.env, A)).events.some((e) => e.event === "reminder_failed"),
      true,
    );
  }
});
test("polling detects only installed-channel public confirmations, bounds scans and reports opaque content", async () => {
  const f = await fixture();
  await f.install();
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW);
  f.setMessages([message()]);
  let g = await f.env.DB.prepare("SELECT * FROM mb_guilds WHERE guild_id=?").bind(A).first();
  await poll(f.env, g, f.sender, NOW);
  assert.equal((await snapshot(f.env, A)).services[0].last_confirmed_at, NOW);
  g = await f.env.DB.prepare("SELECT * FROM mb_guilds WHERE guild_id=?").bind(A).first();
  assert.equal(g.monitor_cursor, "623456789012345678");
  f.setMessages([message({ id: "623456789012345679", content: "", embeds: [] })]);
  await poll(f.env, g, f.sender, NOW + 60001);
  assert.equal((await snapshot(f.env, A)).guild.monitor_status, "message_content_unavailable");
});
test("polling ignores pre-install history and records permission failures without manufacturing receipts", async () => {
  const f = await fixture();
  await f.install();
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW);
  f.setMessages([message({ timestamp: new Date(NOW - 120000).toISOString() })]);
  let g = await f.env.DB.prepare("SELECT * FROM mb_guilds WHERE guild_id=?").bind(A).first();
  await poll(f.env, g, f.sender, NOW);
  assert.equal((await snapshot(f.env, A)).services[0].last_confirmed_at, null);
  g = await f.env.DB.prepare("SELECT * FROM mb_guilds WHERE guild_id=?").bind(A).first();
  await poll(f.env, g, async () => new Response("", { status: 403 }), NOW + 60001);
  assert.equal((await snapshot(f.env, A)).guild.monitor_status, "discord_403");
});
test("TDL per-server secrets reject forged, stale and cross-server payloads; ping never counts", async () => {
  const f = await fixture();
  await f.install();
  await connect(f.env, A, { secret: SECRET }, NOW);
  assert.equal(
    (await webhook(signedVote(A, { payload: { event: "webhook.ping" } }), f.env, A, NOW)).status,
    200,
  );
  assert.equal((await snapshot(f.env, A)).votes.length, 0);
  for (const request of [
    signedVote(A, { secret: "incorrect-secret-long-enough" }),
    signedVote(A, { stamp: Math.floor(NOW / 1000) - 301 }),
    signedVote(B),
  ])
    await assert.rejects(webhook(request, f.env, A, NOW));
  const payload = {
    id: randomUUID(),
    event: "listing.upvoted",
    created_at: new Date(NOW).toISOString(),
    listing: { id: A, type: "server" },
    data: { user: { id: USER } },
  };
  assert.equal(
    (await (await webhook(signedVote(A, { payload }), f.env, A, NOW)).json()).duplicate,
    false,
  );
  assert.equal(
    (await (await webhook(signedVote(A, { payload }), f.env, A, NOW)).json()).duplicate,
    true,
  );
  assert.equal((await snapshot(f.env, A)).votes[0].count, 1);
  assert.ok(!JSON.stringify(f.env.DB.db.prepare("SELECT * FROM mb_receipts").all()).includes(USER));
  assert.ok(
    !JSON.stringify(f.env.DB.db.prepare("SELECT * FROM mb_integrations").all()).includes(SECRET),
  );
});
test("ciphertexts are bound to their purpose and server", async () => {
  const f = await fixture();
  const value = await encrypt(f.env, SECRET, "tdl:" + A);
  assert.equal(await decrypt(f.env, value, "tdl:" + A), SECRET);
  await assert.rejects(decrypt(f.env, value, "tdl:" + B));
  await assert.rejects(decrypt(f.env, value, "oauth:" + A));
});
test("OAuth flow binds the browser, requests only identify/guilds, consumes state and encrypts tokens", async () => {
  const f = await fixture();
  const response = await begin(new Request(BASE + "/auth/discord"), f.env, NOW);
  const target = new URL(response.headers.get("Location")),
    state = target.searchParams.get("state"),
    browser = response.headers.get("Set-Cookie").split(";")[0];
  assert.equal(target.searchParams.get("scope"), "identify guilds");
  assert.equal(target.searchParams.get("redirect_uri"), BASE + "/auth/callback");
  const url = BASE + "/auth/callback?state=" + state + "&code=example";
  const wrong = await callback(
    new Request(url, { headers: { Cookie: FLOW_COOKIE + "=" + random() } }),
    f.env,
    f.sender,
    NOW,
  );
  assert.equal(wrong.headers.get("Location"), BASE + "/?auth=failed");
  const accepted = await callback(
    new Request(url, { headers: { Cookie: browser } }),
    f.env,
    f.sender,
    NOW,
  );
  assert.equal(accepted.headers.get("Location"), BASE + "/");
  assert.match(accepted.headers.get("Set-Cookie"), /__Host-multibump=/);
  const rows = f.env.DB.db.prepare("SELECT oauth_cipher FROM mb_sessions").all();
  assert.ok(rows.every((r) => !r.oauth_cipher.includes("oauth-test-token")));
  const replay = await callback(
    new Request(url, { headers: { Cookie: browser } }),
    f.env,
    f.sender,
    NOW,
  );
  assert.equal(replay.headers.get("Location"), BASE + "/?auth=failed");
});
test("logout removes only its session and exports omit all tokens and signing secrets", async () => {
  const f = await fixture();
  await f.install();
  await connect(f.env, A, { secret: SECRET });
  const exported = await f.request("/api/guilds/" + A + "/export");
  assert.match(exported.headers.get("Content-Disposition"), /attachment/);
  const text = await exported.text();
  for (const value of [SECRET, "oauth-test-token", "oauth_cipher", "secret_cipher"])
    assert.ok(!text.includes(value));
  assert.equal((await f.request("/api/logout", {})).status, 200);
  assert.equal((await f.request("/api/session")).status, 401);
});
test("Discord interactions require Ed25519, defer network work, enforce permissions and reject replays", async () => {
  const f = await fixture(),
    keys = await webcrypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  f.env.DISCORD_PUBLIC_KEY = Buffer.from(
    await webcrypto.subtle.exportKey("raw", keys.publicKey),
  ).toString("hex");
  async function signed(payload) {
    const stamp = String(Math.floor(Date.now() / 1000)),
      body = JSON.stringify(payload),
      sig = Buffer.from(
        await webcrypto.subtle.sign("Ed25519", keys.privateKey, Buffer.from(stamp + body)),
      ).toString("hex");
    return new Request(BASE + "/api/discord/interactions", {
      method: "POST",
      headers: { "X-Signature-Timestamp": stamp, "X-Signature-Ed25519": sig },
      body,
    });
  }
  const ctx = { waitUntil: (p) => f.pending.push(p) };
  let r = await handle(await signed({ type: 1 }), f.env, ctx, f.sender);
  assert.deepEqual(await r.json(), { type: 1 });
  assert.equal((await f.request("/api/discord/interactions", {})).status, 401);
  const i = {
    id: "823456789012345678",
    application_id: BOT,
    type: 2,
    guild_id: A,
    channel_id: CA,
    member: { user: { id: USER }, permissions: "32" },
    token: "test-interaction-token",
    data: { name: "multibump", options: [{ name: "dashboard" }] },
  };
  r = await handle(await signed(i), f.env, ctx, f.sender);
  assert.deepEqual(await r.json(), { type: 5, data: { flags: 64 } });
  await Promise.all(f.pending);
  assert.match(JSON.parse(f.calls.at(-1).options.body).content, /server=/);
  r = await handle(await signed(i), f.env, ctx, f.sender);
  assert.equal((await r.json()).type, 4);
  r = await handle(
    await signed({
      ...i,
      id: "823456789012345679",
      member: { user: { id: USER }, permissions: "0" },
    }),
    f.env,
    ctx,
    f.sender,
  );
  assert.match((await r.json()).data.content, /Manage Server/);
  assert.deepEqual(COMMAND.integration_types, [0]);
});
test("scheduler retention expires sessions and receipts without touching server configuration", async () => {
  const f = await fixture();
  await f.install();
  delete f.env.DISCORD_BOT_TOKEN;
  await f.env.DB.prepare(
    "INSERT INTO mb_receipts(guild_id,provider,source_id,kind,at) VALUES(?,'tdl','old','vote',?)",
  )
    .bind(A, NOW - 91 * 86400000)
    .run();
  await tick(f.env, f.sender, NOW + 7200000);
  assert.equal(f.env.DB.db.prepare("SELECT COUNT(*) AS n FROM mb_sessions").get().n, 0);
  assert.equal(f.env.DB.db.prepare("SELECT COUNT(*) AS n FROM mb_receipts").get().n, 0);
  assert.equal(f.env.DB.db.prepare("SELECT COUNT(*) AS n FROM mb_guilds").get().n, 1);
});
test("permission bitfields support owner, administrator and Manage Server without numeric precision loss", () => {
  assert.equal(manages({ owner: true }), true);
  assert.equal(manages({ permissions: "8" }), true);
  assert.equal(manages({ permissions: "32" }), true);
  assert.equal(manages({ permissions: "0" }), false);
  assert.equal(manages({ permissions: "invalid" }), false);
});

test("listing URLs are per server, restricted to their provider and never create vote receipts", async () => {
  const f = await fixture();
  await f.install();
  await f.install(B);
  await voteLink(f.env, A, "discordify", {
    url: "https://discordify.net/server/test-a",
  });
  assert.equal(
    (await snapshot(f.env, A)).voting.find((p) => p.id === "discordify").listingUrl,
    "https://discordify.net/server/test-a",
  );
  assert.equal(
    (await snapshot(f.env, B)).voting.find((p) => p.id === "discordify").listingUrl,
    null,
  );
  assert.deepEqual((await snapshot(f.env, A)).votes, []);
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/server/a",
    "https://discordify.net.evil.test/server/a",
    "https://user:password@discordify.net/server/a",
    "http://discordify.net/server/a",
    "https://discordify.net:444/server/a",
  ])
    await assert.rejects(voteLink(f.env, A, "discordify", { url }));
});
test("overlapping reminder runs make exactly one network send for a due window", async () => {
  const f = await fixture();
  await f.install();
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW - 121 * 60000);
  const results = await Promise.all([remind(f.env, f.sender, NOW), remind(f.env, f.sender, NOW)]);
  assert.equal(
    results.reduce((n, r) => n + r.sent, 0),
    1,
  );
  assert.equal(f.calls.filter((c) => c.options.method === "POST").length, 1);
});
test("catch-up persists backward page boundaries and recent edited responses are rechecked", async () => {
  const f = await fixture();
  await f.install();
  await service(f.env, A, "disboard", { enabled: true, cooldownMinutes: 120 }, NOW);
  const snowflake = (t) => String((BigInt(t) - 1420070400000n) << 22n);
  const rows = Array.from({ length: 100 }, (_, i) =>
    message({
      id: snowflake(NOW - i * 100),
      timestamp: new Date(NOW - i * 100).toISOString(),
      author: { id: USER, bot: false },
      embeds: [],
    }),
  );
  f.setMessages(rows);
  let g = await f.env.DB.prepare("SELECT * FROM mb_guilds WHERE guild_id=?").bind(A).first();
  await poll(f.env, g, f.sender, NOW);
  g = await f.env.DB.prepare("SELECT * FROM mb_guilds WHERE guild_id=?").bind(A).first();
  assert.equal(g.monitor_status, "catching_up");
  assert.equal(g.monitor_before, rows.at(-1).id);
  assert.equal(g.monitor_cursor, null);
  f.setMessages([
    message({
      id: snowflake(NOW - 12000),
      timestamp: new Date(NOW - 12000).toISOString(),
    }),
  ]);
  await poll(f.env, g, f.sender, NOW + 60001);
  g = await f.env.DB.prepare("SELECT * FROM mb_guilds WHERE guild_id=?").bind(A).first();
  assert.equal(g.monitor_cursor, rows[0].id);
  assert.equal(g.monitor_before, null);
  assert.equal((await snapshot(f.env, A)).services[0].last_confirmed_at, NOW - 12000);
  f.setMessages([message({ id: rows[0].id, timestamp: new Date(NOW).toISOString() })]);
  await poll(f.env, g, f.sender, NOW + 120002);
  assert.equal((await snapshot(f.env, A)).services[0].last_confirmed_at, NOW);
  assert.ok(!f.calls.some((c) => new URL(c.url).searchParams.has("after")));
});
test("provider adverts without slash-command context never count, while success with a new cooldown does", () => {
  assert.equal(confirmedProvider(message({ interaction: undefined }), CA, A, NOW), null);
  assert.ok(
    confirmedProvider(
      message({ embeds: [{ description: "Bump done! Cooldown: 2 hours." }] }),
      CA,
      A,
      NOW,
    ),
  );
});

test("server managers cannot configure channels hidden from their own membership", async () => {
  const f = await fixture();
  const restricted = async (url, options) => {
    const response = await f.sender(url, options);
    const path = new URL(url).pathname;
    if (path === "/api/v10/guilds/" + A)
      return Response.json({ ...(await response.json()), owner_id: B });
    if (path.endsWith("/channels"))
      return Response.json(
        (await response.json()).map((c) => ({
          ...c,
          permission_overwrites: [{ id: USER, type: 1, allow: "0", deny: "1024" }],
        })),
      );
    return response;
  };
  await assert.rejects(
    setup(f.env, A, USER, { channelId: CA }, restricted, NOW),
    (error) => error.status === 403,
  );
  assert.equal((await snapshot(f.env, A)).guild, null);
});
