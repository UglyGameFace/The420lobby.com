-- Additive Spark Relay scoreboard; uses the existing Cloudflare D1 / cheers_rounds.
-- Can also be installed automatically by a signed-in first-game join.
CREATE TABLE IF NOT EXISTS cheers_sparks (
  round_id INTEGER NOT NULL REFERENCES cheers_rounds(id) ON DELETE CASCADE,
  beat INTEGER NOT NULL CHECK(beat BETWEEN 0 AND 9),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK(points BETWEEN 70 AND 190),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(round_id,beat)
);
CREATE INDEX IF NOT EXISTS cheers_sparks_user ON cheers_sparks(user_id,created_at);
