export const ID = /^\d{17,20}$/;
export const COOKIE = "__Host-multibump";
export const FLOW_COOKIE = "__Host-multibump_oauth";
const encoder = new TextEncoder();
export class Fault extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}
export const cookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
export function readCookie(request, name) {
  const values = (request.headers.get("Cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + "="));
  const value = values[0]?.slice(name.length + 1);
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(value || "") ? value : null;
}
export function random() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function hash(value) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export function origin(env) {
  const url = new URL(env.PUBLIC_ORIGIN);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Fault(503, "configuration", "Service setup is incomplete.");
  return url.origin;
}
export function configuration(env) {
  const missing = [];
  if (!env.DB) missing.push("database");
  if (!ID.test(env.DISCORD_CLIENT_ID || "")) missing.push("Discord application ID");
  if (!env.DISCORD_CLIENT_SECRET) missing.push("Discord OAuth secret");
  if (!env.DISCORD_BOT_TOKEN) missing.push("Discord bot token");
  if (!/^[a-f\d]{64}$/i.test(env.DISCORD_PUBLIC_KEY || "")) missing.push("Discord public key");
  if (!/^[a-f\d]{64}$/i.test(env.ENCRYPTION_KEY || "")) missing.push("encryption key");
  try {
    origin(env);
  } catch {
    missing.push("public address");
  }
  return missing;
}
export function ready(env) {
  if (configuration(env).length)
    throw new Fault(503, "setup_pending", "MultiBump is waiting for its Discord app connection.");
}
const fromHex = (value) => Uint8Array.from(value.match(/../g) || [], (n) => parseInt(n, 16));
export async function encrypt(env, value, context) {
  const key = await crypto.subtle.importKey("raw", fromHex(env.ENCRYPTION_KEY), "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
      key,
      encoder.encode(value),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...bytes));
}
export async function decrypt(env, value, context) {
  const key = await crypto.subtle.importKey("raw", fromHex(env.ENCRYPTION_KEY), "AES-GCM", false, [
    "decrypt",
  ]);
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode(context) },
      key,
      bytes.slice(12),
    ),
  );
}
export async function bodyBytes(request, max = 32768) {
  if (Number(request.headers.get("Content-Length") || 0) > max)
    throw new Fault(413, "too_large", "Request too large.");
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new Fault(413, "too_large", "Request too large.");
      }
      chunks.push(value);
    }
  const data = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    data.set(chunk, at);
    at += chunk.length;
  }
  return data;
}
export async function readJson(request, max = 4096) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || ""))
    throw new Fault(415, "json_required", "Send JSON.");
  let value;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(await bodyBytes(request, max)),
    );
  } catch (error) {
    if (error instanceof Fault) throw error;
    throw new Fault(400, "invalid_json", "Invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Fault(400, "invalid_json", "Expected an object.");
  return value;
}
export function fields(body, allowed) {
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    throw new Fault(400, "unknown_field", "Unexpected setting.");
}
export function csrf(request, session, env) {
  if (
    request.headers.get("Origin") !== origin(env) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    request.headers.get("X-CSRF-Token") !== session.csrf
  )
    throw new Fault(403, "csrf", "Reload this page and try again.");
}
export async function limit(env, key, max, seconds = 60, now = Date.now()) {
  const window = Math.floor(now / (seconds * 1000));
  const row = await env.DB.prepare(
    "INSERT INTO mb_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(await hash(key + ":" + window + ":" + seconds), (window + 1) * seconds * 1000)
    .first();
  if (row.count > max)
    throw new Fault(429, "rate_limit", "Please wait a moment before trying again.");
}
export async function discord(
  env,
  path,
  { method = "GET", body, access, timeout = 8000 } = {},
  sender = fetch,
) {
  const response = await sender("https://discord.com/api/v10" + path, {
    method,
    headers: {
      Authorization: access ? "Bearer " + access : "Bot " + env.DISCORD_BOT_TOKEN,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    const error = new Fault(
      response.status === 429
        ? 429
        : response.status === 401
          ? 401
          : response.status === 403 || response.status === 404
            ? 403
            : 502,
      "discord_unavailable",
      response.status === 429
        ? "Discord is busy. Try again shortly."
        : response.status === 401
          ? "Sign in again to refresh your Discord session."
          : "Discord access could not be verified. Check bot installation and channel permissions.",
    );
    error.discordStatus = response.status;
    error.retryAfter = Math.min(
      3600,
      Math.max(5, Number(response.headers.get("Retry-After")) || 60),
    );
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
export function manages(guild) {
  try {
    return guild.owner === true || (BigInt(guild.permissions) & 40n) !== 0n;
  } catch {
    return false;
  }
}
export async function guilds(env, access, sender = fetch) {
  const result = [];
  let after = "0";
  for (let page = 0; page < 10; page++) {
    const data = await discord(
      env,
      "/users/@me/guilds?limit=200&after=" + after,
      { access },
      sender,
    );
    if (!Array.isArray(data))
      throw new Fault(502, "discord_unavailable", "Discord returned an invalid server list.");
    result.push(...data.filter((g) => ID.test(g.id || "") && manages(g)));
    if (data.length < 200) return result;
    after = data.reduce((a, g) => (BigInt(g.id) > BigInt(a) ? g.id : a), after);
  }
  throw new Fault(502, "guild_limit", "Too many servers to verify. Use /multibump in Discord.");
}
export async function signature(request, env, now = Date.now()) {
  const stamp = request.headers.get("X-Signature-Timestamp") || "",
    sig = request.headers.get("X-Signature-Ed25519") || "";
  if (
    !/^\d{10,11}$/.test(stamp) ||
    Math.abs(now / 1000 - Number(stamp)) > 300 ||
    !/^[a-f\d]{128}$/i.test(sig) ||
    !/^[a-f\d]{64}$/i.test(env.DISCORD_PUBLIC_KEY || "")
  )
    throw new Fault(401, "signature", "Invalid Discord signature.");
  const bytes = await bodyBytes(request),
    prefix = encoder.encode(stamp),
    message = new Uint8Array(prefix.length + bytes.length);
  message.set(prefix);
  message.set(bytes, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(env.DISCORD_PUBLIC_KEY),
    "Ed25519",
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify("Ed25519", key, fromHex(sig), message)))
    throw new Fault(401, "signature", "Invalid Discord signature.");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Fault(400, "invalid_json", "Invalid interaction.");
  }
}
export async function audit(env, guild, provider, event, at, detail = "") {
  await env.DB.prepare("INSERT INTO mb_events(guild_id,provider,event,at,detail) VALUES(?,?,?,?,?)")
    .bind(guild, provider, event, at, detail)
    .run();
}
