/* Genuine, unlinked website CHEERS countdown: never creates Dank Shield /toke
 * sessions, sends role pings or rewards game scores. D1's existing Arcade DB
 * is the sole storage owner. No extra database or user-visible setup required.
 */
import {requireSession, requireCsrf, rateLimit} from "./auth.mjs";
import {HttpError, exactFields, json, readJson} from "./http.mjs";

const ROUND_MS=42000;
const DAY_MS=86400000;

// All statements are additive, stable and idempotent. Only an authenticated
// first POST may create *missing* CHEERS tables. Anonymous GETs never write.
// Existing production D1 data, Arcade tables and score rules are untouched.
const SCHEMA=[
  "CREATE TABLE IF NOT EXISTS cheers_rounds (id INTEGER PRIMARY KEY AUTOINCREMENT,started_at INTEGER NOT NULL,ends_at INTEGER NOT NULL CHECK(ends_at>started_at))",
  "CREATE INDEX IF NOT EXISTS cheers_round_expiry ON cheers_rounds(ends_at)",
  "CREATE TABLE IF NOT EXISTS cheers_participants (round_id INTEGER NOT NULL REFERENCES cheers_rounds(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,joined_at INTEGER NOT NULL,PRIMARY KEY(round_id,user_id))",
  "CREATE INDEX IF NOT EXISTS cheers_user_events ON cheers_participants(user_id,joined_at)"
];

async function schemaReady(env){
  if(!env.DB)throw new HttpError(503,"setup_required","The shared lounge is not configured.");
  const rows=await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cheers_rounds','cheers_participants')"
  ).all();
  return new Set((rows.results||[]).map(row=>row.name)).size===2;
}

async function prepareFirstRound(env){
  if(await schemaReady(env))return;
  for(const sql of SCHEMA)await env.DB.prepare(sql).run();
  if(!await schemaReady(env))
    throw new HttpError(503,"cheers_setup_pending","Shared Cheers is being prepared. Try again.");
}

async function state(env,now){
  if(!await schemaReady(env))return {round:null,serverTime:now,setupPending:true};
  const row=await env.DB.prepare(
    "SELECT r.id,r.started_at AS startedAt,r.ends_at AS endsAt,"+
    "(SELECT COUNT(*) FROM cheers_participants p WHERE p.round_id=r.id) AS participants "+
    "FROM cheers_rounds r WHERE r.ends_at>? ORDER BY r.id LIMIT 1"
  ).bind(now).first();
  return {
    round:row?{id:row.id,startedAt:row.startedAt,endsAt:row.endsAt,participants:row.participants}:null,
    serverTime:now,setupPending:false
  };
}
export async function getCheers(_request,env){
  return json(await state(env,Date.now()));
}
export async function joinCheers(request,env){
  // IMPORTANT: authorization and CSRF checks precede any optional DDL.
  const session=await requireSession(request,env);
  requireCsrf(request,env,session);
  exactFields(await readJson(request,128),[]);
  await rateLimit(env,"cheers:"+session.user.id,18,3600);

  await prepareFirstRound(env);
  const now=Date.now();
  await env.DB.prepare(
    "INSERT INTO cheers_rounds(started_at,ends_at) "+
    "SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM cheers_rounds WHERE ends_at>?)"
  ).bind(now,now+ROUND_MS,now).run();
  const current=await env.DB.prepare(
    "SELECT id FROM cheers_rounds WHERE ends_at>? ORDER BY id LIMIT 1"
  ).bind(now).first();
  if(!current)throw new HttpError(409,"round_ended","That round just ended. Try again.");
  const result=await env.DB.prepare(
    "INSERT INTO cheers_participants(round_id,user_id,joined_at) VALUES(?,?,?) "+
    "ON CONFLICT(round_id,user_id) DO NOTHING"
  ).bind(current.id,session.user.id,now).run();
  await env.DB.prepare("DELETE FROM cheers_rounds WHERE ends_at<?").bind(now-8*DAY_MS).run();
  return json({...await state(env,now),joined:Number(result.meta?.changes||0)>0});
}
