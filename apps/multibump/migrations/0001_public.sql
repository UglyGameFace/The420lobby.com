-- Dedicated MultiBump database. Never apply this to the Lobby/Shield database.
PRAGMA foreign_keys = ON;
CREATE TABLE mb_oauth (state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE mb_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL, oauth_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX mb_sessions_expiry ON mb_sessions(expires_at);
CREATE TABLE mb_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE mb_guilds (
  guild_id TEXT PRIMARY KEY, name TEXT NOT NULL, channel_id TEXT NOT NULL,
  role_id TEXT, paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  monitor_cursor TEXT, monitor_before TEXT, monitor_head TEXT, monitor_checked_at INTEGER, monitor_status TEXT NOT NULL DEFAULT 'waiting',
  poll_after INTEGER NOT NULL DEFAULT 0, poll_lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE mb_services (
  guild_id TEXT NOT NULL REFERENCES mb_guilds(guild_id) ON DELETE CASCADE,
  provider TEXT NOT NULL, cooldown_minutes INTEGER NOT NULL CHECK(cooldown_minutes BETWEEN 15 AND 10080),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), next_due_at INTEGER NOT NULL,
  last_confirmed_at INTEGER, last_reported_at INTEGER, last_reminder_due_at INTEGER,
  reminder_status TEXT NOT NULL DEFAULT 'none', updated_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id,provider)
);
CREATE INDEX mb_services_due ON mb_services(enabled,next_due_at);
CREATE TABLE mb_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL REFERENCES mb_guilds(guild_id) ON DELETE CASCADE,
  provider TEXT, event TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX mb_events_guild ON mb_events(guild_id,id DESC);
CREATE TABLE mb_receipts (
  guild_id TEXT NOT NULL REFERENCES mb_guilds(guild_id) ON DELETE CASCADE,
  provider TEXT NOT NULL, source_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('bump','vote')),
  at INTEGER NOT NULL, PRIMARY KEY(guild_id,provider,source_id)
);
CREATE INDEX mb_receipts_guild ON mb_receipts(guild_id,kind,at);
CREATE TABLE mb_integrations (
  guild_id TEXT NOT NULL REFERENCES mb_guilds(guild_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider='tdl'), secret_cipher TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(guild_id,provider)
);
CREATE TABLE mb_vote_links (
  guild_id TEXT NOT NULL REFERENCES mb_guilds(guild_id) ON DELETE CASCADE,
  provider TEXT NOT NULL, listing_url TEXT NOT NULL,
  PRIMARY KEY(guild_id,provider)
);
CREATE TABLE mb_interactions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE mb_runtime (key TEXT PRIMARY KEY, value TEXT NOT NULL);
