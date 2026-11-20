import type { Database } from 'better-sqlite3';
import type { Reply } from './types.ts';
import { isValidTimezone } from '../domain/time.ts';
import { setTimezone } from '../repositories/users.ts';
import { autoSubscribeToDefaults } from '../repositories/subscriptions.ts';

const DEFAULT_LEADS: [number, number] = [60, 10];

export function handleSetTimezone(
  db: Database,
  input: { discordId: string; guildId: string; tz: string },
): Reply {
  if (!isValidTimezone(input.tz)) {
    return { content: `"${input.tz}" is not a valid timezone. Use an IANA name, for example Europe/Berlin.`, ephemeral: true };
  }
  setTimezone(db, input.discordId, input.tz);
  autoSubscribeToDefaults(db, input.guildId, input.discordId, DEFAULT_LEADS);
  return { content: `Your timezone is now ${input.tz}.`, ephemeral: true };
}
