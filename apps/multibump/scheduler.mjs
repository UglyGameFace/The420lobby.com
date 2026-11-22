import { discord } from "./core.mjs";
import { PROVIDERS, confirmedProvider } from "./catalog.mjs";
import { receipt } from "./service.mjs";

export async function poll(env, guild, sender = fetch, now = Date.now()) {
  const claimed = await env.DB.prepare(
    "UPDATE mb_guilds SET poll_lease_until=? WHERE guild_id=? AND poll_lease_until<? AND poll_after<=? AND paused=0 RETURNING guild_id",
  )
    .bind(now + 60000, guild.guild_id, now, now)
    .first();
  if (!claimed) return;
  let status = "checked",
    cursor = guild.monitor_cursor,
    before = guild.monitor_before,
    head = guild.monitor_head,
    delay = 60000;
  try {
    // REST reads need Read Message History. Discord also applies Message Content access.
    // Walk newest-to-oldest toward the previous completed scan. Persist the page
    // boundary so a busy channel cannot silently skip messages between ticks.
    const path =
      "/channels/" + guild.channel_id + "/messages?limit=100" + (before ? "&before=" + before : "");
    const messages = await discord(env, path, {}, sender);
    if (!Array.isArray(messages)) throw new Error("Invalid message list");
    let visible = 0,
      opaque = 0,
      min = null;
    const floor = cursor || String((BigInt(guild.created_at) - 1420070400000n) << 22n);
    if (!head && messages.length)
      head = messages.reduce((id, m) => (BigInt(m.id) > BigInt(id) ? m.id : id), "0");
    for (const message of [...messages].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))) {
      if (
        message.author?.bot &&
        Object.values(PROVIDERS).some((p) => p.applicationId === message.author.id)
      ) {
        if (message.content || message.embeds?.length) visible++;
        else opaque++;
      }
      const confirmation = confirmedProvider(message, guild.channel_id, guild.guild_id, now);
      // Recheck recent IDs for delayed/edited command responses. Receipt keys
      // deduplicate the overlap; an ephemeral response still cannot be observed.
      if (
        confirmation &&
        confirmation.at >= guild.created_at &&
        (BigInt(message.id) > BigInt(floor) || confirmation.at >= now - 300000)
      )
        await receipt(env, guild.guild_id, confirmation, now);
      if (!min || BigInt(message.id) < BigInt(min)) min = message.id;
    }
    if (opaque && !visible) status = "message_content_unavailable";
    if (!messages.length) status = "no_visible_messages";
    if (messages.length === 100 && BigInt(min) > BigInt(floor)) {
      before = min;
      status = "catching_up";
    } else {
      cursor = head || cursor;
      before = null;
      head = null;
    }
  } catch (error) {
    status = error.discordStatus ? "discord_" + error.discordStatus : "check_failed";
    delay = error.discordStatus === 429 ? error.retryAfter * 1000 : 300000;
  }
  await env.DB.prepare(
    "UPDATE mb_guilds SET monitor_cursor=?,monitor_before=?,monitor_head=?,monitor_checked_at=?,monitor_status=?,poll_after=?,poll_lease_until=0 WHERE guild_id=? AND channel_id=?",
  )
    .bind(cursor, before, head, now, status, now + delay, guild.guild_id, guild.channel_id)
    .run();
}
export async function remind(env, sender = fetch, now = Date.now()) {
  const due = await env.DB.prepare(
    `SELECT s.*,g.channel_id,g.role_id FROM mb_services s JOIN mb_guilds g USING(guild_id)
    WHERE s.enabled=1 AND g.paused=0 AND s.next_due_at<=? AND (s.last_reminder_due_at IS NULL OR s.last_reminder_due_at<>s.next_due_at)
    ORDER BY s.next_due_at,s.guild_id,s.provider LIMIT 5`,
  )
    .bind(now)
    .all();
  const result = { attempted: 0, sent: 0, failed: 0 };
  for (const s of due.results) {
    const claim = await env.DB.prepare(
      `UPDATE mb_services SET last_reminder_due_at=next_due_at,reminder_status='attempted' WHERE guild_id=? AND provider=? AND next_due_at=?
      AND enabled=1 AND (last_reminder_due_at IS NULL OR last_reminder_due_at<>next_due_at)
      AND EXISTS(SELECT 1 FROM mb_guilds WHERE guild_id=? AND paused=0 AND channel_id=?) RETURNING provider`,
    )
      .bind(s.guild_id, s.provider, s.next_due_at, s.guild_id, s.channel_id)
      .first();
    if (!claim) continue;
    result.attempted++;
    let status = "delivery_unknown";
    try {
      await discord(
        env,
        "/channels/" + s.channel_id + "/messages",
        {
          method: "POST",
          timeout: 8000,
          body: {
            content:
              (s.role_id ? "<@&" + s.role_id + "> " : "") +
              "**" +
              PROVIDERS[s.provider].label +
              "** is due. A member can run `/bump` in this channel.",
            embeds: [
              {
                description:
                  "This is a reminder. The schedule updates when a public success message is detected or an administrator reports a completed bump.",
                color: 11071580,
              },
            ],
            allowed_mentions: { parse: [], roles: s.role_id ? [s.role_id] : [] },
            nonce: String(now) + String(result.attempted).padStart(2, "0"),
            enforce_nonce: true,
          },
        },
        sender,
      );
      status = "sent";
    } catch (error) {
      if (error.discordStatus) status = "discord_" + error.discordStatus;
    }
    result[status === "sent" ? "sent" : "failed"]++;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE mb_services SET reminder_status=? WHERE guild_id=? AND provider=? AND last_reminder_due_at=?",
      ).bind(status, s.guild_id, s.provider, s.next_due_at),
      env.DB.prepare(
        "INSERT INTO mb_events(guild_id,provider,event,at,detail) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mb_guilds WHERE guild_id=?)",
      ).bind(
        s.guild_id,
        s.provider,
        status === "sent" ? "reminder_sent" : "reminder_failed",
        now,
        status,
        s.guild_id,
      ),
    ]);
    // No retries for ambiguous sends. A new report/confirmation opens a new due window.
  }
  return result;
}
export async function tick(env, sender = fetch, now = Date.now()) {
  if (!env.DB) return { configured: false };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mb_sessions WHERE expires_at<=?").bind(now),
    env.DB.prepare("DELETE FROM mb_oauth WHERE expires_at<=?").bind(now),
    env.DB.prepare("DELETE FROM mb_limits WHERE expires_at<=?").bind(now),
    env.DB.prepare("DELETE FROM mb_interactions WHERE expires_at<=?").bind(now),
    env.DB.prepare("DELETE FROM mb_events WHERE at<?").bind(now - 30 * 86400000),
    env.DB.prepare("DELETE FROM mb_receipts WHERE at<?").bind(now - 90 * 86400000),
    env.DB.prepare(
      "INSERT INTO mb_runtime(key,value) VALUES('last_tick',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).bind(String(now)),
  ]);
  if (!env.DISCORD_BOT_TOKEN) return { configured: false };
  // Fair rotation: healthy servers are checked about once a minute; errors back off.
  // Bound work and rotate servers fairly instead of launching an unbounded fan-out.
  const guilds = await env.DB.prepare(
    "SELECT * FROM mb_guilds WHERE paused=0 AND poll_after<=? AND poll_lease_until<? ORDER BY poll_after,guild_id LIMIT 5",
  )
    .bind(now, now)
    .all();
  for (const guild of guilds.results) await poll(env, guild, sender, now);
  return { configured: true, ...(await remind(env, sender, now)) };
}
