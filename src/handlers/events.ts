import type { Database } from 'better-sqlite3';
import type { Reply } from './types.ts';
import type { Slot } from '../domain/recurrence.ts';
import { isAdmin, type AdminInput } from '../domain/permissions.ts';
import { parseWhen } from '../domain/parseWhen.ts';
import { renderLocal } from '../domain/time.ts';
import { getUser } from '../repositories/users.ts';
import {
  createFixedEvent,
  editFixedEvent,
  removeEvent,
  createAdhocEvent,
  countActiveAdhocByCreator,
  getEvent,
  listEvents,
  type FixedEventEdit,
  type NewFixedEvent,
} from '../repositories/events.ts';
import { listSubscriptions } from '../repositories/subscriptions.ts';

const MAX_ACTIVE_ADHOC = 3;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const err = (content: string): Reply => ({ content, ephemeral: true });
const ok = (content: string): Reply => ({ content, ephemeral: true });
const ADMIN_ONLY = err('Only admins can do this.');

function validateSlots(slots: Slot[]): string | null {
  if (slots.length < 1) return 'A fixed event needs at least 1 slot.';
  for (const s of slots) {
    if (!Number.isInteger(s.dayOfWeek) || s.dayOfWeek < 1 || s.dayOfWeek > 7) {
      return `Day of week "${s.dayOfWeek}" is not valid. Use 1 (Mon) to 7 (Sun).`;
    }
    if (typeof s.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
      return `Time "${s.time}" is not valid. Use HH:mm, from 00:00 to 23:59.`;
    }
  }
  return null;
}

export function handleEventAdd(db: Database, adminCtx: AdminInput, input: NewFixedEvent): Reply {
  if (!isAdmin(adminCtx)) return ADMIN_ONLY;
  const bad = validateSlots(input.slots);
  if (bad) return err(bad);
  const id = createFixedEvent(db, input);
  return ok(`Event "${input.name}" added (id ${id}).`);
}

export function handleEventEdit(
  db: Database,
  adminCtx: AdminInput,
  input: { eventId: number } & FixedEventEdit,
): Reply {
  if (!isAdmin(adminCtx)) return ADMIN_ONLY;
  const event = getEvent(db, input.eventId);
  if (!event || event.type !== 'fixed') return err('This fixed event does not exist.');
  if (input.slots !== undefined) {
    const bad = validateSlots(input.slots);
    if (bad) return err(bad);
  }
  const { eventId, ...edit } = input;
  editFixedEvent(db, eventId, edit);
  return ok(`Event "${edit.name ?? event.name}" updated.`);
}

export function handleEventRemove(db: Database, adminCtx: AdminInput, input: { eventId: number }): Reply {
  if (!isAdmin(adminCtx)) return ADMIN_ONLY;
  const event = getEvent(db, input.eventId);
  if (!event) return err('This event does not exist.');
  removeEvent(db, input.eventId);
  return ok(`Event "${event.name}" removed.`);
}

export function handleAdhocAdd(
  db: Database,
  input: {
    discordId: string;
    guildId: string;
    name: string;
    when: string;
    userTz: string;
    nowMs: number;
    isAdmin?: boolean;
  },
): Reply {
  const parsed = parseWhen(input.when, input.userTz, input.nowMs);
  if (!parsed.ok) return err(parsed.error);
  if (!input.isAdmin && countActiveAdhocByCreator(db, input.guildId, input.discordId) >= MAX_ACTIVE_ADHOC) {
    return err(`You can have at most ${MAX_ACTIVE_ADHOC} active adhoc events. Remove one first.`);
  }
  const id = createAdhocEvent(db, {
    guildId: input.guildId,
    name: input.name,
    createdBy: input.discordId,
    occurrenceMs: parsed.instantMs,
    creatorTz: input.userTz,
  });
  return ok(`Adhoc event "${input.name}" added (id ${id}) for ${renderLocal(parsed.instantMs, input.userTz)}.`);
}

export function handleAdhocRemove(
  db: Database,
  input: { discordId: string; eventId: number; isAdmin: boolean },
): Reply {
  const event = getEvent(db, input.eventId);
  if (!event || event.type !== 'adhoc') return err('This adhoc event does not exist.');
  if (event.createdBy !== input.discordId && !input.isAdmin) {
    return err('Only the creator or an admin can remove this event.');
  }
  removeEvent(db, input.eventId);
  return ok(`Adhoc event "${event.name}" removed.`);
}

export function handleListEvents(
  db: Database,
  input: { discordId: string; guildId: string; nowMs: number },
): Reply {
  const tz = getUser(db, input.discordId)?.timezone ?? 'UTC';
  const subscribed = new Set(listSubscriptions(db, input.discordId).map((s) => s.eventId));
  const lines: string[] = [];
  for (const e of listEvents(db, input.guildId)) {
    const state = subscribed.has(e.id) ? '[subscribed]' : '[not subscribed]';
    if (e.type === 'fixed') {
      const slots = e.slots.map((s) => `${DAY_NAMES[s.dayOfWeek - 1]} ${s.time}`).join(', ');
      lines.push(`#${e.id} ${e.name} (${slots}) ${state}`);
    } else if (e.occurrenceMs !== undefined && e.occurrenceMs >= input.nowMs) {
      lines.push(`#${e.id} ${e.name} (adhoc, ${renderLocal(e.occurrenceMs, tz)} ${tz}) ${state}`);
    }
  }
  if (lines.length === 0) return ok('There are no events.');
  return ok(lines.join('\n'));
}
