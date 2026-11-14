/* Owner-only MultiBump coordination. This module never authenticates as a Discord
 * user or sends bump commands. It records reminders and user-reported actions. */
import {requireSession, requireCsrf, rateLimit} from "./auth.mjs";
import {HttpError, exactFields, json, readJson} from "./http.mjs";

export const BUMP_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS bump_services (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, channel_url TEXT NOT NULL, cooldown_minutes INTEGER NOT NULL CHECK(cooldown_minutes BETWEEN 15 AND 10080), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), next_due_at INTEGER NOT NULL, last_completed_at INTEGER, last_reminder_due_at INTEGER, reminder_status TEXT NOT NULL DEFAULT 'none', archived_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS bump_service_due ON bump_services(enabled,next_due_at) WHERE archived_at IS NULL",
  "CREATE TABLE IF NOT EXISTS bump_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, service_id TEXT NOT NULL, event TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '')",
  "CREATE INDEX IF NOT EXISTS bump_audit_recent ON bump_audit(at DESC)",
  "CREATE TABLE IF NOT EXISTS bump_scheduler_runs (id INTEGER PRIMARY KEY CHECK(id=1), last_tick_at INTEGER NOT NULL, attempted INTEGER NOT NULL, sent INTEGER NOT NULL, failed INTEGER NOT NULL, webhook_configured INTEGER NOT NULL CHECK(webhook_configured IN (0,1)))"
];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER = /^\d{17,20}$/;

