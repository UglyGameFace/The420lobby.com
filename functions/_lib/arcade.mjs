import {GAME_IDS, GAME_CONFIG, RULES_VERSION, validateRun} from "../../shared/arcade-rules.mjs";
import {HttpError, exactFields, json, readJson} from "./http.mjs";
import {hash, publicUser, randomToken, rateLimit, requireCsrf, requireSession} from "./auth.mjs";

const RUN_LIFETIME_MS = 15 * 60 * 1000;
const isGame = value => GAME_IDS.includes(value);

export async function profile(request, env) {
  const {user} = await requireSession(request, env);
  const [stats, bests, achievements] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS runs, COALESCE(SUM(score), 0) AS totalScore, COUNT(DISTINCT game) AS gamesPlayed FROM scores WHERE user_id = ?").bind(user.id).first(),
    env.DB.prepare(`SELECT game, score, played_at AS playedAt FROM (
      SELECT game, score, played_at, ROW_NUMBER() OVER (PARTITION BY game ORDER BY score DESC, played_at ASC, run_id ASC) AS position
      FROM scores WHERE user_id = ?) WHERE position = 1 ORDER BY game`).bind(user.id).all(),
    env.DB.prepare("SELECT achievement_id AS id, unlocked_at AS unlockedAt FROM achievements WHERE user_id = ? ORDER BY unlocked_at, achievement_id").bind(user.id).all()
  ]);
  return json({user, stats, bests: bests.results, achievements: achievements.results});
}

export async function leaderboards(request, env) {
  if (!env.DB) throw new HttpError(503, "setup_required", "The leaderboard is being connected. Please check back soon.");
  const url = new URL(request.url), game = url.searchParams.get("game") || "sesh-signal", period = url.searchParams.get("period") || "all";
  if (!isGame(game) || !["all", "week"].includes(period)) throw new HttpError(400, "invalid_filter", "Choose an available game and leaderboard period.");
  await rateLimit(env, `boards:${request.headers.get("CF-Connecting-IP") || "local"}`, 90, 60);
  const since = period === "week" ? Date.now() - 7 * 24 * 60 * 60 * 1000 : 0;
  const result = await env.DB.prepare(`WITH personal_bests AS (
      SELECT user_id, score, played_at, run_id,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC, played_at ASC, run_id ASC) AS position
      FROM scores WHERE game = ? AND played_at >= ?
    ) SELECT u.id, u.username, u.avatar_url, b.score, b.played_at
      FROM personal_bests b JOIN users u ON b.user_id = u.id WHERE b.position = 1
      ORDER BY b.score DESC, b.played_at ASC, b.run_id ASC LIMIT 50`).bind(game, since).all();
  return json({game, period, entries: result.results.map((row, index) => ({rank: index + 1, user: publicUser(row), score: row.score, playedAt: row.played_at})), updatedAt: Date.now()});
}

export async function startRun(request, env) {
  const session = await requireSession(request, env);
  requireCsrf(request, env, session);
  const body = await readJson(request, 1024);
  exactFields(body, ["game"]);
  if (!isGame(body.game)) throw new HttpError(400, "invalid_game", "Choose an available arcade game.");
  await rateLimit(env, `start:${session.user.id}`, 12, 300);
  const now = Date.now(), id = randomToken(), seed = randomToken(), expiresAt = now + RUN_LIFETIME_MS;
  // D1 batch is atomic. The unique partial index also enforces one active run per player.
  // Starting over explicitly abandons any previous round, across tabs and devices.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now - 60000),
    env.DB.prepare("UPDATE game_runs SET status = 'abandoned' WHERE user_id = ? AND status = 'active'").bind(session.user.id),
    env.DB.prepare(`INSERT INTO game_runs (id, user_id, game, seed, rules_version, status, started_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`).bind(id, session.user.id, body.game, seed, RULES_VERSION, now, expiresAt)
  ]);
  return json({id, game: body.game, seed, startedAt: now, expiresAt, durationMs: GAME_CONFIG[body.game].durationMs, rulesVersion: RULES_VERSION}, 201);
}

