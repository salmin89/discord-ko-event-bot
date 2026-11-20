import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/connection.ts';
import { applySchema } from '../../src/db/schema.ts';
import { setTimezone, getUser } from '../../src/repositories/users.ts';
import { setChannel, setServerTz, setAdminRole, getConfig } from '../../src/repositories/guildConfig.ts';
import {
  createFixedEvent, createAdhocEvent, editFixedEvent, removeEvent, listEvents, getEvent,
  countActiveAdhocByCreator, deleteExpiredAdhoc,
} from '../../src/repositories/events.ts';
import {
  subscribe, unsubscribe, listSubscriptions, listSubscribersForEvent, autoSubscribeToDefaults,
} from '../../src/repositories/subscriptions.ts';
import { wasSent, markSent } from '../../src/repositories/sentReminders.ts';

function freshDb() {
  const db = openDb(':memory:');
  applySchema(db);
  return db;
}

const fixed = (over = {}) => ({
  guildId: 'g1', name: 'KO', description: 'desc', createdBy: 'u1',
  defaultSubscribed: true, slots: [{ dayOfWeek: 1, time: '20:00' }, { dayOfWeek: 4, time: '21:30' }],
  ...over,
});

test('user timezone round trip and update', () => {
  const db = freshDb();
  assert.equal(getUser(db, 'u1'), undefined);
  setTimezone(db, 'u1', 'Europe/Berlin');
  assert.deepEqual(getUser(db, 'u1'), { discordId: 'u1', timezone: 'Europe/Berlin' });
  setTimezone(db, 'u1', 'UTC');
  assert.equal(getUser(db, 'u1')?.timezone, 'UTC');
});

test('guild config setters upsert and merge', () => {
  const db = freshDb();
  assert.equal(getConfig(db, 'g1'), undefined);
  setChannel(db, 'g1', 'c1');
  setServerTz(db, 'g1', 'Europe/Berlin');
  setAdminRole(db, 'g1', 'r1');
  assert.deepEqual(getConfig(db, 'g1'), {
    guildId: 'g1', channelId: 'c1', serverTz: 'Europe/Berlin', adminRoleId: 'r1',
  });
});

test('fixed event create, list with slots, edit, remove', () => {
  const db = freshDb();
  const id = createFixedEvent(db, fixed());
  const list = listEvents(db, 'g1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].type, 'fixed');
  assert.equal(list[0].defaultSubscribed, true);
  assert.deepEqual(list[0].slots, [{ dayOfWeek: 1, time: '20:00' }, { dayOfWeek: 4, time: '21:30' }]);
  assert.deepEqual(listEvents(db, 'other'), []);

  editFixedEvent(db, id, { name: 'KO2', defaultSubscribed: false, slots: [{ dayOfWeek: 2, time: '18:00' }] });
  const e = getEvent(db, id)!;
  assert.equal(e.name, 'KO2');
  assert.equal(e.description, 'desc');
  assert.equal(e.defaultSubscribed, false);
  assert.deepEqual(e.slots, [{ dayOfWeek: 2, time: '18:00' }]);

  removeEvent(db, id);
  assert.equal(getEvent(db, id), undefined);
});

test('adhoc create and countActiveAdhocByCreator', () => {
  const db = freshDb();
  const future = Date.now() + 3_600_000;
  const id = createAdhocEvent(db, { guildId: 'g1', name: 'A', createdBy: 'u1', occurrenceMs: future, creatorTz: 'UTC' });
  createAdhocEvent(db, { guildId: 'g1', name: 'B', createdBy: 'u2', occurrenceMs: future, creatorTz: 'UTC' });
  const e = getEvent(db, id)!;
  assert.equal(e.type, 'adhoc');
  assert.equal(e.occurrenceMs, future);
  assert.equal(e.creatorTz, 'UTC');
  assert.equal(countActiveAdhocByCreator(db, 'g1', 'u1'), 1);
});

test('subscribe, list, unsubscribe', () => {
  const db = freshDb();
  const id = createFixedEvent(db, fixed());
  subscribe(db, { userId: 'u1', eventId: id, lead1Min: 60, lead2Min: 10 });
  subscribe(db, { userId: 'u1', eventId: id, lead1Min: 30, lead2Min: 5 });
  const subs = listSubscribersForEvent(db, id);
  assert.deepEqual(subs, [{ userId: 'u1', eventId: id, lead1Min: 30, lead2Min: 5 }]);
  assert.deepEqual(listSubscriptions(db, 'u1'), subs);
  unsubscribe(db, 'u1', id);
  assert.deepEqual(listSubscribersForEvent(db, id), []);
});

test('autoSubscribeToDefaults only default-on fixed events in guild', () => {
  const db = freshDb();
  const on = createFixedEvent(db, fixed());
  createFixedEvent(db, fixed({ name: 'off', defaultSubscribed: false }));
  createFixedEvent(db, fixed({ guildId: 'g2', name: 'otherguild' }));
  autoSubscribeToDefaults(db, 'g1', 'u9', [60, 10]);
  assert.deepEqual(listSubscriptions(db, 'u9'), [{ userId: 'u9', eventId: on, lead1Min: 60, lead2Min: 10 }]);
});

test('sent reminders dedup', () => {
  const db = freshDb();
  const id = createFixedEvent(db, fixed());
  assert.equal(wasSent(db, id, 1000, 'u1', 60), false);
  markSent(db, id, 1000, 'u1', 60);
  markSent(db, id, 1000, 'u1', 60);
  assert.equal(wasSent(db, id, 1000, 'u1', 60), true);
  assert.equal(wasSent(db, id, 1000, 'u1', 10), false);
});

test('deleteExpiredAdhoc removes only past adhoc', () => {
  const db = freshDb();
  const now = 10_000;
  const past = createAdhocEvent(db, { guildId: 'g1', name: 'p', createdBy: 'u1', occurrenceMs: 5_000, creatorTz: 'UTC' });
  const fut = createAdhocEvent(db, { guildId: 'g1', name: 'f', createdBy: 'u1', occurrenceMs: 20_000, creatorTz: 'UTC' });
  const fx = createFixedEvent(db, fixed());
  deleteExpiredAdhoc(db, now);
  assert.equal(getEvent(db, past), undefined);
  assert.ok(getEvent(db, fut));
  assert.ok(getEvent(db, fx));
});
