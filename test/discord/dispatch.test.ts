import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { openDb } from '../../src/db/connection.ts';
import { route } from '../../src/discord/dispatch.ts';
import { LEGAL_URLS } from '../../src/legal/urls.ts';
import { listSubscriptions } from '../../src/repositories/subscriptions.ts';
import { createAdhocEvent, createFixedEvent, getEvent } from '../../src/repositories/events.ts';
import { setTimezone } from '../../src/repositories/users.ts';

function fake(opts: {
  command: string;
  sub?: string;
  values?: Record<string, unknown>;
  admin?: boolean;
  userId?: string;
}) {
  const v = opts.values ?? {};
  const get = (k: string, required?: boolean) => {
    const x = v[k] ?? null;
    if (required && x === null) throw new Error(`missing ${k}`);
    return x;
  };
  return {
    commandName: opts.command,
    guildId: 'g1',
    user: { id: opts.userId ?? 'u1' },
    guild: { ownerId: 'owner' },
    memberPermissions: { has: (f: bigint) => !!opts.admin && f === PermissionFlagsBits.ManageGuild },
    member: { roles: [] },
    options: {
      getSubcommand: () => opts.sub ?? null,
      getInteger: get,
      getString: get,
      getBoolean: get,
    },
  } as never;
}

test('/subscribe without a timezone is refused and creates nothing', async () => {
  const db = openDb(':memory:');
  const eventId = createFixedEvent(db, {
    guildId: 'g1', name: 'KO', description: '', createdBy: 'a', defaultSubscribed: false,
    slots: [{ dayOfWeek: 1, time: '20:00' }],
  });
  const r = await route(fake({ command: 'subscribe', values: { event: eventId } }), db);
  assert.equal(r.ephemeral, true);
  assert.match(r.content, /timezone set/);
  assert.equal(listSubscriptions(db, 'u1').length, 0);
});

test('/legal returns both legal URLs', async () => {
  const r = await route(fake({ command: 'legal' }), openDb(':memory:'));
  assert.ok(r.content.includes(LEGAL_URLS.tos));
  assert.ok(r.content.includes(LEGAL_URLS.privacy));
});

test('/adhoc add passes isAdmin: admin bypasses the cap, non-admin does not', async () => {
  const db = openDb(':memory:');
  setTimezone(db, 'u1', 'UTC');
  for (let n = 0; n < 3; n++) {
    createAdhocEvent(db, { guildId: 'g1', name: `a${n}`, createdBy: 'u1', occurrenceMs: Date.now() + 1e9, creatorTz: 'UTC' });
  }
  const values = { name: 'extra', when: '2099-01-01 10:00' };
  const denied = await route(fake({ command: 'adhoc', sub: 'add', values }), db);
  assert.match(denied.content, /at most 3/);
  const allowed = await route(fake({ command: 'adhoc', sub: 'add', values, admin: true }), db);
  assert.doesNotMatch(allowed.content, /at most 3/);
});

test('/adhoc remove passes isAdmin: only creator or admin may remove', async () => {
  const db = openDb(':memory:');
  const id = createAdhocEvent(db, { guildId: 'g1', name: 'x', createdBy: 'u1', occurrenceMs: Date.now() + 1e9, creatorTz: 'UTC' });
  const values = { event: id };
  const other = await route(fake({ command: 'adhoc', sub: 'remove', values, userId: 'u2' }), db);
  assert.match(other.content, /Only the creator or an admin/);
  assert.ok(getEvent(db, id));
  const admin = await route(fake({ command: 'adhoc', sub: 'remove', values, userId: 'u2', admin: true }), db);
  assert.match(admin.content, /removed/);
  assert.equal(getEvent(db, id), undefined);
});
