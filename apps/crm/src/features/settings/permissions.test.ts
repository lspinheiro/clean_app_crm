import { describe, expect, it } from "vitest";

import { settingsPermissionsForRole } from "./permissions";

describe("settings permission matrix", () => {
  it("lets staff manage their own preferences and view company identity", () => {
    expect(settingsPermissionsForRole("staff")).toEqual({
      canEditCompanyIdentity: false,
      canEditPersonalLocale: true,
      canManageEmployees: false,
      canManageInvitations: false,
      canViewCompanyIdentity: true,
      canViewSettings: true,
    });
  });

  it("lets owners administer company settings", () => {
    expect(settingsPermissionsForRole("owner")).toEqual({
      canEditCompanyIdentity: true,
      canEditPersonalLocale: true,
      canManageEmployees: true,
      canManageInvitations: true,
      canViewCompanyIdentity: true,
      canViewSettings: true,
    });
  });
});
