import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdmin } from '../../src/domain/permissions.ts';

test('isAdmin is true for the guild owner', () => {
  assert.equal(
    isAdmin({ isGuildOwner: true, hasManageGuild: false, roleIds: [], adminRoleId: null }),
    true,
  );
});
test('isAdmin is true for Manage Server permission', () => {
  assert.equal(
    isAdmin({ isGuildOwner: false, hasManageGuild: true, roleIds: [], adminRoleId: null }),
    true,
  );
});
test('isAdmin is true when holding the configured admin role', () => {
  assert.equal(
    isAdmin({ isGuildOwner: false, hasManageGuild: false, roleIds: ['r1', 'admin'], adminRoleId: 'admin' }),
    true,
  );
});
test('isAdmin is false with no admin privileges when an admin role is set', () => {
  assert.equal(
    isAdmin({ isGuildOwner: false, hasManageGuild: false, roleIds: ['r1'], adminRoleId: 'admin' }),
    false,
  );
});
test('isAdmin is false with no admin privileges when no admin role is set', () => {
  assert.equal(
    isAdmin({ isGuildOwner: false, hasManageGuild: false, roleIds: ['r1', 'admin'], adminRoleId: null }),
    false,
  );
});
