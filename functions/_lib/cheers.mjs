/* CHEERS: Spark Relay. Server-authoritative, 42-second cooperative reaction game.
 * Separate from Dank Shield /toke: no bot token, voice-session data, role pings
 * or real-world smoking actions. The client never submits its own score.
 */
import {requireSession, requireCsrf, rateLimit} from "./auth.mjs";
import {HttpError, exactFields, json, readJson} from "./http.mjs";

export const SPARK_RULES=Object.freeze({
  durationMs:42000,firstBeatMs:3000,beatIntervalMs:3800,
  hitWindowMs:950,beatCount:10
});
const DAY_MS=86400000;
const SCHEMA=[
  "CREATE TABLE IF NOT EXISTS cheers_rounds (id INTEGER PRIMARY KEY AUTOINCREMENT,started_at INTEGER NOT NULL,ends_at INTEGER NOT NULL CHECK(ends_at>started_at))",
  "CREATE INDEX IF NOT EXISTS cheers_round_expiry ON cheers_rounds(ends_at)",
  "CREATE TABLE IF NOT EXISTS cheers_participants (round_id INTEGER NOT NULL REFERENCES cheers_rounds(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,joined_at INTEGER NOT NULL,PRIMARY KEY(round_id,user_id))",
  "CREATE INDEX IF NOT EXISTS cheers_user_events ON cheers_participants(user_id,joined_at)",
  "CREATE TABLE IF NOT EXISTS cheers_sparks (round_id INTEGER NOT NULL REFERENCES cheers_rounds(id) ON DELETE CASCADE,beat INTEGER NOT NULL CHECK(beat BETWEEN 0 AND 9),user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,points INTEGER NOT NULL CHECK(points BETWEEN 70 AND 190),created_at INTEGER NOT NULL,PRIMARY KEY(round_id,beat))",
  "CREATE INDEX IF NOT EXISTS cheers_sparks_user ON cheers_sparks(user_id,created_at)"
];

