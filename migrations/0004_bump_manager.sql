-- MultiBump private manager. Independent of Arcade and Cheers tables.
-- Owner-only UI initializes these exact tables when explicitly requested.
CREATE TABLE IF NOT EXISTS bump_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  channel_url TEXT NOT NULL,
  cooldown_minutes INTEGER NOT NULL CHECK(cooldown_minutes BETWEEN 15 AND 10080),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  next_due_at INTEGER NOT NULL,
  last_completed_at INTEGER,
  last_reminder_due_at INTEGER,
  reminder_status TEXT NOT NULL DEFAULT 'none',
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bump_service_due ON bump_services(enabled,next_due_at) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS bump_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL,
  event TEXT NOT NULL,
  at INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS bump_audit_recent ON bump_audit(at DESC);

CREATE TABLE IF NOT EXISTS bump_scheduler_runs (
  id INTEGER PRIMARY KEY CHECK(id=1),
  last_tick_at INTEGER NOT NULL,
  attempted INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  webhook_configured INTEGER NOT NULL CHECK(webhook_configured IN (0,1))
);
