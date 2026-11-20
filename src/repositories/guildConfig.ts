import type { Database } from 'better-sqlite3';

export type GuildConfig = {
  guildId: string;
  channelId: string | null;
  serverTz: string | null;
  adminRoleId: string | null;
};

export function setChannel(db: Database, guildId: string, channelId: string): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, channel_id) VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
  ).run(guildId, channelId);
}

export function setServerTz(db: Database, guildId: string, tz: string): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, server_tz) VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET server_tz = excluded.server_tz`,
  ).run(guildId, tz);
}

export function setAdminRole(db: Database, guildId: string, roleId: string): void {
  db.prepare(
    `INSERT INTO guild_config (guild_id, admin_role_id) VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET admin_role_id = excluded.admin_role_id`,
  ).run(guildId, roleId);
}

export function getConfig(db: Database, guildId: string): GuildConfig | undefined {
  const r = db
    .prepare('SELECT guild_id, channel_id, server_tz, admin_role_id FROM guild_config WHERE guild_id = ?')
    .get(guildId) as
    | { guild_id: string; channel_id: string | null; server_tz: string | null; admin_role_id: string | null }
    | undefined;
  return r && { guildId: r.guild_id, channelId: r.channel_id, serverTz: r.server_tz, adminRoleId: r.admin_role_id };
}
