import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';

test('loadConfig throws without a token', () => {
  assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
  assert.throws(() => loadConfig({ DISCORD_TOKEN: '' }), /DISCORD_TOKEN/);
});

test('loadConfig returns token and default dbPath', () => {
  assert.deepEqual(loadConfig({ DISCORD_TOKEN: 't' }), { token: 't', dbPath: './data/ko-bot.db' });
});

test('loadConfig honors DB_PATH', () => {
  assert.equal(loadConfig({ DISCORD_TOKEN: 't', DB_PATH: '/x/y.db' }).dbPath, '/x/y.db');
});
