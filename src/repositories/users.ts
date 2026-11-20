import type { Database } from 'better-sqlite3';

export type User = { discordId: string; timezone: string };

export function setTimezone(db: Database, discordId: string, tz: string): void {
  db.prepare(
    `INSERT INTO users (discord_id, timezone, created_at) VALUES (?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET timezone = excluded.timezone`,
  ).run(discordId, tz, Date.now());
}

export function getUser(db: Database, discordId: string): User | undefined {
  const row = db.prepare('SELECT discord_id, timezone FROM users WHERE discord_id = ?').get(discordId) as
    | { discord_id: string; timezone: string }
    | undefined;
  return row && { discordId: row.discord_id, timezone: row.timezone };
}
