import type { Database } from 'better-sqlite3';
import type { Reply } from './types.ts';
import { isValidTimezone } from '../domain/time.ts';
import { getUser, setTimezone } from '../repositories/users.ts';
import { autoSubscribeToDefaults } from '../repositories/subscriptions.ts';

const DEFAULT_LEADS: [number, number] = [60, 10];

export function handleSetTimezone(
  db: Database,
  input: { discordId: string; guildId: string; tz: string },
): Reply {
  if (!isValidTimezone(input.tz)) {
    return { content: `"${input.tz}" is not a valid timezone. Use an IANA name, for example Europe/Berlin.`, ephemeral: true };
  }
  // Auto-subscribe only the first time a user sets their timezone (no prior row),
  // so re-setting a timezone never re-subscribes to opted-out events or resets custom leads.
  const isFirstTime = getUser(db, input.discordId) === undefined;
  setTimezone(db, input.discordId, input.tz);
  if (isFirstTime) {
    autoSubscribeToDefaults(db, input.guildId, input.discordId, DEFAULT_LEADS);
  }
  return { content: `Your timezone is now ${input.tz}.`, ephemeral: true };
}
