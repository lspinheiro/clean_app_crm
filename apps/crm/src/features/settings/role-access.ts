import {
  settingsPermissionMatrix,
  type SettingsPermissionRole,
  type SettingsPermissions,
} from "./permissions";

/**
 * The permissions a role explanation speaks for. Every line under the `RoleAccess` message
 * namespace describes these and nothing else, so a line can never promise access the matrix
 * does not grant.
 */
const explainedPermissions = [
  "canEditCompanyIdentity",
  "canManageEmployees",
  "canManageInvitations",
] as const satisfies readonly (keyof SettingsPermissions)[];

/** Key under the shared `RoleAccess` namespace, so both surfaces read one sentence. */
export type RoleAccessMessageKey = "ownerAccess" | "staffAccess";

/**
 * True when the role holds every permission an owner grant hands over. Read off the matrix
 * rather than compared to the literal "owner", so the confirmation follows the permissions if
 * they ever move.
 */
export function grantsFullCompanyControl(role: SettingsPermissionRole): boolean {
  return explainedPermissions.every(
    (permission) => settingsPermissionMatrix[role][permission],
  );
}

export function roleAccessMessageKey(role: SettingsPermissionRole): RoleAccessMessageKey {
  return grantsFullCompanyControl(role) ? "ownerAccess" : "staffAccess";
}
