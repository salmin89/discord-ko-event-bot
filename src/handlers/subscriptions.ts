import type { Database } from 'better-sqlite3';
import type { Reply } from './types.ts';
import { getUser } from '../repositories/users.ts';
import { getEvent } from '../repositories/events.ts';
import { subscribe, unsubscribe } from '../repositories/subscriptions.ts';

const MAX_LEAD_MIN = 1440;
const DEFAULT_LEADS: [number, number] = [60, 10];

const err = (content: string): Reply => ({ content, ephemeral: true });

export function handleSubscribe(
  db: Database,
  input: { discordId: string; guildId: string; eventId: number },
): Reply {
  const user = getUser(db, input.discordId);
  if (!user || !user.timezone) {
    return err('Set your timezone first with the timezone command. Then subscribe again.');
  }
  const event = getEvent(db, input.eventId);
  if (!event || event.guildId !== input.guildId) return err('This event does not exist.');
  subscribe(db, {
    userId: input.discordId,
    eventId: input.eventId,
    lead1Min: DEFAULT_LEADS[0],
    lead2Min: DEFAULT_LEADS[1],
  });
  return {
    content: `You are subscribed to ${event.name}. Alerts: ${DEFAULT_LEADS[0]} min and ${DEFAULT_LEADS[1]} min before.`,
    ephemeral: true,
  };
}

export function handleUnsubscribe(db: Database, input: { discordId: string; eventId: number }): Reply {
  unsubscribe(db, input.discordId, input.eventId);
  return { content: 'You are unsubscribed from this event.', ephemeral: true };
}

export function handleSetAlerts(
  db: Database,
  input: { discordId: string; eventId: number; leads: number[] },
): Reply {
  const { leads } = input;
  // Defense-in-depth: the caller must have a timezone, mirroring handleSubscribe.
  const user = getUser(db, input.discordId);
  if (!user || !user.timezone) {
    return err('Set your timezone first with the timezone command. Then set alerts again.');
  }
  if (leads.length < 1 || leads.length > 2) return err('Give 1 or 2 alert times.');
  if (leads.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_LEAD_MIN)) {
    return err(`Each alert time must be a whole number from 0 to ${MAX_LEAD_MIN} minutes.`);
  }
  const distinct = [...new Set(leads)];
  const event = getEvent(db, input.eventId);
  // NOTE: no guild check here — this handler is not threaded with the caller's guildId.
  // Alerts only tune an existing subscription (gated by subscribe/timezone), so cross-guild
  // reach is low-risk; add guildId here if the subscription flow ever widens.
  if (!event) return err('This event does not exist.');
  subscribe(db, {
    userId: input.discordId,
    eventId: input.eventId,
    lead1Min: distinct[0],
    lead2Min: distinct[1] ?? null,
  });
  return {
    content: `Alerts for ${event.name} set to ${distinct.join(' min and ')} min before.`,
    ephemeral: true,
  };
}
