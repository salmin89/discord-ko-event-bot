import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommands } from '../../src/discord/commands.ts';
import { buildAdminCtx, parseSlots } from '../../src/discord/context.ts';

const json = () => buildCommands().map((c) => c.toJSON());

test('buildCommands includes every expected command', () => {
  const names = json().map((c) => c.name).sort();
  assert.deepEqual(names, ['adhoc', 'alerts', 'config', 'event', 'events', 'legal', 'subscribe', 'timer', 'timezone', 'unsubscribe']);
});

test('buildCommands: subcommands and required options', () => {
  const by = Object.fromEntries(json().map((c) => [c.name, c]));
  const subs = (n: string) => (by[n].options ?? []).map((o) => o.name).sort();
  assert.deepEqual(subs('adhoc'), ['add', 'remove']);
  assert.deepEqual(subs('event'), ['add', 'edit', 'remove']);
  assert.deepEqual(subs('config'), ['adminrole', 'channel', 'servertz']);
  assert.deepEqual(subs('timezone'), ['set']);
  const required = (n: string) => (by[n].options ?? []).filter((o) => o.required).map((o) => o.name);
  assert.deepEqual(required('subscribe'), ['event']);
  assert.deepEqual(required('unsubscribe'), ['event']);
  assert.deepEqual(required('alerts'), ['event', 'first']);
});

test('buildAdminCtx maps owner, permission, roles and config', () => {
  const interaction = {
    user: { id: 'u1' },
    guild: { ownerId: 'u1' },
    memberPermissions: { has: () => true },
    member: { roles: { cache: new Map([['r1', {}], ['r2', {}]]) } },
  };
  const ctx = buildAdminCtx(interaction as never, { adminRoleId: 'r2' } as never);
  assert.deepEqual(ctx, { isGuildOwner: true, hasManageGuild: true, roleIds: ['r1', 'r2'], adminRoleId: 'r2' });
});

test('buildAdminCtx: non-owner, no permission, no config', () => {
  const interaction = {
    user: { id: 'u2' },
    guild: { ownerId: 'u1' },
    memberPermissions: null,
    member: { roles: ['r9'] },
  };
  assert.deepEqual(buildAdminCtx(interaction as never, undefined), {
    isGuildOwner: false,
    hasManageGuild: false,
    roleIds: ['r9'],
    adminRoleId: null,
  });
});

test('parseSlots reads day names and numbers', () => {
  assert.deepEqual(parseSlots('Mon 20:00, 3 18:30'), [
    { dayOfWeek: 1, time: '20:00' },
    { dayOfWeek: 3, time: '18:30' },
  ]);
  assert.equal(parseSlots('Funday 20:00'), null);
});
