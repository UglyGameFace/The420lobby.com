import { signedTDLRequest } from "../../functions/_lib/tdl-vote-webhook.mjs";
import { Fault, fields, encrypt, decrypt, json } from "./core.mjs";
import { VOTING } from "./catalog.mjs";
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export async function voteLink(env, guildId, provider, body, now = Date.now()) {
  fields(body, ["url"]);
  if (!VOTING.some((p) => p.id === provider))
    throw new Fault(404, "provider", "Unknown voting directory.");
  if (
    !(await env.DB.prepare("SELECT guild_id FROM mb_guilds WHERE guild_id=?").bind(guildId).first())
  )
    throw new Fault(409, "setup", "Choose a bump channel first.");
  let url;
  try {
    url = new URL(body.url);
  } catch {
    throw new Fault(400, "vote_url", "Enter your server’s listing URL.");
  }
  const hosts = {
    tdl: ["thediscordlist.com"],
    discadia: ["discadia.com"],
    discordify: ["discordify.net"],
    "d-invites": ["discordinvites.net", "en.discordinvites.net"],
  };
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts[provider].includes(url.hostname) ||
    url.href.length > 1024
  )
    throw new Fault(
      400,
      "vote_url",
      "Use the official directory address for your server’s listing.",
    );
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO mb_vote_links(guild_id,provider,listing_url) VALUES(?,?,?) ON CONFLICT(guild_id,provider) DO UPDATE SET listing_url=excluded.listing_url",
    ).bind(guildId, provider, url.href),
    env.DB.prepare(
      "INSERT INTO mb_events(guild_id,provider,event,at,detail) VALUES(?,?,'vote_link_saved',?,'Server listing link saved. Link visits are not vote receipts.')",
    ).bind(guildId, provider, now),
  ]);
  return { ok: true };
}
export async function connect(env, guildId, body, now = Date.now()) {
  fields(body, ["secret"]);
  if (
    typeof body.secret !== "string" ||
    body.secret.length < 16 ||
    body.secret.length > 512 ||
    /[\s\u0000-\u001f]/.test(body.secret)
  )
    throw new Fault(400, "secret", "Enter the endpoint signing secret from TheDiscordList.");
  if (
    !(await env.DB.prepare("SELECT guild_id FROM mb_guilds WHERE guild_id=?").bind(guildId).first())
  )
    throw new Fault(409, "setup", "Choose a bump channel first.");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO mb_integrations(guild_id,provider,secret_cipher,updated_at) VALUES(?,'tdl',?,?) ON CONFLICT(guild_id,provider) DO UPDATE SET secret_cipher=excluded.secret_cipher,updated_at=excluded.updated_at",
    ).bind(guildId, await encrypt(env, body.secret, "tdl:" + guildId), now),
    env.DB.prepare(
      "INSERT INTO mb_events(guild_id,provider,event,at,detail) VALUES(?,'tdl','vote_webhook_connected',?,'Signing secret updated; waiting for a real provider receipt.')",
    ).bind(guildId, now),
  ]);
  return { ok: true };
}
export async function webhook(request, env, guildId, now = Date.now()) {
  const integration = await env.DB.prepare(
    "SELECT secret_cipher FROM mb_integrations WHERE guild_id=? AND provider='tdl'",
  )
    .bind(guildId)
    .first();
  if (!integration) throw new Fault(404, "not_connected", "No webhook is configured here.");
  const secret = await decrypt(env, integration.secret_cipher, "tdl:" + guildId);
  const r = await signedTDLRequest(request, secret, now, guildId);
  if (r.ping) return json({ received: true, ping: true });
  const at = Date.parse(r.occurredAt);
  if (
    !UUID.test(r.eventId || "") ||
    !Number.isFinite(at) ||
    at > now + 300000 ||
    at < now - 90 * 86400000
  )
    throw new Fault(422, "event", "Invalid provider event identity or timestamp.");
  // The event ID survives "Send again" with a new delivery ID; both paths deduplicate.
  // Do not retain the provider's voter identity or raw event payload.
  const results = await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO mb_receipts(guild_id,provider,source_id,kind,at) VALUES(?,'tdl',?,'vote',?)",
    ).bind(guildId, r.eventId.toLowerCase(), at),
    env.DB.prepare(
      "INSERT INTO mb_events(guild_id,provider,event,at,detail) SELECT ?,'tdl','vote_confirmed',?,'Signed provider receipt.' WHERE changes()>0",
    ).bind(guildId, at),
  ]);
  return json({ received: true, duplicate: !results[0].meta?.changes });
}
