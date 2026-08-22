export type SettingsPermissionRole = "owner" | "staff";

export type SettingsPermissions = {
  canEditCompanyIdentity: boolean;
  canEditPersonalLocale: boolean;
  canManageEmployees: boolean;
  canManageInvitations: boolean;
  canViewCompanyIdentity: boolean;
  canViewSettings: boolean;
};

export const settingsPermissionMatrix = {
  owner: {
    canEditCompanyIdentity: true,
    canEditPersonalLocale: true,
    canManageEmployees: true,
    canManageInvitations: true,
    canViewCompanyIdentity: true,
    canViewSettings: true,
  },
  staff: {
    canEditCompanyIdentity: false,
    canEditPersonalLocale: true,
    canManageEmployees: false,
    canManageInvitations: false,
    canViewCompanyIdentity: true,
    canViewSettings: true,
  },
} as const satisfies Record<SettingsPermissionRole, SettingsPermissions>;

export function settingsPermissionsForRole(role: SettingsPermissionRole): SettingsPermissions {
  return settingsPermissionMatrix[role];
}
