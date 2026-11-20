import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCountdown, renderLocal, isValidTimezone } from '../../src/domain/time.ts';

test('formatCountdown shows hours and minutes', () => {
  assert.equal(formatCountdown(4_800_000), '1h 20m');
});
test('formatCountdown shows minutes only under one hour', () => {
  assert.equal(formatCountdown(2_700_000), '45m');
});
test('formatCountdown shows soon under one minute', () => {
  assert.equal(formatCountdown(30_000), 'soon');
  assert.equal(formatCountdown(-5), 'soon');
});
test('formatCountdown shows whole hours', () => {
  assert.equal(formatCountdown(7_200_000), '2h 0m');
});
test('isValidTimezone', () => {
  assert.equal(isValidTimezone('America/New_York'), true);
  assert.equal(isValidTimezone('Nowhere/Void'), false);
});
test('renderLocal renders clock in given zone', () => {
  const instant = Date.UTC(2026, 0, 15, 20, 0, 0);
  assert.equal(renderLocal(instant, 'UTC'), '8:00 PM');
  assert.equal(renderLocal(instant, 'America/New_York'), '3:00 PM');
});
