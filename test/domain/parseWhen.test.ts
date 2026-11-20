import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { parseWhen } from '../../src/domain/parseWhen.ts';

const tz = 'Europe/Zagreb';
const now = DateTime.fromISO('2026-11-20T10:00:00', { zone: tz }).toMillis();
const at = (iso: string) => DateTime.fromISO(iso, { zone: tz }).toMillis();

test('today HH:mm resolves in user tz', () => {
  assert.deepEqual(parseWhen('today 20:00', tz, now), { ok: true, instantMs: at('2026-11-20T20:00:00') });
});

test('tomorrow HH:mm is +1 day', () => {
  assert.deepEqual(parseWhen('tomorrow 20:00', tz, now), { ok: true, instantMs: at('2026-11-21T20:00:00') });
});

test('absolute date parses', () => {
  assert.deepEqual(parseWhen('2026-11-22 20:00', tz, now), { ok: true, instantMs: at('2026-11-22T20:00:00') });
});

test('uses the user tz, not UTC', () => {
  const r = parseWhen('2026-11-22 20:00', 'America/New_York', now);
  assert.deepEqual(r, { ok: true, instantMs: Date.UTC(2026, 10, 23, 1, 0) });
});

test('past time is rejected', () => {
  const r = parseWhen('today 09:00', tz, now);
  assert.equal(r.ok, false);
  assert.equal(parseWhen('2026-01-01 10:00', tz, now).ok, false);
});

test('garbage is rejected with an error', () => {
  for (const s of ['', 'soon', 'today 25:00', '2026-13-40 10:00', 'tomorrow']) {
    const r = parseWhen(s, tz, now);
    assert.equal(r.ok, false, s);
    if (!r.ok) assert.ok(r.error.length > 0);
  }
});
