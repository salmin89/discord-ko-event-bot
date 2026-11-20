import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/connection.ts';
import { createFixedEvent } from '../../src/repositories/events.ts';
import { getUser } from '../../src/repositories/users.ts';
import { getConfig } from '../../src/repositories/guildConfig.ts';
import { listSubscriptions, unsubscribe } from '../../src/repositories/subscriptions.ts';
import { handleSetTimezone } from '../../src/handlers/timezone.ts';
import { handleSetAlerts } from '../../src/handlers/subscriptions.ts';
import { handleSetChannel, handleSetServerTz, handleSetAdminRole } from '../../src/handlers/config.ts';
import { handleLegal } from '../../src/handlers/legal.ts';
import { LEGAL_URLS } from '../../src/legal/urls.ts';

const admin = { isGuildOwner: true, hasManageGuild: false, roleIds: [], adminRoleId: null };
const nonAdmin = { isGuildOwner: false, hasManageGuild: false, roleIds: [], adminRoleId: null };

test('valid tz persists and auto-subscribes to default events', () => {
  const db = openDb(':memory:');
  createFixedEvent(db, {
    guildId: 'g1', name: 'KO', description: 'd', createdBy: 'u1',
    defaultSubscribed: true, slots: [{ dayOfWeek: 1, time: '20:00' }],
  });
  const r = handleSetTimezone(db, { discordId: 'u2', guildId: 'g1', tz: 'Europe/Berlin' });
  assert.equal(getUser(db, 'u2')?.timezone, 'Europe/Berlin');
  assert.equal(r.ephemeral, true);
  const subs = listSubscriptions(db, 'u2');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].lead1Min, 60);
  assert.equal(subs[0].lead2Min, 10);
});

test('re-setting tz does not re-subscribe to opted-out defaults or reset custom leads', () => {
  const db = openDb(':memory:');
  createFixedEvent(db, {
    guildId: 'g1', name: 'KO', description: 'd', createdBy: 'u1',
    defaultSubscribed: true, slots: [{ dayOfWeek: 1, time: '20:00' }],
  });
  const keep = createFixedEvent(db, {
    guildId: 'g1', name: 'Raid', description: 'd', createdBy: 'u1',
    defaultSubscribed: true, slots: [{ dayOfWeek: 2, time: '21:00' }],
  });
  // First time: auto-subscribed to both defaults with [60, 10].
  handleSetTimezone(db, { discordId: 'u2', guildId: 'g1', tz: 'Europe/Berlin' });
  assert.equal(listSubscriptions(db, 'u2').length, 2);

  // User opts out of the first default and customises leads on the second.
  const koId = listSubscriptions(db, 'u2').find((s) => s.eventId !== keep)!.eventId;
  unsubscribe(db, 'u2', koId);
  handleSetAlerts(db, { discordId: 'u2', eventId: keep, leads: [30] });

  // Re-setting the timezone must not resurrect the opt-out or reset custom leads.
  handleSetTimezone(db, { discordId: 'u2', guildId: 'g1', tz: 'Asia/Seoul' });
  assert.equal(getUser(db, 'u2')?.timezone, 'Asia/Seoul');
  const subs = listSubscriptions(db, 'u2');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].eventId, keep);
  assert.equal(subs[0].lead1Min, 30);
  assert.equal(subs[0].lead2Min, null);
});

test('invalid tz returns error and writes nothing', () => {
  const db = openDb(':memory:');
  const r = handleSetTimezone(db, { discordId: 'u2', guildId: 'g1', tz: 'Mars/Base' });
  assert.equal(r.ephemeral, true);
  assert.equal(getUser(db, 'u2'), undefined);
});

test('config handlers reject non-admin and accept admin', () => {
  const db = openDb(':memory:');
  assert.equal(handleSetChannel(db, nonAdmin, { guildId: 'g1', channelId: 'c1' }).ephemeral, true);
  handleSetServerTz(db, nonAdmin, { guildId: 'g1', tz: 'Europe/Berlin' });
  handleSetAdminRole(db, nonAdmin, { guildId: 'g1', roleId: 'r1' });
  assert.equal(getConfig(db, 'g1'), undefined);

  handleSetChannel(db, admin, { guildId: 'g1', channelId: 'c1' });
  handleSetServerTz(db, admin, { guildId: 'g1', tz: 'Europe/Berlin' });
  handleSetAdminRole(db, admin, { guildId: 'g1', roleId: 'r1' });
  const c = getConfig(db, 'g1');
  assert.equal(c?.channelId, 'c1');
  assert.equal(c?.serverTz, 'Europe/Berlin');
  assert.equal(c?.adminRoleId, 'r1');
});

test('set server tz validates tz for admin', () => {
  const db = openDb(':memory:');
  handleSetServerTz(db, admin, { guildId: 'g1', tz: 'Nope/Zone' });
  assert.equal(getConfig(db, 'g1'), undefined);
});

test('legal contains both urls', () => {
  const r = handleLegal();
  assert.ok(r.content.includes(LEGAL_URLS.tos));
  assert.ok(r.content.includes(LEGAL_URLS.privacy));
});
