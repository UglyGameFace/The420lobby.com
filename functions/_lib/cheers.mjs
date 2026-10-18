import {requireSession, requireCsrf, rateLimit} from "./auth.mjs";
import {HttpError, exactFields, json, readJson} from "./http.mjs";
const ROUND_MS=42000;
async function readState(env,now) {
  if(!env.DB)throw new HttpError(503,"setup_required","Shared Cheers is not configured.");
  const row=await env.DB.prepare("SELECT r.id,r.started_at AS startedAt,r.ends_at AS endsAt,(SELECT COUNT(*) FROM cheers_participants p WHERE p.round_id=r.id) AS participants FROM cheers_rounds r WHERE r.ends_at>? ORDER BY r.id LIMIT 1").bind(now).first();
  return {round:row?{id:row.id,startedAt:row.startedAt,endsAt:row.endsAt,participants:row.participants}:null,serverTime:now};
}
export async function getCheers(_request,env){return json(await readState(env,Date.now()));}
export async function joinCheers(request,env){
  const session=await requireSession(request,env);
  requireCsrf(request,env,session);
  exactFields(await readJson(request,128),[]);
  await rateLimit(env,"cheers:"+session.user.id,18,3600);
  const now=Date.now();
  await env.DB.prepare("INSERT INTO cheers_rounds(started_at,ends_at) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM cheers_rounds WHERE ends_at>?)").bind(now,now+ROUND_MS,now).run();
  const current=await env.DB.prepare("SELECT id FROM cheers_rounds WHERE ends_at>? ORDER BY id LIMIT 1").bind(now).first();
  if(!current)throw new HttpError(409,"round_ended","That round just ended. Try again.");
  const result=await env.DB.prepare("INSERT INTO cheers_participants(round_id,user_id,joined_at) VALUES(?,?,?) ON CONFLICT(round_id,user_id) DO NOTHING").bind(current.id,session.user.id,now).run();
  await env.DB.prepare("DELETE FROM cheers_rounds WHERE ends_at<?").bind(now-8*86400000).run();
  return json({...await readState(env,now),joined:Number(result.meta?.changes||0)>0});
}