function checkOwner(env, session) {
  if (!OWNER.test(env.BUMP_MANAGER_OWNER_ID || "")) throw new HttpError(503, "owner_setup_required", "The manager owner ID must be configured in Cloudflare.");
  if (session.user.id !== env.BUMP_MANAGER_OWNER_ID) throw new HttpError(403, "owner_only", "This manager is private.");
}
async function authorized(request, env, mutation) {
  const session = await requireSession(request, env);
  checkOwner(env, session);
  if (new URL(request.url).origin !== (env.SITE_ORIGIN || "")) throw new HttpError(403, "wrong_host", "Use the main Lobby website.");
  if (mutation) {
    requireCsrf(request, env, session);
    await rateLimit(env, "bump-manager:" + session.user.id, 80, 3600);
  }
  return session;
}
async function exists(env) {
  if (!env.DB) throw new HttpError(503, "database_unavailable", "The website database is unavailable.");
  const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bump_services'").first();
  return Boolean(row);
}
async function ready(env) {
  if (!await exists(env)) throw new HttpError(503, "manager_setup_pending", "Initialize the private manager before adding services.");
}
async function audit(env, id, event, at, detail = "") {
  await env.DB.prepare("INSERT INTO bump_audit(service_id,event,at,detail) VALUES(?,?,?,?)").bind(id,event,at,detail).run();
}
function validateInput(data) {
  exactFields(data, ["name","channelUrl","cooldownMinutes"]);
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!/^[a-z0-9][a-z0-9 ._'()-]{1,49}$/i.test(name)) throw new HttpError(400, "invalid_name", "Enter a service name of 2-50 characters.");
  if (!Number.isSafeInteger(data.cooldownMinutes) || data.cooldownMinutes < 15 || data.cooldownMinutes > 10080) {
    throw new HttpError(400,"invalid_cooldown","Cooldown must be between 15 and 10080 minutes.");
  }
  let url;
  try { url = new URL(data.channelUrl); } catch { throw new HttpError(400,"invalid_channel","Provide a Discord channel link."); }
  if (url.origin !== "https://discord.com" || !/^\/channels\/\d{17,20}\/\d{17,20}\/?$/.test(url.pathname) ||
      url.username || url.password || url.search || url.hash) {
    throw new HttpError(400,"invalid_channel","Use a Discord server channel link (discord.com/channels/server/channel).");
  }
  return {name,channelUrl:url.href,cooldownMinutes:data.cooldownMinutes};
}
async function findService(env, id) {
  if (!ID.test(id)) throw new HttpError(404, "not_found", "Service not found.");
  const row = await env.DB.prepare("SELECT * FROM bump_services WHERE id=? AND archived_at IS NULL").bind(id).first();
  if (!row) throw new HttpError(404, "not_found", "Service not found.");
  return row;
}
function serialize(row) {
  return {
    id:row.id,name:row.name,channelUrl:row.channel_url,cooldownMinutes:row.cooldown_minutes,
    enabled:Boolean(row.enabled),nextDueAt:row.next_due_at,lastCompletedAt:row.last_completed_at,
    reminderStatus:row.reminder_status,lastReminderDueAt:row.last_reminder_due_at,updatedAt:row.updated_at
  };
}
export async function handleBumpManager(request, env, path) {
  const isRead = request.method === "GET";
  await authorized(request,env,!isRead);
  if (path === "/api/bump-manager" && isRead) {
    if (!await exists(env)) return json({setupPending:true,services:[],events:[],serverTime:Date.now()});
    const services = await env.DB.prepare("SELECT * FROM bump_services WHERE archived_at IS NULL ORDER BY next_due_at ASC, name ASC LIMIT 100").all();
    const events = await env.DB.prepare("SELECT service_id AS serviceId,event,at,detail FROM bump_audit ORDER BY id DESC LIMIT 60").all();
    const schedulerTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bump_scheduler_runs'").first();
    const scheduler = schedulerTable ? await env.DB.prepare("SELECT last_tick_at AS lastTickAt,attempted,sent,failed,webhook_configured AS webhookConfigured FROM bump_scheduler_runs WHERE id=1").first() : null;
    return json({setupPending:false,services:(services.results||[]).map(serialize),events:events.results||[],scheduler,serverTime:Date.now()});
  }
  if (path === "/api/bump-manager/setup" && request.method === "POST") {
    exactFields(await readJson(request,64),[]);
    for (const statement of BUMP_SCHEMA) await env.DB.prepare(statement).run();
    return json({ok:true});
  }
  await ready(env);
  if (path === "/api/bump-manager/services" && request.method === "POST") {
    const valid = validateInput(await readJson(request,512));
    const now = Date.now(), id = crypto.randomUUID();
    // Start conservatively after one cooldown. Do not assume a prior bump was successful.
    try {
      await env.DB.prepare("INSERT INTO bump_services(id,name,channel_url,cooldown_minutes,enabled,next_due_at,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)")
        .bind(id,valid.name,valid.channelUrl,valid.cooldownMinutes,now + valid.cooldownMinutes * 60000,now,now).run();
    } catch (error) {
      if (/UNIQUE|constraint/i.test(String(error))) throw new HttpError(409,"service_exists","A service with that name already exists.");
      throw error;
    }
    await audit(env,id,"created",now,"Initial schedule estimated from registration, not evidence of a completed bump.");
    return json({ok:true,id},201);
  }
  const match = /^\/api\/bump-manager\/services\/([^/]+)\/(complete|state|edit|archive)$/.exec(path);
  if (!match || request.method !== "POST") throw new HttpError(404,"not_found","That manager action does not exist.");
  const id = match[1], action = match[2], row = await findService(env,id);
  const body = await readJson(request,512);
  const now = Date.now();
  if (action === "complete") {
    exactFields(body,[]);
    if (!row.enabled) throw new HttpError(409,"paused","Resume this service before marking an action.");
    const due = now + row.cooldown_minutes * 60000;
    await env.DB.prepare("UPDATE bump_services SET last_completed_at=?,next_due_at=?,last_reminder_due_at=NULL,reminder_status='none',updated_at=? WHERE id=?")
      .bind(now,due,now,id).run();
    await audit(env,id,"owner_marked_complete",now,"Owner report only; not independently verified.");
  } else if (action === "state") {
    exactFields(body,["enabled"]);
    if (typeof body.enabled !== "boolean") throw new HttpError(400,"invalid_state","Choose enabled or paused.");
    await env.DB.prepare("UPDATE bump_services SET enabled=?,updated_at=? WHERE id=?").bind(body.enabled?1:0,now,id).run();
    await audit(env,id,body.enabled?"resumed":"paused",now);
  } else if (action === "edit") {
    const valid = validateInput(body);
    const due = row.last_completed_at ? Math.max(now,row.last_completed_at+valid.cooldownMinutes*60000):row.next_due_at;
    try {
      await env.DB.prepare("UPDATE bump_services SET name=?,channel_url=?,cooldown_minutes=?,next_due_at=?,updated_at=? WHERE id=?")
        .bind(valid.name,valid.channelUrl,valid.cooldownMinutes,due,now,id).run();
    } catch (error) {
      if (/UNIQUE|constraint/i.test(String(error))) throw new HttpError(409,"service_exists","A service with that name already exists.");
      throw error;
    }
    await audit(env,id,"updated",now,"Service settings changed.");
  } else if (action === "archive") {
    exactFields(body,[]);
    await env.DB.prepare("UPDATE bump_services SET archived_at=?,enabled=0,updated_at=? WHERE id=?").bind(now,now,id).run();
    await audit(env,id,"archived",now);
  }
  return json({ok:true});
}
