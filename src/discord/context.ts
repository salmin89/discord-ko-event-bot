import { PermissionFlagsBits } from 'discord.js';
import type { AdminInput } from '../domain/permissions.ts';
import type { Slot } from '../domain/recurrence.ts';
import type { GuildConfig } from '../repositories/guildConfig.ts';

type RoleList = { cache: Iterable<[string, unknown]> } | string[];

/** The parts of a discord.js interaction that admin checks need. */
export interface AdminSource {
  user: { id: string };
  guild: { ownerId: string } | null;
  memberPermissions: { has(flag: bigint): boolean } | null;
  member: { roles: RoleList } | null;
}

export function buildAdminCtx(interaction: AdminSource, guildConfig: GuildConfig | undefined): AdminInput {
  const roles = interaction.member?.roles;
  const roleIds = Array.isArray(roles) ? roles : roles ? [...roles.cache].map(([id]) => id) : [];
  return {
    isGuildOwner: interaction.guild?.ownerId === interaction.user.id,
    hasManageGuild: interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
    roleIds,
    adminRoleId: guildConfig?.adminRoleId ?? null,
  };
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Parse "Mon 20:00, Thu 18:30" (day name or 1-7). Returns null if a part is unreadable. */
export function parseSlots(text: string): Slot[] | null {
  const slots: Slot[] = [];
  for (const part of text.split(',')) {
    const m = part.trim().match(/^(\w+)\s+(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const day = DAYS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1 || Number(m[1]);
    if (!Number.isInteger(day) || day < 1 || day > 7) return null;
    slots.push({ dayOfWeek: day, time: m[2].padStart(5, '0') });
  }
  return slots;
}
