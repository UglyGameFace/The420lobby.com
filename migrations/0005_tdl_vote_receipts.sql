-- Independently verified TheDiscordList server upvote receipts.
-- Raw webhook bodies, user IDs and signature secrets must never be persisted.
-- Delivery IDs are stable across retries and prevent duplicate vote counts.
CREATE TABLE IF NOT EXISTS tdl_vote_receipts (
  delivery_id TEXT PRIMARY KEY NOT NULL,
  listing_id TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tdl_votes_recent
  ON tdl_vote_receipts(listing_id, received_at DESC);
