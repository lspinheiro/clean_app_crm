import { z } from "zod";

import { userMessage } from "@/i18n/user-message";

export const employeeMembershipIdSchema = z.uuid();
export const employeeRoleSchema = z.enum(
  ["owner", "staff"],
  userMessage("employeeRoleInvalid"),
);

export const employeeListRowsSchema = z.array(z.object({
  company_id: z.uuid(),
  email: z.email(),
  full_name: z.string().min(1),
  joined_at: z.iso.datetime({ offset: true }),
  membership_id: employeeMembershipIdSchema,
  profile_id: z.uuid(),
  role: employeeRoleSchema,
}));

export const changeEmployeeRoleInputSchema = z.object({
  membershipId: employeeMembershipIdSchema,
  role: employeeRoleSchema,
});

export const removeEmployeeInputSchema = z.object({
  membershipId: employeeMembershipIdSchema,
});

export type EmployeeListItem = {
  email: string;
  fullName: string;
  joinedAt: string;
  membershipId: string;
  profileId: string;
  role: "owner" | "staff";
};
