import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDue } from '../../src/domain/reminders.ts';
import type { EventWithSlots, SubscriptionWithUserTz } from '../../src/domain/reminders.ts';

const MIN = 60_000;
// 2026-11-18 (Wednesday) 10:00:30 UTC, mid-minute on purpose.
const NOW = Date.UTC(2026, 10, 18, 10, 0, 30);
const never = () => false;

function adhoc(id: number, occurrenceMs: number): EventWithSlots {
  return { type: 'adhoc', id, name: `adhoc${id}`, occurrenceMs };
}
function sub(eventId: number, lead1Min: number, lead2Min?: number, userId = 'u1'): SubscriptionWithUserTz {
  return { userId, eventId, userTz: 'UTC', lead1Min, lead2Min };
}
// Fixed event on Wednesday at the given UTC time.
function fixed(id: number, time: string): EventWithSlots {
  return { type: 'fixed', id, name: `fixed${id}`, serverTz: 'UTC', slots: [{ dayOfWeek: 3, time }] };
}

test('lead 60, fixed event in 60m is due', () => {
  const due = computeDue({ nowMs: NOW, events: [fixed(1, '11:00')], subscriptions: [sub(1, 60)], wasSent: never });
  assert.equal(due.length, 1);
  assert.equal(due[0].leadMin, 60);
  assert.equal(due[0].userId, 'u1');
  assert.equal(due[0].eventId, 1);
  assert.equal(due[0].occurrenceMs, Date.UTC(2026, 10, 18, 11, 0));
});

test('lead 60, fixed event in 90m is not due', () => {
  const due = computeDue({ nowMs: NOW, events: [fixed(1, '11:30')], subscriptions: [sub(1, 60)], wasSent: never });
  assert.deepEqual(due, []);
});

test('already sent is excluded', () => {
  const due = computeDue({ nowMs: NOW, events: [fixed(1, '11:00')], subscriptions: [sub(1, 60)], wasSent: () => true });
  assert.deepEqual(due, []);
});

test('catch-up: fire-moment a few minutes in the past, occurrence still ahead, fires', () => {
  // occurrence in 55m, lead 60 -> fire moment was 5 minutes ago, occurrence still in the future.
  const due = computeDue({ nowMs: NOW, events: [adhoc(1, NOW + 55 * MIN)], subscriptions: [sub(1, 60)], wasSent: never });
  assert.equal(due.length, 1);
  assert.equal(due[0].leadMin, 60);
  assert.equal(due[0].occurrenceMs, NOW + 55 * MIN);
});

test('catch-up: occurrence already past does not fire', () => {
  // occurrence 1 minute ago: fire moment long past AND occurrence past -> no stale ping.
  const due = computeDue({ nowMs: NOW, events: [adhoc(1, NOW - MIN)], subscriptions: [sub(1, 60)], wasSent: never });
  assert.deepEqual(due, []);
});

test('catch-up: already-sent is still excluded', () => {
  // fire moment in the past, occurrence ahead, but already sent -> excluded.
  const due = computeDue({ nowMs: NOW, events: [adhoc(1, NOW + 55 * MIN)], subscriptions: [sub(1, 60)], wasSent: () => true });
  assert.deepEqual(due, []);
});

test('adhoc handled alongside fixed', () => {
  const due = computeDue({
    nowMs: NOW,
    events: [fixed(1, '11:00'), adhoc(2, NOW + 30 * MIN)],
    subscriptions: [sub(1, 60), sub(2, 30)],
    wasSent: never,
  });
  assert.deepEqual(due.map((d) => d.eventId).sort(), [1, 2]);
});

test('lead above 1440 is ignored', () => {
  const due = computeDue({ nowMs: NOW, events: [adhoc(1, NOW + 1500 * MIN)], subscriptions: [sub(1, 1500)], wasSent: never });
  assert.deepEqual(due, []);
});

test('lead 1440 is allowed; second lead is evaluated', () => {
  const due = computeDue({ nowMs: NOW, events: [adhoc(1, NOW + 1440 * MIN)], subscriptions: [sub(1, 1440, 10)], wasSent: never });
  assert.deepEqual(due.map((d) => d.leadMin), [1440]);
});
