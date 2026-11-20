import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/connection.ts';
import { createAdhocEvent, getEvent, listEvents } from '../../src/repositories/events.ts';
import { setTimezone } from '../../src/repositories/users.ts';
import { subscribe } from '../../src/repositories/subscriptions.ts';
import {
  handleEventAdd,
  handleEventEdit,
  handleEventRemove,
  handleAdhocAdd,
  handleAdhocRemove,
  handleListEvents,
} from '../../src/handlers/events.ts';

const admin = { isGuildOwner: true, hasManageGuild: false, roleIds: [], adminRoleId: null };
const nonAdmin = { isGuildOwner: false, hasManageGuild: false, roleIds: [], adminRoleId: null };
const fixed = (over = {}) => ({
  guildId: 'g1', name: 'KO', description: 'Weekly KO', createdBy: 'a1',
  defaultSubscribed: true, slots: [{ dayOfWeek: 1, time: '20:00' }], ...over,
});

test('admin adds fixed event with slots and defaultSubscribed', () => {
  const db = openDb(':memory:');
  const r = handleEventAdd(db, admin, fixed());
  assert.equal(r.ephemeral, true);
  const [e] = listEvents(db, 'g1');
  assert.equal(e.name, 'KO');
  assert.equal(e.defaultSubscribed, true);
  assert.deepEqual(e.slots, [{ dayOfWeek: 1, time: '20:00' }]);
});

test('non-admin add, edit, remove are rejected', () => {
  const db = openDb(':memory:');
  handleEventAdd(db, admin, fixed());
  const id = listEvents(db, 'g1')[0].id;
  assert.match(handleEventAdd(db, nonAdmin, fixed({ name: 'X' })).content, /admin/i);
  assert.match(handleEventEdit(db, nonAdmin, { eventId: id, name: 'Y' }).content, /admin/i);
  assert.match(handleEventRemove(db, nonAdmin, { eventId: id }).content, /admin/i);
  assert.equal(listEvents(db, 'g1').length, 1);
  assert.equal(getEvent(db, id)!.name, 'KO');
});

test('malformed slot time or empty slots rejected', () => {
  const db = openDb(':memory:');
  for (const time of ['25:00', '20:60', '8:00', 'abc', '20:00:00']) {
    const r = handleEventAdd(db, admin, fixed({ slots: [{ dayOfWeek: 1, time }] }));
    assert.equal(r.ephemeral, true, time);
  }
  assert.equal(handleEventAdd(db, admin, fixed({ slots: [{ dayOfWeek: 8, time: '20:00' }] })).ephemeral, true);
  assert.equal(handleEventAdd(db, admin, fixed({ slots: [] })).ephemeral, true);
  assert.equal(listEvents(db, 'g1').length, 0);
});

test('edit validates slots and updates fields; remove deletes', () => {
  const db = openDb(':memory:');
  handleEventAdd(db, admin, fixed());
  const id = listEvents(db, 'g1')[0].id;
  handleEventEdit(db, admin, { eventId: id, slots: [{ dayOfWeek: 1, time: '99:99' }] });
  assert.equal(getEvent(db, id)!.slots[0].time, '20:00');
  handleEventEdit(db, admin, { eventId: id, name: 'KO2', slots: [{ dayOfWeek: 2, time: '19:30' }] });
  assert.equal(getEvent(db, id)!.name, 'KO2');
  assert.deepEqual(getEvent(db, id)!.slots, [{ dayOfWeek: 2, time: '19:30' }]);
  handleEventRemove(db, admin, { eventId: id });
  assert.equal(getEvent(db, id), undefined);
});

const NOW = Date.now();
const base = { guildId: 'g1', userTz: 'UTC', nowMs: NOW };

test('adhoc cap is 3 for non-admin, unlimited for admin', () => {
  const db = openDb(':memory:');
  for (let i = 0; i < 3; i++) {
    const r = handleAdhocAdd(db, { ...base, discordId: 'u1', name: `e${i}`, when: '2099-01-01 10:00', isAdmin: false });
    assert.equal(listEvents(db, 'g1').length, i + 1, r.content);
  }
  const r = handleAdhocAdd(db, { ...base, discordId: 'u1', name: 'e3', when: '2099-01-01 10:00', isAdmin: false });
  assert.equal(r.ephemeral, true);
  assert.equal(listEvents(db, 'g1').length, 3);
  for (let i = 0; i < 5; i++) {
    handleAdhocAdd(db, { ...base, discordId: 'adm', name: `a${i}`, when: '2099-01-01 10:00', isAdmin: true });
  }
  assert.equal(listEvents(db, 'g1').length, 8);
});

test('adhoc add with bad time is rejected', () => {
  const db = openDb(':memory:');
  const r = handleAdhocAdd(db, { ...base, discordId: 'u1', name: 'x', when: 'nope', isAdmin: false });
  assert.equal(r.ephemeral, true);
  assert.equal(listEvents(db, 'g1').length, 0);
});

test('adhoc remove: creator or admin only', () => {
  const db = openDb(':memory:');
  const id = createAdhocEvent(db, { guildId: 'g1', name: 'x', createdBy: 'u1', occurrenceMs: NOW + 1e7, creatorTz: 'UTC' });
  assert.equal(handleAdhocRemove(db, { discordId: 'u2', eventId: id, isAdmin: false }).ephemeral, true);
  assert.ok(getEvent(db, id));
  handleAdhocRemove(db, { discordId: 'u1', eventId: id, isAdmin: false });
  assert.equal(getEvent(db, id), undefined);
  const id2 = createAdhocEvent(db, { guildId: 'g1', name: 'y', createdBy: 'u1', occurrenceMs: NOW + 1e7, creatorTz: 'UTC' });
  handleAdhocRemove(db, { discordId: 'u2', eventId: id2, isAdmin: true });
  assert.equal(getEvent(db, id2), undefined);
});

test('list shows fixed and active adhoc with subscription state', () => {
  const db = openDb(':memory:');
  setTimezone(db, 'u1', 'Europe/Berlin');
  handleEventAdd(db, admin, fixed({ name: 'FixedKO' }));
  handleEventAdd(db, admin, fixed({ name: 'FixedOther', slots: [{ dayOfWeek: 3, time: '18:00' }] }));
  const [f1] = listEvents(db, 'g1');
  subscribe(db, { userId: 'u1', eventId: f1.id, lead1Min: 60, lead2Min: null });
  createAdhocEvent(db, { guildId: 'g1', name: 'Soon', createdBy: 'u2', occurrenceMs: NOW + 3.6e6, creatorTz: 'UTC' });
  createAdhocEvent(db, { guildId: 'g1', name: 'Old', createdBy: 'u2', occurrenceMs: NOW - 3.6e6, creatorTz: 'UTC' });
  const r = handleListEvents(db, { discordId: 'u1', guildId: 'g1', nowMs: NOW });
  assert.match(r.content, /FixedKO/);
  assert.match(r.content, /FixedOther/);
  assert.match(r.content, /Soon/);
  assert.doesNotMatch(r.content, /Old/);
  const lines = r.content.split('\n');
  assert.match(lines.find((l) => l.includes('FixedKO'))!, /\[subscribed\]/);
  assert.match(lines.find((l) => l.includes('FixedOther'))!, /\[not subscribed\]/);
});
