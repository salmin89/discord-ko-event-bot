import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/connection.ts';
import { createFixedEvent } from '../../src/repositories/events.ts';
import { setTimezone } from '../../src/repositories/users.ts';
import { setServerTz } from '../../src/repositories/guildConfig.ts';
import { listSubscriptions } from '../../src/repositories/subscriptions.ts';
import { handleSubscribe, handleUnsubscribe, handleSetAlerts } from '../../src/handlers/subscriptions.ts';
import { handleTimer } from '../../src/handlers/timer.ts';

function setup() {
  const db = openDb(':memory:');
  setServerTz(db, 'g1', 'UTC');
  const mk = (name: string, time: string) =>
    createFixedEvent(db, {
      guildId: 'g1', name, description: 'd', createdBy: 'u1',
      defaultSubscribed: false, slots: [{ dayOfWeek: 1, time }],
    });
  return { db, mk };
}

test('subscribe without timezone is refused and writes nothing', () => {
  const { db, mk } = setup();
  const id = mk('KO', '20:00');
  const r = handleSubscribe(db, { discordId: 'u2', guildId: 'g1', eventId: id });
  assert.equal(r.ephemeral, true);
  assert.match(r.content, /timezone/i);
  assert.equal(listSubscriptions(db, 'u2').length, 0);
});

test('subscribe with timezone succeeds with default leads', () => {
  const { db, mk } = setup();
  const id = mk('KO', '20:00');
  setTimezone(db, 'u2', 'Europe/Berlin');
  const r = handleSubscribe(db, { discordId: 'u2', guildId: 'g1', eventId: id });
  assert.match(r.content, /KO/);
  const subs = listSubscriptions(db, 'u2');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].lead1Min, 60);
  assert.equal(subs[0].lead2Min, 10);
});

test('subscribe to unknown event is refused', () => {
  const { db } = setup();
  setTimezone(db, 'u2', 'Europe/Berlin');
  handleSubscribe(db, { discordId: 'u2', guildId: 'g1', eventId: 999 });
  assert.equal(listSubscriptions(db, 'u2').length, 0);
});

test('unsubscribe removes the subscription', () => {
  const { db, mk } = setup();
  const id = mk('KO', '20:00');
  setTimezone(db, 'u2', 'Europe/Berlin');
  handleSubscribe(db, { discordId: 'u2', guildId: 'g1', eventId: id });
  handleUnsubscribe(db, { discordId: 'u2', eventId: id });
  assert.equal(listSubscriptions(db, 'u2').length, 0);
});

test('set alerts: rejects >2 leads and lead >1440, collapses equal leads', () => {
  const { db, mk } = setup();
  const id = mk('KO', '20:00');
  setTimezone(db, 'u2', 'Europe/Berlin');
  assert.equal(handleSetAlerts(db, { discordId: 'u2', eventId: id, leads: [5, 10, 15] }).ephemeral, true);
  assert.equal(listSubscriptions(db, 'u2').length, 0);
  handleSetAlerts(db, { discordId: 'u2', eventId: id, leads: [1441] });
  assert.equal(listSubscriptions(db, 'u2').length, 0);
  handleSetAlerts(db, { discordId: 'u2', eventId: id, leads: [] });
  assert.equal(listSubscriptions(db, 'u2').length, 0);
  handleSetAlerts(db, { discordId: 'u2', eventId: id, leads: [30, 30] });
  let s = listSubscriptions(db, 'u2')[0];
  assert.equal(s.lead1Min, 30);
  assert.equal(s.lead2Min, null);
  handleSetAlerts(db, { discordId: 'u2', eventId: id, leads: [1440, 0] });
  s = listSubscriptions(db, 'u2')[0];
  assert.deepEqual([s.lead1Min, s.lead2Min], [1440, 0]);
});

test('timer lists countdowns soonest first in user tz', () => {
  const { db, mk } = setup();
  const late = mk('Late', '20:00');
  const early = mk('Early', '10:00');
  setTimezone(db, 'u2', 'Asia/Tokyo');
  handleSubscribe(db, { discordId: 'u2', guildId: 'g1', eventId: late });
  handleSubscribe(db, { discordId: 'u2', guildId: 'g1', eventId: early });
  const nowMs = Date.UTC(2026, 10, 23, 0, 0); // Monday 00:00 UTC
  const r = handleTimer(db, { discordId: 'u2', guildId: 'g1', nowMs });
  const c = r.content;
  assert.ok(c.indexOf('Early') < c.indexOf('Late'));
  assert.match(c, /10h 0m/);
  assert.match(c, /7:00 PM/);
  assert.match(c, /5:00 AM/);
});

test('timer with no subscriptions is friendly', () => {
  const { db } = setup();
  setTimezone(db, 'u2', 'Asia/Tokyo');
  const r = handleTimer(db, { discordId: 'u2', guildId: 'g1', nowMs: Date.now() });
  assert.equal(r.ephemeral, true);
  assert.match(r.content, /not subscribed/i);
});
