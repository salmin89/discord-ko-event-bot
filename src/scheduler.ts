import type { Database } from 'better-sqlite3';
import { computeDue } from './domain/reminders.ts';
import type { EventWithSlots, SubscriptionWithUserTz } from './domain/reminders.ts';
import { formatCountdown, renderLocal } from './domain/time.ts';
import { listEvents } from './repositories/events.ts';
import { getConfig } from './repositories/guildConfig.ts';
import { markSent, wasSent } from './repositories/sentReminders.ts';
import { listSubscribersForEvent } from './repositories/subscriptions.ts';
import { getUser } from './repositories/users.ts';

export type Sender = (userId: string, content: string) => Promise<void>;

const MIN = 60_000;

function gather(db: Database): { events: EventWithSlots[]; subscriptions: SubscriptionWithUserTz[] } {
  const events: EventWithSlots[] = [];
  const subscriptions: SubscriptionWithUserTz[] = [];
  const guildIds = (db.prepare('SELECT DISTINCT guild_id FROM events').all() as { guild_id: string }[]).map(
    (r) => r.guild_id,
  );
  const tzCache = new Map<string, string | null>();
  for (const guildId of guildIds) {
    const serverTz = getConfig(db, guildId)?.serverTz ?? null;
    for (const e of listEvents(db, guildId)) {
      if (e.type === 'fixed') {
        if (!serverTz) continue; // no server timezone: slot times cannot be placed in time
        events.push({ type: 'fixed', id: e.id, name: e.name, slots: e.slots, serverTz });
      } else if (e.occurrenceMs !== undefined) {
        events.push({ type: 'adhoc', id: e.id, name: e.name, occurrenceMs: e.occurrenceMs });
      } else {
        continue;
      }
      for (const s of listSubscribersForEvent(db, e.id)) {
        if (s.lead1Min === null) continue;
        if (!tzCache.has(s.userId)) tzCache.set(s.userId, getUser(db, s.userId)?.timezone ?? null);
        const userTz = tzCache.get(s.userId);
        if (!userTz) continue; // user has no timezone set
        subscriptions.push({
          userId: s.userId,
          eventId: s.eventId,
          userTz,
          lead1Min: s.lead1Min,
          ...(s.lead2Min !== null ? { lead2Min: s.lead2Min } : {}),
        });
      }
    }
  }
  return { events, subscriptions };
}

export async function tick(db: Database, rawNowMs: number, send: Sender): Promise<void> {
  const nowMs = Math.floor(rawNowMs / MIN) * MIN;
  const { events, subscriptions } = gather(db);
  const tzByUser = new Map(subscriptions.map((s) => [s.userId, s.userTz]));
  const due = computeDue({
    nowMs,
    events,
    subscriptions,
    wasSent: (eventId, occurrenceMs, userId, leadMin) => wasSent(db, eventId, occurrenceMs, userId, leadMin),
  });

  const seen = new Set<string>();
  for (const d of due) {
    const key = `${d.eventId}:${d.occurrenceMs}:${d.userId}:${d.leadMin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tz = tzByUser.get(d.userId) ?? 'UTC';
    const content = `⏳ ${formatCountdown(d.occurrenceMs - nowMs)} left until ${d.eventName} (starts ${renderLocal(d.occurrenceMs, tz)} ${tz}).`;
    try {
      await send(d.userId, content);
    } catch (err) {
      // DMs may be closed. Do not mark as sent, so a later tick can retry. No channel fallback.
      console.error(`Reminder DM to ${d.userId} for event ${d.eventId} failed:`, err);
      continue;
    }
    markSent(db, d.eventId, d.occurrenceMs, d.userId, d.leadMin);
  }
}

export function startScheduler(db: Database, send: Sender): NodeJS.Timeout {
  // Re-entrancy guard: a long-running tick (many DMs under rate limits) must not
  // overlap with the next interval, or not-yet-marked users could be double-sent.
  let running = false;
  return setInterval(() => {
    if (running) return;
    running = true;
    tick(db, Date.now(), send)
      .catch((err) => console.error('Scheduler tick failed:', err))
      .finally(() => {
        running = false;
      });
  }, 60_000);
}
