import {
  Fault,
  COOKIE,
  FLOW_COOKIE,
  cookie,
  readCookie,
  random,
  hash,
  encrypt,
  decrypt,
  json,
  redirect,
  origin,
  ready,
  limit,
  discord,
  guilds,
} from "./core.mjs";
export async function session(request, env, now = Date.now()) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT * FROM mb_sessions WHERE token_hash=? AND expires_at>?")
    .bind(await hash(token), now)
    .first();
  if (!row) return null;
  return { ...row, csrf: await hash("csrf:" + token) };
}
export async function requireSession(request, env) {
  ready(env);
  const s = await session(request, env);
  if (!s) throw new Fault(401, "sign_in", "Sign in with Discord.");
  return s;
}
export async function currentGuilds(env, s, sender = fetch) {
  return guilds(env, await decrypt(env, s.oauth_cipher, "oauth:" + s.token_hash), sender);
}
export async function requireGuild(env, s, guildId, sender = fetch) {
  const guild = (await currentGuilds(env, s, sender)).find((g) => g.id === guildId);
  if (!guild)
    throw new Fault(
      403,
      "manage_server",
      "You need Manage Server or Administrator permission in this server.",
    );
  return guild;
}
export async function begin(request, env, now = Date.now()) {
  ready(env);
  await limit(env, "oauth:" + (request.headers.get("CF-Connecting-IP") || "local"), 15, 60, now);
  const state = random(),
    browser = random();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mb_oauth WHERE expires_at<=?").bind(now),
    env.DB.prepare("INSERT INTO mb_oauth(state_hash,browser_hash,expires_at) VALUES(?,?,?)").bind(
      await hash(state),
      await hash(browser),
      now + 600000,
    ),
  ]);
  const target = new URL("https://discord.com/oauth2/authorize");
  target.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: origin(env) + "/auth/callback",
    response_type: "code",
    scope: "identify guilds",
    state,
  }).toString();
  return redirect(target.href, [cookie(FLOW_COOKIE, browser, 600)]);
}
export async function callback(request, env, sender = fetch, now = Date.now()) {
  ready(env);
  const url = new URL(request.url),
    state = url.searchParams.get("state"),
    browser = readCookie(request, FLOW_COOKIE),
    cleared = cookie(FLOW_COOKIE, "", 0);
  const fail = () => redirect(origin(env) + "/?auth=failed", [cleared]);
  if (!/^[A-Za-z0-9_-]{43}$/.test(state || "") || !browser) return fail();
  if (url.searchParams.has("iss") && url.searchParams.get("iss") !== "https://discord.com")
    return fail();
  const claim = await env.DB.prepare(
    "DELETE FROM mb_oauth WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING state_hash",
  )
    .bind(await hash(state), await hash(browser), now)
    .first();
  const code = url.searchParams.get("code");
  if (!claim || url.searchParams.has("error") || !code || code.length > 2048) return fail();
  try {
    const response = await sender("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: origin(env) + "/auth/callback",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return fail();
    const data = await response.json();
    if (
      data.token_type?.toLowerCase() !== "bearer" ||
      typeof data.access_token !== "string" ||
      data.access_token.length > 2048 ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in < 60
    )
      return fail();
    const scopes = new Set(String(data.scope || "").split(" "));
    if (!scopes.has("identify") || !scopes.has("guilds")) return fail();
    const user = await discord(env, "/users/@me", { access: data.access_token }, sender);
    if (!/^\d{17,20}$/.test(user.id || "") || typeof user.username !== "string") return fail();
    const token = random(),
      tokenHash = await hash(token),
      seconds = Math.min(3600, Math.floor(data.expires_in) - 30),
      old = readCookie(request, COOKIE);
    const statements = [
      env.DB.prepare(
        "INSERT INTO mb_sessions(token_hash,user_id,username,oauth_cipher,expires_at) VALUES(?,?,?,?,?)",
      ).bind(
        tokenHash,
        user.id,
        user.username.slice(0, 80),
        await encrypt(env, data.access_token, "oauth:" + tokenHash),
        now + seconds * 1000,
      ),
    ];
    if (old)
      statements.push(
        env.DB.prepare("DELETE FROM mb_sessions WHERE token_hash=?").bind(await hash(old)),
      );
    await env.DB.batch(statements);
    return redirect(origin(env) + "/", [cleared, cookie(COOKIE, token, seconds)]);
  } catch {
    return fail();
  }
}
export async function logout(env, s) {
  await env.DB.prepare("DELETE FROM mb_sessions WHERE token_hash=?").bind(s.token_hash).run();
  return json({ ok: true }, 200, { "Set-Cookie": cookie(COOKIE, "", 0) });
}