export async function finishRun(request, env, runId) {
  const session = await requireSession(request, env);
  requireCsrf(request, env, session);
  if (!/^[A-Za-z0-9_-]{43}$/.test(runId)) throw new HttpError(404, "run_not_found", "That round could not be found.");
  const body = await readJson(request);
  exactFields(body, ["events", "elapsedMs"]);
  if (!Array.isArray(body.events) || body.events.length > 1000 || !Number.isSafeInteger(body.elapsedMs) || body.elapsedMs < 0 || body.elapsedMs > RUN_LIFETIME_MS) {
    throw new HttpError(400, "invalid_transcript", "This round has an invalid input transcript.");
  }
  const run = await env.DB.prepare("SELECT * FROM game_runs WHERE id = ? AND user_id = ?").bind(runId, session.user.id).first();
  if (!run) throw new HttpError(404, "run_not_found", "That round could not be found.");
  const transcriptHash = await hash(JSON.stringify({events: body.events, elapsedMs: body.elapsedMs}));
  if (run.status === "finished") {
    if (run.transcript_hash !== transcriptHash) throw new HttpError(409, "run_already_submitted", "This round already has a verified result.");
    return json(JSON.parse(run.result_json));
  }
  if (run.status !== "active") throw new HttpError(409, "run_abandoned", "A newer round has replaced this one. Start a new round.");
  const now = Date.now();
  if (run.expires_at <= now) throw new HttpError(410, "run_expired", "This round has expired. Start a new round.");
  if (run.rules_version !== RULES_VERSION) throw new HttpError(409, "rules_changed", "The arcade was updated. Reload and start a new round.");
  await rateLimit(env, `finish:${session.user.id}`, 30, 300);
  let verified;
  try { verified = validateRun(run.game, run.seed, body.events, {elapsedMs: body.elapsedMs, wallElapsedMs: now - run.started_at}); }
  catch { throw new HttpError(422, "invalid_run", "This round could not be verified. Start a new round and try again."); }
  if (!Number.isSafeInteger(verified.score) || verified.score < 0 || verified.score > 1000000) throw new HttpError(422, "invalid_run", "This round could not be verified.");
  const previous = await env.DB.prepare("SELECT COALESCE(MAX(score), 0) AS best FROM scores WHERE user_id = ? AND game = ?").bind(session.user.id, run.game).first();
  const result = {id: run.id, game: run.game, score: verified.score, stats: verified.stats, achievements: verified.achievements,
    best: Math.max(previous.best, verified.score), isPersonalBest: verified.score > previous.best};
  const statements = [
    env.DB.prepare("UPDATE game_runs SET status = 'finished', transcript_hash = ?, result_json = ? WHERE id = ? AND user_id = ? AND status = 'active'")
      .bind(transcriptHash, JSON.stringify(result), run.id, session.user.id),
    env.DB.prepare(`INSERT INTO scores (run_id, user_id, game, score, played_at)
      SELECT id, user_id, game, ?, ? FROM game_runs WHERE id = ? AND status = 'finished' AND transcript_hash = ?
      ON CONFLICT(run_id) DO NOTHING`).bind(verified.score, now, run.id, transcriptHash)
  ];
  for (const achievement of verified.achievements) {
    statements.push(env.DB.prepare(`INSERT INTO achievements (user_id, achievement_id, unlocked_at)
      SELECT user_id, ?, ? FROM game_runs WHERE id = ? AND status = 'finished' AND transcript_hash = ?
      ON CONFLICT(user_id, achievement_id) DO NOTHING`).bind(achievement, now, run.id, transcriptHash));
  }
  await env.DB.batch(statements);
  // Return the winning transaction's stored result, rather than trusting a stale read.
  const committed = await env.DB.prepare("SELECT status, transcript_hash, result_json FROM game_runs WHERE id = ?").bind(run.id).first();
  if (committed.status !== "finished" || committed.transcript_hash !== transcriptHash) throw new HttpError(409, "run_already_submitted", "This round has already ended or been replaced.");
  return json(JSON.parse(committed.result_json));
}
