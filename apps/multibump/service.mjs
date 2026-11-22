import { Fault, ID, fields, discord, audit } from "./core.mjs";
import { PROVIDERS, VOTING } from "./catalog.mjs";

export function permissionsFor(guild, roles, member, channel) {
  if (guild.owner_id === member.user?.id) return (1n << 60n) - 1n;
  let bits = 0n;
  const ids = new Set([guild.id, ...(member.roles || [])]);
  for (const role of roles) if (ids.has(role.id)) bits |= BigInt(role.permissions);
  if (bits & 8n) return (1n << 60n) - 1n;
  const overwrites = channel.permission_overwrites || [];
  const everyone = overwrites.find((o) => o.type === 0 && o.id === guild.id);
  if (everyone) bits = (bits & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n,
    deny = 0n;
  for (const o of overwrites)
    if (o.type === 0 && o.id !== guild.id && ids.has(o.id)) {
      allow |= BigInt(o.allow);
      deny |= BigInt(o.deny);
    }
  bits = (bits & ~deny) | allow;
  const own = overwrites.find((o) => o.type === 1 && o.id === member.user?.id);
  if (own) bits = (bits & ~BigInt(own.deny)) | BigInt(own.allow);
  return bits;
}
export async function channels(env, guildId, sender = fetch) {
  const [guild, list, roles, member] = await Promise.all([
    discord(env, "/guilds/" + guildId, {}, sender),
    discord(env, "/guilds/" + guildId + "/channels", {}, sender),
    discord(env, "/guilds/" + guildId + "/roles", {}, sender),
    discord(env, "/guilds/" + guildId + "/members/" + env.DISCORD_CLIENT_ID, {}, sender),
  ]);
  const usable = list
    .filter((c) => [0, 5].includes(c.type) && c.guild_id === guildId)
    .map((c) => ({ ...c, botPermissions: permissionsFor(guild, roles, member, c) }));
  return {
    guild,
    channels: usable
      .filter((c) => (c.botPermissions & 84992n) === 84992n)
      .map((c) => ({ id: c.id, name: c.name })),
    roles: roles
      .filter((r) => r.id !== guildId && !r.managed && r.mentionable)
      .map((r) => ({ id: r.id, name: r.name })),
  };
}
export async function setup(env, guildId, userId, body, sender = fetch, now = Date.now()) {
  fields(body, ["channelId", "roleId"]);
  if (!ID.test(body.channelId || "") || (body.roleId != null && !ID.test(body.roleId)))
    throw new Fault(400, "channel", "Choose a server channel and an optional notification role.");
  const available = await channels(env, guildId, sender);
  if (!available.channels.some((c) => c.id === body.channelId))
    throw new Fault(
      403,
      "channel_permissions",
      "Choose a channel where MultiBump can view, send messages, embed links, and read history.",
    );
  if (body.roleId && !available.roles.some((r) => r.id === body.roleId))
    throw new Fault(400, "role", "Choose a mentionable, non-managed role in this server.");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mb_guilds(guild_id,name,channel_id,role_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET name=excluded.name,channel_id=excluded.channel_id,role_id=excluded.role_id,updated_at=excluded.updated_at,
      monitor_cursor=CASE WHEN channel_id<>excluded.channel_id THEN NULL ELSE monitor_cursor END,
      monitor_before=CASE WHEN channel_id<>excluded.channel_id THEN NULL ELSE monitor_before END,
      monitor_head=CASE WHEN channel_id<>excluded.channel_id THEN NULL ELSE monitor_head END,
      monitor_status='waiting',poll_after=0`,
    ).bind(
      guildId,
      available.guild.name.slice(0, 100),
      body.channelId,
      body.roleId || null,
      userId,
      now,
      now,
    ),
    env.DB.prepare("INSERT INTO mb_events(guild_id,event,at,detail) VALUES(?,?,?,?)").bind(
      guildId,
      "settings_saved",
      now,
      "Reminder channel and optional role updated.",
    ),
  ]);
  return { ok: true };
}
export async function service(env, guildId, provider, body, now = Date.now()) {
  const p = PROVIDERS[provider];
  if (!p) throw new Fault(404, "provider", "Unknown directory service.");
  fields(body, ["enabled", "cooldownMinutes"]);
  if (
    typeof body.enabled !== "boolean" ||
    !Number.isSafeInteger(body.cooldownMinutes) ||
    body.cooldownMinutes < 15 ||
    body.cooldownMinutes > 10080
  )
    throw new Fault(400, "service", "Choose a cooldown between 15 and 10080 minutes.");
  if (
    !(await env.DB.prepare("SELECT guild_id FROM mb_guilds WHERE guild_id=?").bind(guildId).first())
  )
    throw new Fault(409, "setup", "Choose your bump channel first.");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mb_services(guild_id,provider,cooldown_minutes,enabled,next_due_at,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(guild_id,provider) DO UPDATE SET cooldown_minutes=excluded.cooldown_minutes,enabled=excluded.enabled,
      next_due_at=CASE WHEN MAX(COALESCE(last_confirmed_at,0),COALESCE(last_reported_at,0))>0
        THEN MAX(?,MAX(COALESCE(last_confirmed_at,0),COALESCE(last_reported_at,0))+excluded.cooldown_minutes*60000)
        ELSE MAX(next_due_at,excluded.next_due_at) END,updated_at=excluded.updated_at`,
    ).bind(
      guildId,
      provider,
      body.cooldownMinutes,
      body.enabled ? 1 : 0,
      now + body.cooldownMinutes * 60000,
      now,
      now,
    ),
    env.DB.prepare(
      "INSERT INTO mb_events(guild_id,provider,event,at,detail) VALUES(?,?,?,?,?)",
    ).bind(
      guildId,
      provider,
      "service_saved",
      now,
      body.enabled
        ? "Enabled. Initial schedule is an estimate until a bump is observed or reported."
        : "Paused.",
    ),
  ]);
  return { ok: true };
}
export async function report(env, guildId, provider, now = Date.now()) {
  if (!PROVIDERS[provider]) throw new Fault(404, "provider", "Unknown directory service.");
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE mb_services SET last_reported_at=?,next_due_at=?+cooldown_minutes*60000,last_reminder_due_at=NULL,reminder_status='none',updated_at=?
      WHERE guild_id=? AND provider=? AND enabled=1 RETURNING provider`,
    ).bind(now, now, now, guildId, provider),
    env.DB.prepare(
      `INSERT INTO mb_events(guild_id,provider,event,at,detail) SELECT ?,?,?,?,? WHERE changes()>0`,
    ).bind(
      guildId,
      provider,
      "member_reported",
      now,
      "Administrator report; not a provider-confirmed bump.",
    ),
  ]);
  if (!result[0].results?.length)
    throw new Fault(409, "service_paused", "Enable this service before reporting a bump.");
  return { ok: true };
}
export async function receipt(env, guildId, confirmation, now = Date.now()) {
  const { provider, sourceId, at } = confirmation;
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO mb_receipts(guild_id,provider,source_id,kind,at)
      SELECT ?,?,?,'bump',? WHERE EXISTS(SELECT 1 FROM mb_services WHERE guild_id=? AND provider=?)`,
    ).bind(guildId, provider, sourceId, at, guildId, provider),
    env.DB.prepare(
      `INSERT INTO mb_events(guild_id,provider,event,at,detail) SELECT ?,?,'provider_confirmed',?,? WHERE changes()>0`,
    ).bind(guildId, provider, at, "Public confirmation from the known directory bot."),
    env.DB.prepare(
      `UPDATE mb_services SET last_confirmed_at=?,next_due_at=MAX(COALESCE(last_reported_at,0),?)+cooldown_minutes*60000,
      last_reminder_due_at=NULL,reminder_status='none',updated_at=? WHERE guild_id=? AND provider=? AND COALESCE(last_confirmed_at,0)<?
      AND EXISTS(SELECT 1 FROM mb_receipts WHERE guild_id=? AND provider=? AND source_id=?)`,
    ).bind(at, at, now, guildId, provider, at, guildId, provider, sourceId),
  ]);
  return Boolean(result[0].meta?.changes);
}
export async function snapshot(env, guildId, now = Date.now()) {
  const [guild, services, events, votes, integration, runtime, links] = await Promise.all([
    env.DB.prepare(
      "SELECT guild_id,name,channel_id,role_id,paused,monitor_checked_at,monitor_status FROM mb_guilds WHERE guild_id=?",
    )
      .bind(guildId)
      .first(),
    env.DB.prepare("SELECT * FROM mb_services WHERE guild_id=? ORDER BY provider")
      .bind(guildId)
      .all(),
    env.DB.prepare(
      "SELECT provider,event,at,detail FROM mb_events WHERE guild_id=? ORDER BY id DESC LIMIT 50",
    )
      .bind(guildId)
      .all(),
    env.DB.prepare(
      "SELECT provider,COUNT(*) AS count,MAX(at) AS last_at FROM mb_receipts WHERE guild_id=? AND kind='vote' AND at>? GROUP BY provider",
    )
      .bind(guildId, now - 30 * 86400000)
      .all(),
    env.DB.prepare(
      "SELECT provider,updated_at FROM mb_integrations WHERE guild_id=? AND provider='tdl'",
    )
      .bind(guildId)
      .first(),
    env.DB.prepare("SELECT value FROM mb_runtime WHERE key='last_tick'").first(),
    env.DB.prepare("SELECT provider,listing_url FROM mb_vote_links WHERE guild_id=?")
      .bind(guildId)
      .all(),
  ]);
  return {
    guild,
    services: services.results,
    events: events.results,
    votes: votes.results,
    tdlConnected: Boolean(integration),
    schedulerLastTick: runtime ? Number(runtime.value) : null,
    serverTime: now,
    providers: Object.values(PROVIDERS).map(({ success, cooldown, ...p }) => p),
    voting: VOTING.map((p) => ({
      ...p,
      listingUrl:
        links.results.find((l) => l.provider === p.id)?.listing_url ||
        (p.id === "tdl" ? p.url + guildId : null),
    })),
  };
}
export async function pause(env, guildId, paused, now = Date.now()) {
  if (typeof paused !== "boolean") throw new Fault(400, "paused", "Choose paused or running.");
  const result = await env.DB.prepare(
    "UPDATE mb_guilds SET paused=?,updated_at=? WHERE guild_id=? RETURNING guild_id",
  )
    .bind(paused ? 1 : 0, now, guildId)
    .first();
  if (!result) throw new Fault(409, "setup", "Choose a bump channel first.");
  await audit(env, guildId, null, paused ? "reminders_paused" : "reminders_resumed", now);
  return { ok: true };
}
export async function disconnect(env, guildId) {
  // Data deletion stops schedules and erases integration secrets in one transaction.
  await env.DB.prepare("DELETE FROM mb_guilds WHERE guild_id=?").bind(guildId).run();
  return { ok: true };
}
