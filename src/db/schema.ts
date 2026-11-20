import type { Database } from 'better-sqlite3';

// All instants are INTEGER milliseconds. Discord ids are TEXT (snowflakes exceed 2^53).
export function applySchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT,
      server_tz TEXT,
      admin_role_id TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      timezone TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('fixed', 'adhoc')),
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      default_subscribed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS event_slots (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      time_of_day TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adhoc_times (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      occurrence_ms INTEGER NOT NULL,
      creator_tz TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT NOT NULL,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      lead1_min INTEGER,
      lead2_min INTEGER,
      PRIMARY KEY (user_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS sent_reminders (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      occurrence_ms INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      lead_min INTEGER NOT NULL,
      UNIQUE (event_id, occurrence_ms, user_id, lead_min)
    );
  `);
}
