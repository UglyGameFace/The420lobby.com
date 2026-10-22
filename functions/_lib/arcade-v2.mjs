import {HttpError, exactFields, json, readJson} from "./http.mjs";
import {hash, publicUser, randomToken, rateLimit, requireCsrf, requireSession} from "./auth.mjs";

export const NEW_GAME_IDS = ["sesh-invaders", "bong-blitz", "canna-runner"];
export const ARCADE_V2_RULES = "arcade-v2:1";
const RUN_TTL_MS = 15 * 60 * 1000;
const DIFFICULTY = {Chill: 0.75, Normal: 1, Fever: 1.5};
const allowed = value => NEW_GAME_IDS.includes(value);
const invalid = () => { throw new HttpError(422, "invalid_run", "This result could not be recorded. Start another round."); };

// Game simulations currently use unseeded browser randomness. These checks reject
// malformed/impossible submissions but are NOT deterministic gameplay verification.
// Never label these results "replay-verified" or grant prizes/roles from them.
export function validateCommunityResult(game, body, wallElapsedMs) {
  exactFields(body, ["score", "stats", "elapsedMs", "difficulty"]);
  if (!allowed(game) || !Object.hasOwn(DIFFICULTY, body.difficulty)) invalid();
  const {score, stats, elapsedMs, difficulty} = body;
  if (!Number.isSafeInteger(score) || score < 0 || score > 1000000 ||
      !Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > RUN_TTL_MS ||
      !Number.isFinite(wallElapsedMs) || wallElapsedMs < 1200 ||
      elapsedMs > wallElapsedMs + 8000 ||
      !stats || typeof stats !== "object" || Array.isArray(stats) ||
      Object.keys(stats).length > 12) invalid();
  for (const [key, value] of Object.entries(stats)) {
    if (!/^[a-zA-Z]{1,32}$/.test(key) || !Number.isFinite(value) ||
        value < 0 || value > 10000000) invalid();
  }
  const seconds = Math.max(1, elapsedMs / 1000);
  const multiplier = DIFFICULTY[difficulty];
  if (game === "bong-blitz") {
    const perfect = stats.perfectHits, nice = stats.niceHits, misses = stats.misses;
    if (![perfect, nice, misses].every(Number.isSafeInteger) ||
        perfect + nice + misses > 120 ||
        elapsedMs < 34500 || elapsedMs > 35500 || wallElapsedMs < 30000 ||
        score > Math.round((perfect * 270 + nice * 175 + (110 - perfect - nice) * 35) * multiplier)) invalid();
  } else if (game === "canna-runner") {
    const trichomes = stats.trichomes, distance = stats.distance;
    if (![trichomes, distance].every(Number.isSafeInteger) ||
        distance > seconds * 125 + 100 ||
        trichomes > distance / 27 + 3 ||
        score > Math.round(trichomes * 300 * multiplier + seconds * 250 * multiplier)) invalid();
  } else {
    if (!Number.isSafeInteger(stats.wave) || !Number.isSafeInteger(stats.cleanKills) ||
        stats.wave > seconds * 4 + 6 ||
        stats.cleanKills > seconds * 15 + 25 ||
        score > Math.round((seconds * 6000 + 1000) * multiplier)) invalid();
  }
  return {score, stats, elapsedMs, difficulty};
}

export async function startArcadeV2Run(request, env) {
  const session = await requireSession(request, env);
  requireCsrf(request, env, session);
  const body = await readJson(request, 1024);
  exactFields(body, ["game"]);
  if (!allowed(body.game)) throw new HttpError(400, "invalid_game", "Choose one of the new arcade cabinets.");
  await rateLimit(env, "v2start:" + session.user.id, 40, 300);
  const now = Date.now(), id = randomToken(), expiresAt = now + RUN_TTL_MS;
  await env.DB.batch([
    env.DB.prepare("UPDATE game_runs SET status = 'abandoned' WHERE user_id = ? AND status = 'active'").bind(session.user.id),
    env.DB.prepare("INSERT INTO game_runs (id, user_id, game, seed, rules_version, status, started_at, expires_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)")
      .bind(id, session.user.id, body.game, randomToken(), ARCADE_V2_RULES, now, expiresAt)
  ]);
  return json({id, game: body.game, startedAt: now, expiresAt}, 201);
}

