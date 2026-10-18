-- Opt-in live CHEERS lobby status. Presence expires automatically after 55s.
CREATE TABLE IF NOT EXISTS cheers_presence (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 looking INTEGER NOT NULL DEFAULT 1 CHECK(looking IN (0,1))
);
CREATE INDEX IF NOT EXISTS cheers_presence_expiry ON cheers_presence(expires_at);
