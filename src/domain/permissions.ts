export interface AdminInput {
  isGuildOwner: boolean;
  hasManageGuild: boolean;
  roleIds: string[];
  adminRoleId: string | null;
}

export function isAdmin(input: AdminInput): boolean {
  if (input.isGuildOwner) return true;
  if (input.hasManageGuild) return true;
  return input.adminRoleId !== null && input.roleIds.includes(input.adminRoleId);
}