async function tableNames(env){
  if(!env.DB)throw new HttpError(503,"setup_required","Shared Cheers requires the existing Arcade database.");
  const rows=await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cheers_rounds','cheers_participants','cheers_sparks')"
  ).all();
  return new Set((rows.results||[]).map(r=>r.name));
}
async function readyForRound(env){
  const names=await tableNames(env);
  return names.has("cheers_rounds")&&names.has("cheers_participants");
}
async function prepareGame(env){
  // Authenticated POST only. Anonymous GET must never create or modify D1.
  for(const sql of SCHEMA)await env.DB.prepare(sql).run();
  const names=await tableNames(env);
  if(!["cheers_rounds","cheers_participants","cheers_sparks"].every(n=>names.has(n)))
    throw new HttpError(503,"cheers_setup_pending","The shared game is being prepared. Try again.");
}
function summary(hits){
  let teamScore=0,combo=0,maxCombo=0,previous=-2;
  for(const hit of hits){
    teamScore+=hit.points;
    combo=hit.beat===previous+1?combo+1:1;
    maxCombo=Math.max(combo,maxCombo);
    previous=hit.beat;
  }
  return {teamScore,combo,maxCombo,hits:hits.map(hit=>({beat:hit.beat,points:hit.points}))};
}
async function highScore(env,now,gameReady){
  if(!gameReady)return 0;
  const row=await env.DB.prepare(
    "SELECT COALESCE(MAX(total),0) AS best FROM ("+
    "SELECT SUM(s.points) AS total FROM cheers_sparks s JOIN cheers_rounds r ON r.id=s.round_id "+
    "WHERE r.started_at>? GROUP BY s.round_id)"
  ).bind(now-7*DAY_MS).first();
  return row?.best||0;
}
async function state(env,now){
  const names=await tableNames(env);
  const existing=names.has("cheers_rounds")&&names.has("cheers_participants");
  const gameReady=names.has("cheers_sparks");
  const base={round:null,serverTime:now,setupPending:!existing,gameReady,rules:SPARK_RULES};
  if(!existing)return {...base,bestScore:0};
  const row=await env.DB.prepare(
    "SELECT r.id,r.started_at AS startedAt,r.ends_at AS endsAt,"+
    "(SELECT COUNT(*) FROM cheers_participants p WHERE p.round_id=r.id) AS participants "+
    "FROM cheers_rounds r WHERE r.ends_at>? ORDER BY r.id LIMIT 1"
  ).bind(now).first();
  const bestScore=await highScore(env,now,gameReady);
  if(!row)return {...base,bestScore};
  const hits=gameReady?(await env.DB.prepare(
    "SELECT beat,points FROM cheers_sparks WHERE round_id=? ORDER BY beat"
  ).bind(row.id).all()).results:[];
  return {...base,bestScore,round:{
    id:row.id,startedAt:row.startedAt,endsAt:row.endsAt,participants:row.participants,
    ...summary(hits||[])
  }};
}
export async function getCheers(_request,env){
  return json(await state(env,Date.now()));
}
export async function joinCheers(request,env){
  const session=await requireSession(request,env);
  requireCsrf(request,env,session);
  exactFields(await readJson(request,128),[]);
  await rateLimit(env,"cheers:join:"+session.user.id,20,3600);
  await prepareGame(env);
  const now=Date.now();
  await env.DB.prepare(
    "INSERT INTO cheers_rounds(started_at,ends_at) "+
    "SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM cheers_rounds WHERE ends_at>?)"
  ).bind(now,now+SPARK_RULES.durationMs,now).run();
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
export async function sparkCheers(request,env){
  const session=await requireSession(request,env);
  requireCsrf(request,env,session);
  const body=await readJson(request,256);
  exactFields(body,["roundId","beat"]);
  if(!Number.isSafeInteger(body.roundId)||body.roundId<1||
     !Number.isSafeInteger(body.beat)||body.beat<0||body.beat>=SPARK_RULES.beatCount)
    throw new HttpError(400,"invalid_spark","Choose a valid spark and round.");
  await rateLimit(env,"cheers:spark:"+session.user.id,40,60);
  const now=Date.now();
  if(!await readyForRound(env))throw new HttpError(503,"cheers_setup_pending","Start or join a round first.");
  const round=await env.DB.prepare(
    "SELECT r.id,r.started_at AS startedAt,r.ends_at AS endsAt "+
    "FROM cheers_rounds r JOIN cheers_participants p ON p.round_id=r.id "+
    "WHERE r.id=? AND p.user_id=?"
  ).bind(body.roundId,session.user.id).first();
  if(!round)throw new HttpError(403,"not_in_round","Join this round before passing the spark.");
  if(now>=round.endsAt)throw new HttpError(409,"round_ended","This round has ended.");
  const target=round.startedAt+SPARK_RULES.firstBeatMs+body.beat*SPARK_RULES.beatIntervalMs;
  const distance=Math.abs(now-target);
  if(distance>SPARK_RULES.hitWindowMs)
    throw new HttpError(409,"off_beat","Not quite on beat. Watch for the next glow.");
  // Passes between different members earn a collaboration bonus. Only round
  // aggregates, never member identities, appear in public JSON.
  const previous=body.beat>0?await env.DB.prepare(
    "SELECT user_id FROM cheers_sparks WHERE round_id=? AND beat=?"
  ).bind(round.id,body.beat-1).first():null;
  const base=distance<=170?150:distance<=450?110:70;
  const points=base+(previous&&previous.user_id!==session.user.id?40:0);
  const result=await env.DB.prepare(
    "INSERT INTO cheers_sparks(round_id,beat,user_id,points,created_at) VALUES(?,?,?,?,?) "+
    "ON CONFLICT(round_id,beat) DO NOTHING"
  ).bind(round.id,body.beat,session.user.id,points,now).run();
  const captured=Number(result.meta?.changes||0)>0;
  return json({...await state(env,Date.now()),captured,awarded:captured?points:0});
}
