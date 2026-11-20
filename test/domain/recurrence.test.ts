import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { nextOccurrences } from '../../src/domain/recurrence.ts';

const NY = 'America/New_York';
const DAY = 86_400_000;
const at = (iso: string) => DateTime.fromISO(iso, { zone: NY }).toMillis();

test('single Fri 21:00 slot yields next Friday instant', () => {
  const from = at('2026-03-05T12:00'); // Thursday
  const out = nextOccurrences([{ dayOfWeek: 5, time: '21:00' }], NY, from, DAY * 2);
  // Fri 2026-03-06 21:00 EST = 2026-03-07T02:00Z
  assert.deepEqual(out, [1772848800000]);
});

test('multiple slots return sorted instants', () => {
  const from = at('2026-03-02T00:00'); // Monday
  const out = nextOccurrences(
    [
      { dayOfWeek: 5, time: '21:00' },
      { dayOfWeek: 2, time: '20:00' },
      { dayOfWeek: 2, time: '09:30' },
    ],
    NY,
    from,
    DAY * 7,
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out, [...out].sort((a, b) => a - b));
  assert.deepEqual(out, [
    at('2026-03-03T09:30'),
    at('2026-03-03T20:00'),
    at('2026-03-06T21:00'),
  ]);
});

test('slot on DST spring-forward day resolves to exact UTC instant', () => {
  // 2026-03-08 is Sunday; NY clocks jump 02:00 -> 03:00. 21:00 is EDT (UTC-4).
  const from = at('2026-03-07T12:00');
  const out = nextOccurrences([{ dayOfWeek: 7, time: '21:00' }], NY, from, DAY * 2);
  assert.deepEqual(out, [1773018000000]); // 2026-03-09T01:00:00Z
  assert.equal(out[0], Date.UTC(2026, 2, 9, 1, 0));
});

test('empty window yields no occurrences', () => {
  const from = at('2026-03-05T12:00');
  assert.deepEqual(nextOccurrences([{ dayOfWeek: 5, time: '21:00' }], NY, from, 60_000), []);
  assert.deepEqual(nextOccurrences([], NY, from, DAY * 7), []);
});

test('window bounds are inclusive', () => {
  const t = at('2026-03-06T21:00');
  assert.deepEqual(nextOccurrences([{ dayOfWeek: 5, time: '21:00' }], NY, t, 0), [t]);
});
