import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/db/connection.ts';

const TABLES = [
  'guild_config',
  'users',
  'events',
  'event_slots',
  'adhoc_times',
  'subscriptions',
  'sent_reminders',
];

test('openDb creates all tables', () => {
  const db = openDb(':memory:');
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  const names = rows.map((r) => r.name);
  for (const t of TABLES) assert.ok(names.includes(t), `missing table ${t}`);
});

test('foreign keys are enabled', () => {
  const db = openDb(':memory:');
  assert.throws(() =>
    db.prepare('INSERT INTO event_slots (event_id, day_of_week, time_of_day) VALUES (999, 1, ?)').run('20:00'),
  );
});

test('sent_reminders rejects duplicates', () => {
  const db = openDb(':memory:');
  const { lastInsertRowid } = db
    .prepare("INSERT INTO events (guild_id, type, name, created_by, default_subscribed) VALUES ('g','fixed','n','u',0)")
    .run();
  const ins = db.prepare('INSERT INTO sent_reminders (event_id, occurrence_ms, user_id, lead_min) VALUES (?, ?, ?, ?)');
  ins.run(lastInsertRowid, 1000, 'u1', 15);
  assert.throws(() => ins.run(lastInsertRowid, 1000, 'u1', 15));
  ins.run(lastInsertRowid, 1000, 'u1', 5);
});

test('subscription is unique per user and event', () => {
  const db = openDb(':memory:');
  const { lastInsertRowid } = db
    .prepare("INSERT INTO events (guild_id, type, name, created_by, default_subscribed) VALUES ('g','adhoc','n','u',0)")
    .run();
  const ins = db.prepare('INSERT INTO subscriptions (user_id, event_id, lead1_min, lead2_min) VALUES (?, ?, 60, 10)');
  ins.run('u1', lastInsertRowid);
  assert.throws(() => ins.run('u1', lastInsertRowid));
});
