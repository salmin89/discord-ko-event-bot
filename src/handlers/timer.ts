import type { Database } from 'better-sqlite3';
import type { Reply } from './types.ts';
import { getUser } from '../repositories/users.ts';
import { getEvent } from '../repositories/events.ts';
import { getConfig } from '../repositories/guildConfig.ts';
import { listSubscriptions } from '../repositories/subscriptions.ts';
import { nextOccurrences } from '../domain/recurrence.ts';
import { formatCountdown, renderLocal } from '../domain/time.ts';

const WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

export function handleTimer(
  db: Database,
  input: { discordId: string; guildId: string; nowMs: number },
): Reply {
  const user = getUser(db, input.discordId);
  const tz = user?.timezone || 'UTC';
  const serverTz = getConfig(db, input.guildId)?.serverTz || 'UTC';
  const rows: { name: string; at: number }[] = [];
  for (const sub of listSubscriptions(db, input.discordId)) {
    const ev = getEvent(db, sub.eventId);
    if (!ev || ev.guildId !== input.guildId) continue;
    const at =
      ev.type === 'adhoc'
        ? ev.occurrenceMs
        : nextOccurrences(ev.slots, serverTz, input.nowMs, WINDOW_MS)[0];
    if (at === undefined || at < input.nowMs) continue;
    rows.push({ name: ev.name, at });
  }
  if (rows.length === 0) {
    return { content: 'You are not subscribed to any upcoming events. Use the subscribe command to join one.', ephemeral: true };
  }
  rows.sort((a, b) => a.at - b.at);
  const lines = rows.map((r) => `${r.name}: in ${formatCountdown(r.at - input.nowMs)} (${renderLocal(r.at, tz)} your time)`);
  return { content: lines.join('\n'), ephemeral: true };
}
