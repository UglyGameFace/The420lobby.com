PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL CHECK(length(username) BETWEEN 1 AND 80),
  avatar_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_expiry ON oauth_states(expires_at);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE game_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  seed TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'finished', 'abandoned')),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  transcript_hash TEXT,
  result_json TEXT
);
CREATE UNIQUE INDEX one_active_run ON game_runs(user_id) WHERE status = 'active';
CREATE INDEX runs_user ON game_runs(user_id, started_at DESC);
CREATE TABLE scores (
  run_id TEXT PRIMARY KEY REFERENCES game_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score >= 0 AND score <= 1000000),
  played_at INTEGER NOT NULL
);
CREATE INDEX leaderboard_all ON scores(game, score DESC, played_at ASC);
CREATE INDEX leaderboard_week ON scores(game, played_at, score DESC);
CREATE INDEX scores_user ON scores(user_id, game, score DESC);
CREATE TABLE achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, achievement_id)
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
