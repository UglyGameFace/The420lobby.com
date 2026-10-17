import {HttpError, json, redirect} from "./http.mjs";

export const SESSION_COOKIE = "__Host-420_session";
export const OAUTH_COOKIE = "__Host-420_oauth";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_SECONDS = 600;

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}

export function readCookie(request, name) {
  const values = (request.headers.get("cookie") || "").split(";").map(part => part.trim()).filter(part => part.startsWith(name + "="));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function siteOrigin(env) {
  let url;
  try { url = new URL(env.SITE_ORIGIN); } catch { throw new HttpError(503, "setup_required", "Discord sign-in is not configured yet."); }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new HttpError(503, "setup_required", "Discord sign-in is not configured yet.");
  }
  return url.origin;
}

export function isConfigured(env) {
  try { return Boolean(env.DB && /^\d{17,20}$/.test(env.DISCORD_CLIENT_ID || "") && env.DISCORD_CLIENT_SECRET && siteOrigin(env)); }
  catch { return false; }
}

export function requireConfiguration(env) {
  if (!isConfigured(env)) throw new HttpError(503, "setup_required", "Discord sign-in is not configured yet. Please check back soon.");
}

export function publicUser(row) { return {id: row.id || row.user_id, username: row.username, avatarUrl: row.avatar_url}; }

export async function getSession(request, env, now = Date.now()) {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw || !env.DB) return null;
  const tokenHash = await hash(raw);
  const row = await env.DB.prepare(`SELECT s.token_hash, s.expires_at, u.id, u.username, u.avatar_url
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).bind(tokenHash, now).first();
  if (!row) return null;
  return {user: publicUser(row), tokenHash, csrfToken: await hash(`csrf:${raw}`), expiresAt: row.expires_at};
}

export async function requireSession(request, env) {
  requireConfiguration(env);
  const session = await getSession(request, env);
  if (!session) throw new HttpError(401, "sign_in_required", "Sign in with Discord to play and save your scores.");
  return session;
}

export function requireCsrf(request, env, session) {
  const expected = siteOrigin(env);
  // Reject aliased hosts and opaque/missing origins. OAuth callback uses state instead.
  if (new URL(request.url).origin !== expected || request.headers.get("Origin") !== expected) {
    throw new HttpError(403, "invalid_origin", "Reload the arcade and try again.");
  }
  const submitted = request.headers.get("X-CSRF-Token") || "";
  let different = submitted.length ^ session.csrfToken.length;
  for (let i = 0; i < session.csrfToken.length; i++) different |= (submitted.charCodeAt(i) || 0) ^ session.csrfToken.charCodeAt(i);
  if (different !== 0) throw new HttpError(403, "invalid_csrf", "Your session changed. Reload the arcade and try again.");
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") throw new HttpError(403, "invalid_origin", "Reload the arcade and try again.");
}

export async function rateLimit(env, key, limit, seconds, now = Date.now()) {
  const window = Math.floor(now / (seconds * 1000));
  const rateKey = await hash(`${key}:${seconds}:${window}`);
  const result = await env.DB.prepare(`INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`).bind(rateKey, (window + 1) * seconds * 1000).first();
  if (result.count > limit) throw new HttpError(429, "rate_limited", "Please slow down and try again shortly.");
}

export async function beginDiscord(request, env) {
  requireConfiguration(env);
  if (new URL(request.url).origin !== siteOrigin(env)) return redirect(`${siteOrigin(env)}/auth/discord`);
  await rateLimit(env, `oauth:${request.headers.get("CF-Connecting-IP") || "local"}`, 20, 60);
  const state = randomToken(), browser = randomToken(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now - 60000),
    env.DB.prepare("INSERT INTO oauth_states (state_hash, browser_hash, expires_at) VALUES (?, ?, ?)").bind(await hash(state), await hash(browser), now + OAUTH_SECONDS * 1000)
  ]);
  const target = new URL("https://discord.com/oauth2/authorize");
  target.search = new URLSearchParams({client_id: env.DISCORD_CLIENT_ID, redirect_uri: `${siteOrigin(env)}/auth/callback`, response_type: "code", scope: "identify", state}).toString();
  return redirect(target.href, [cookie(OAUTH_COOKIE, browser, OAUTH_SECONDS)]);
}

export function discordIdentity(data) {
  if (!data || typeof data.id !== "string" || !/^\d{17,20}$/.test(data.id) || typeof data.username !== "string") throw new Error("Invalid Discord identity");
  const username = data.username.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 80);
  if (!username) throw new Error("Invalid Discord username");
  const avatar = /^(?:a_)?[a-f0-9]{32}$/.test(data.avatar || "") ? data.avatar : null;
  const avatarUrl = avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${avatar}.webp?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(data.id) >> 22n) % 6n)}.png`;
  return {id: data.id, username, avatarUrl};
}

export async function completeDiscord(request, env, fetcher = fetch) {
  requireConfiguration(env);
  const destination = `${siteOrigin(env)}/arcade.html`;
  const cleared = cookie(OAUTH_COOKIE, "", 0);
  if (new URL(request.url).origin !== siteOrigin(env)) return redirect(`${destination}?auth=expired`, [cleared]);
  const url = new URL(request.url), state = url.searchParams.get("state"), browser = readCookie(request, OAUTH_COOKIE);
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !browser) return redirect(`${destination}?auth=expired`, [cleared]);
  // Atomic consume prevents callback replay, including simultaneous requests.
  const claim = await env.DB.prepare(`DELETE FROM oauth_states WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING state_hash`)
    .bind(await hash(state), await hash(browser), Date.now()).first();
  if (!claim) return redirect(`${destination}?auth=expired`, [cleared]);
  if (url.searchParams.has("error")) return redirect(`${destination}?auth=cancelled`, [cleared]);
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return redirect(`${destination}?auth=failed`, [cleared]);
  try {
    const exchange = await fetcher("https://discord.com/api/v10/oauth2/token", {
      method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: `${siteOrigin(env)}/auth/callback`})
    });
    if (!exchange.ok) throw new Error("Discord token exchange failed");
    const tokens = await exchange.json();
    if (tokens.token_type?.toLowerCase() !== "bearer" || typeof tokens.access_token !== "string" || tokens.access_token.length > 2048) throw new Error("Invalid token response");
    const identity = await fetcher("https://discord.com/api/v10/users/@me", {headers: {Authorization: `Bearer ${tokens.access_token}`}, signal: AbortSignal.timeout(8000)});
    if (!identity.ok) throw new Error("Discord identity request failed");
    const user = discordIdentity(await identity.json()), now = Date.now(), token = randomToken();
    const oldToken = readCookie(request, SESSION_COOKIE);
    const statements = [env.DB.prepare(`INSERT INTO users (id, username, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`)
      .bind(user.id, user.username, user.avatarUrl, now, now)];
    if (oldToken) statements.push(env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hash(oldToken)));
    statements.push(env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await hash(token), user.id, now, now + SESSION_SECONDS * 1000));
    await env.DB.batch(statements);
    // OAuth tokens are deliberately discarded. No Discord secret/token enters storage or a browser response.
    return redirect(destination, [cleared, cookie(SESSION_COOKIE, token, SESSION_SECONDS)]);
  } catch {
    return redirect(`${destination}?auth=failed`, [cleared]);
  }
}

export async function logout(request, env, session) {
  requireCsrf(request, env, session);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  return json({ok: true}, 200, {"Set-Cookie": cookie(SESSION_COOKIE, "", 0)});
}
