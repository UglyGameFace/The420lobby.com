/* Cloudflare scheduled reminder delivery. No Discord user token, no /bump commands.
 * Atomic due-window claims avoid duplicate deliveries across overlapping cron runs.
 * Unknown delivery outcomes intentionally do not retry automatically. */
const DISCORD_WEBHOOK = /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{30,}(?:\?.*)?$/;

async function recordHeartbeat(env, result, now) {
  const present = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bump_scheduler_runs'").first();
  if (!present) return result;
  await env.DB.prepare("INSERT INTO bump_scheduler_runs(id,last_tick_at,attempted,sent,failed,webhook_configured) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_tick_at=excluded.last_tick_at,attempted=excluded.attempted,sent=excluded.sent,failed=excluded.failed,webhook_configured=excluded.webhook_configured")
    .bind(now,result.attempted,result.sent,result.failed,result.configured?1:0).run();
  return result;
}

export async function deliverDueReminders(env, sender = fetch, now = Date.now()) {
  if (!env.DB) throw new Error("Bump scheduler D1 binding missing");
  const target = env.BUMP_REMINDER_WEBHOOK_URL || "";
  if (!DISCORD_WEBHOOK.test(target)) {
    console.info("Bump reminders disabled: no valid Discord webhook secret configured");
    return recordHeartbeat(env,{sent:0,failed:0,attempted:0,configured:false},now);
  }
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bump_services'").first();
  if (!table) return recordHeartbeat(env,{sent:0,failed:0,attempted:0,configured:true,setupPending:true},now);
  const due = await env.DB.prepare(
    "SELECT id,name,channel_url,next_due_at FROM bump_services WHERE enabled=1 AND archived_at IS NULL AND next_due_at<=? AND (last_reminder_due_at IS NULL OR last_reminder_due_at<>next_due_at) ORDER BY next_due_at,id LIMIT 10"
  ).bind(now).all();
  const outcome = {sent:0,failed:0,attempted:0,configured:true};
  for (const service of due.results || []) {
    // Claim the exact due window before attempting network I/O. If an ambiguous
    // timeout occurs, never resend the same notice automatically.
    const claim = await env.DB.prepare(
      "UPDATE bump_services SET last_reminder_due_at=next_due_at,reminder_status='attempted',updated_at=? WHERE id=? AND enabled=1 AND archived_at IS NULL AND next_due_at=? AND (last_reminder_due_at IS NULL OR last_reminder_due_at<>next_due_at) RETURNING id"
    ).bind(now,service.id,service.next_due_at).first();
    if (!claim) continue;
    outcome.attempted++;
    await env.DB.prepare("INSERT INTO bump_audit(service_id,event,at,detail) VALUES(?,?,?,?)")
      .bind(service.id,"reminder_attempted",now,"Delivery attempted once for this due window.").run();
    let status = "delivery_unknown";
    try {
      const response = await sender(target,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          content:"Manual bump reminder: **"+service.name+"** is due.\nChannel: "+service.channel_url+
            "\nOpen the channel and complete the bump yourself. This reminder is not a confirmed bump.",
          allowed_mentions:{parse:[]}
        }),
        signal:AbortSignal.timeout(8000)
      });
      status = response.ok ? "sent" : "http_"+String(response.status);
    } catch { /* A timed-out request may still have been delivered. No blind retry. */ }
    const sent = status === "sent";
    if (sent) outcome.sent++; else outcome.failed++;
    await env.DB.prepare("UPDATE bump_services SET reminder_status=?,updated_at=? WHERE id=? AND last_reminder_due_at=?")
      .bind(status,now,service.id,service.next_due_at).run();
    await env.DB.prepare("INSERT INTO bump_audit(service_id,event,at,detail) VALUES(?,?,?,?)")
      .bind(service.id,sent?"reminder_sent":"reminder_uncertain",now,status).run();
  }
  return recordHeartbeat(env,outcome,now);
}

export default {
  async scheduled(_controller, env) {
    const result = await deliverDueReminders(env);
    console.info("Bump scheduler run",result);
  },
  async fetch() {
    return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  }
};