export async function finishArcadeV2Run(request, env, runId) {
  const session = await requireSession(request, env);
  requireCsrf(request, env, session);
  if (!/^[A-Za-z0-9_-]{43}$/.test(runId)) throw new HttpError(404, "run_not_found", "That round was not found.");
  const body = await readJson(request, 2048);
  const row = await env.DB.prepare("SELECT * FROM game_runs WHERE id = ? AND user_id = ? AND rules_version = ?")
    .bind(runId, session.user.id, ARCADE_V2_RULES).first();
  if (!row) throw new HttpError(404, "run_not_found", "That round was not found.");
  const signature = await hash(JSON.stringify(body));
  if (row.status === "finished") {
    if (row.transcript_hash !== signature) throw new HttpError(409, "run_already_submitted", "This round already has a result.");
    return json(JSON.parse(row.result_json));
  }
  if (row.status !== "active") throw new HttpError(409, "run_abandoned", "A newer round replaced this one.");
  const now = Date.now();
  if (now >= row.expires_at) throw new HttpError(410, "run_expired", "The round expired. Start another.");
  await rateLimit(env, "v2finish:" + session.user.id, 40, 300);
  const checked = validateCommunityResult(row.game, body, now - row.started_at);
  const previous = await env.DB.prepare("SELECT COALESCE(MAX(score), 0) AS best FROM scores s JOIN game_runs r ON r.id = s.run_id WHERE s.user_id = ? AND s.game = ? AND r.rules_version = ?")
    .bind(session.user.id, row.game, ARCADE_V2_RULES).first();
  const result = {id:row.id, game:row.game, score:checked.score, difficulty:checked.difficulty,
    best:Math.max(previous.best, checked.score), isPersonalBest:checked.score > previous.best,
    verification:"discord-account-and-plausibility-only"};
  await env.DB.batch([
    env.DB.prepare("UPDATE game_runs SET status = 'finished', transcript_hash = ?, result_json = ? WHERE id = ? AND user_id = ? AND status = 'active'")
      .bind(signature, JSON.stringify(result), row.id, session.user.id),
    env.DB.prepare("INSERT INTO scores (run_id, user_id, game, score, played_at) SELECT id, user_id, game, ?, ? FROM game_runs WHERE id = ? AND status = 'finished' AND transcript_hash = ? ON CONFLICT(run_id) DO NOTHING")
      .bind(checked.score, now, row.id, signature)
  ]);
  const committed = await env.DB.prepare("SELECT status, transcript_hash, result_json FROM game_runs WHERE id = ?")
    .bind(row.id).first();
  if (committed.status !== "finished" || committed.transcript_hash !== signature) {
    throw new HttpError(409, "run_already_submitted", "The round was replaced or already ended.");
  }
  return json(JSON.parse(committed.result_json));
}

export async function arcadeV2Leaderboards(request, env) {
  if (!env.DB) throw new HttpError(503, "setup_required", "Leaderboards are unavailable right now.");
  const url = new URL(request.url);
  const game = url.searchParams.get("game") || "all";
  const period = url.searchParams.get("period") || "week";
  if ((game !== "all" && !allowed(game)) || !["today","week","all"].includes(period)) {
    throw new HttpError(400, "invalid_filter", "Choose a valid game and timeframe.");
  }
  await rateLimit(env, "v2board:" + (request.headers.get("CF-Connecting-IP") || "local"), 90, 60);
  const since = period === "today" ? Date.now() - 86400000 : period === "week" ? Date.now() - 604800000 : 0;
  const result = await env.DB.prepare(
    "WITH ranked AS (SELECT s.user_id,s.game,s.score,s.played_at,s.run_id, ROW_NUMBER() OVER (PARTITION BY s.user_id,s.game ORDER BY s.score DESC,s.played_at ASC,s.run_id ASC) AS position " +
    "FROM scores s JOIN game_runs r ON r.id = s.run_id WHERE r.rules_version = ? AND (? = 'all' OR s.game = ?) AND s.played_at >= ?) " +
    "SELECT u.id,u.username,u.avatar_url,r.game,r.score,r.played_at FROM ranked r JOIN users u ON u.id=r.user_id WHERE r.position=1 " +
    "ORDER BY r.score DESC,r.played_at ASC LIMIT 50"
  ).bind(ARCADE_V2_RULES, game, game, since).all();
  return json({game,period,verification:"discord-account-and-plausibility-only",
    entries:result.results.map((r,i)=>({rank:i+1,game:r.game,score:r.score,playedAt:r.played_at,user:publicUser(r)})),
    updatedAt:Date.now()});
}
