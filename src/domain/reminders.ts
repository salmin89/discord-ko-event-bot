import { nextOccurrences } from './recurrence.ts';
import type { Slot } from './recurrence.ts';

const MIN = 60_000;
const MAX_LEAD_MIN = 1440;

export type EventWithSlots =
  | { type: 'fixed'; id: number; name: string; slots: Slot[]; serverTz: string }
  | { type: 'adhoc'; id: number; name: string; occurrenceMs: number };

export type SubscriptionWithUserTz = {
  userId: string;
  eventId: number;
  userTz: string;
  lead1Min: number;
  lead2Min?: number;
};

export type DueReminder = {
  userId: string;
  eventId: number;
  eventName: string;
  occurrenceMs: number;
  leadMin: number;
};

const floorMinute = (ms: number) => Math.floor(ms / MIN) * MIN;

export function computeDue(params: {
  nowMs: number;
  events: EventWithSlots[];
  subscriptions: SubscriptionWithUserTz[];
  wasSent: (eventId: number, occurrenceMs: number, userId: string, leadMin: number) => boolean;
}): DueReminder[] {
  const { nowMs, events, subscriptions, wasSent } = params;
  const nowMinute = floorMinute(nowMs);
  const due: DueReminder[] = [];

  for (const event of events) {
    const occurrences =
      event.type === 'adhoc'
        ? [event.occurrenceMs]
        : nextOccurrences(event.slots, event.serverTz, nowMs, (MAX_LEAD_MIN + 1) * MIN);

    for (const sub of subscriptions) {
      if (sub.eventId !== event.id) continue;
      const leads = sub.lead2Min === undefined ? [sub.lead1Min] : [sub.lead1Min, sub.lead2Min];
      for (const leadMin of leads) {
        if (leadMin > MAX_LEAD_MIN) continue;
        for (const occurrenceMs of occurrences) {
          // Bounded catch-up: fire if the lead moment has arrived or was missed
          // (floor(fireMoment) <= floor(now)) as long as the occurrence is still ahead.
          // This recovers a reminder whose exact minute was skipped by a late tick,
          // without firing stale pings for occurrences already past. wasSent keeps it exactly-once.
          if (floorMinute(occurrenceMs - leadMin * MIN) > nowMinute) continue;
          if (occurrenceMs <= nowMs) continue;
          if (wasSent(event.id, occurrenceMs, sub.userId, leadMin)) continue;
          due.push({ userId: sub.userId, eventId: event.id, eventName: event.name, occurrenceMs, leadMin });
        }
      }
    }
  }
  return due;
}
