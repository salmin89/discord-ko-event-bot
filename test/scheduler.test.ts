import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/connection.ts';
import { applySchema } from '../src/db/schema.ts';
import { setTimezone } from '../src/repositories/users.ts';
import { createAdhocEvent } from '../src/repositories/events.ts';
import { subscribe } from '../src/repositories/subscriptions.ts';
import { wasSent } from '../src/repositories/sentReminders.ts';
import { renderLocal } from '../src/domain/time.ts';
import { tick } from '../src/scheduler.ts';

const OCC = Date.UTC(2030, 0, 1, 20, 0, 0);
const LEAD = 10;
const NOW = OCC - LEAD * 60_000;

function setup() {
  const db = openDb(':memory:');
  applySchema(db);
  setTimezone(db, 'u1', 'Europe/Berlin');
  const id = createAdhocEvent(db, { guildId: 'g1', name: 'Boss Fight', createdBy: 'u1', occurrenceMs: OCC, creatorTz: 'UTC' });
  subscribe(db, { userId: 'u1', eventId: id, lead1Min: LEAD, lead2Min: null });
  return { db, id };
}

test('tick sends a due reminder once and marks it sent', async () => {
  const { db, id } = setup();
  const sent: [string, string][] = [];
  await tick(db, NOW, async (u, c) => { sent.push([u, c]); });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'u1');
  assert.equal(wasSent(db, id, OCC, 'u1', LEAD), true);
});

test('second tick in the same minute does not resend', async () => {
  const { db } = setup();
  let n = 0;
  const send = async () => { n++; };
  await tick(db, NOW, send);
  await tick(db, NOW + 30_000, send);
  assert.equal(n, 1);
});

test('tick floors now to the minute', async () => {
  const { db } = setup();
  let n = 0;
  await tick(db, NOW + 45_000, async () => { n++; });
  assert.equal(n, 1);
});

test('a throwing send (closed DMs) is caught, not marked sent, and can retry', async () => {
  const { db, id } = setup();
  const orig = console.error;
  console.error = () => {};
  try {
    await tick(db, NOW, async () => { throw new Error('Cannot send messages to this user'); });
  } finally {
    console.error = orig;
  }
  assert.equal(wasSent(db, id, OCC, 'u1', LEAD), false);
  let n = 0;
  await tick(db, NOW, async () => { n++; });
  assert.equal(n, 1);
  assert.equal(wasSent(db, id, OCC, 'u1', LEAD), true);
});

test('reminder content has the event name and the local start time', async () => {
  const { db } = setup();
  let content = '';
  await tick(db, NOW, async (_u, c) => { content = c; });
  assert.ok(content.includes('Boss Fight'));
  assert.ok(content.includes(renderLocal(OCC, 'Europe/Berlin')));
});

test('a failing send does not stop the next reminder', async () => {
  const { db, id } = setup();
  setTimezone(db, 'u2', 'UTC');
  subscribe(db, { userId: 'u2', eventId: id, lead1Min: LEAD, lead2Min: null });
  const orig = console.error;
  console.error = () => {};
  const ok: string[] = [];
  try {
    await tick(db, NOW, async (u) => { if (u === 'u1') throw new Error('closed'); ok.push(u); });
  } finally {
    console.error = orig;
  }
  assert.deepEqual(ok, ['u2']);
  assert.equal(wasSent(db, id, OCC, 'u2', LEAD), true);
  assert.equal(wasSent(db, id, OCC, 'u1', LEAD), false);
});
