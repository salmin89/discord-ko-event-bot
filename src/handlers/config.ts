import type { Database } from 'better-sqlite3';
import type { Reply } from './types.ts';
import { isAdmin, type AdminInput } from '../domain/permissions.ts';
import { isValidTimezone } from '../domain/time.ts';
import { setChannel, setServerTz, setAdminRole } from '../repositories/guildConfig.ts';

const denied = (): Reply => ({ content: 'You need admin permission to do this.', ephemeral: true });

export function handleSetChannel(
  db: Database,
  adminCtx: AdminInput,
  args: { guildId: string; channelId: string },
): Reply {
  if (!isAdmin(adminCtx)) return denied();
  setChannel(db, args.guildId, args.channelId);
  return { content: `Reminder channel set to <#${args.channelId}>.`, ephemeral: true };
}

export function handleSetServerTz(
  db: Database,
  adminCtx: AdminInput,
  args: { guildId: string; tz: string },
): Reply {
  if (!isAdmin(adminCtx)) return denied();
  if (!isValidTimezone(args.tz)) {
    return { content: `"${args.tz}" is not a valid timezone. Use an IANA name, for example Europe/Berlin.`, ephemeral: true };
  }
  setServerTz(db, args.guildId, args.tz);
  return { content: `Server timezone set to ${args.tz}.`, ephemeral: true };
}

export function handleSetAdminRole(
  db: Database,
  adminCtx: AdminInput,
  args: { guildId: string; roleId: string },
): Reply {
  if (!isAdmin(adminCtx)) return denied();
  setAdminRole(db, args.guildId, args.roleId);
  return { content: `Admin role set to <@&${args.roleId}>.`, ephemeral: true };
}
