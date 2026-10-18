CREATE TABLE cheers_rounds (id INTEGER PRIMARY KEY AUTOINCREMENT,started_at INTEGER NOT NULL,ends_at INTEGER NOT NULL CHECK(ends_at>started_at));
CREATE INDEX cheers_round_expiry ON cheers_rounds(ends_at);
CREATE TABLE cheers_participants (round_id INTEGER NOT NULL REFERENCES cheers_rounds(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,joined_at INTEGER NOT NULL,PRIMARY KEY(round_id,user_id));
CREATE INDEX cheers_user_events ON cheers_participants(user_id,joined_at);
