"use server";

import { z } from "zod";

import {
  changeEmployeeRoleInputSchema,
  removeEmployeeInputSchema,
} from "@/features/employee-management/schema";
import type { EmployeeManagementActionResult } from "@/features/employee-management/state";
import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";
import { requireCompanyOwner } from "@/lib/auth/session";

const rpcErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
});

function failure(error: unknown): EmployeeManagementActionResult {
  const parsed = rpcErrorSchema.safeParse(error);
  if (
    parsed.success
    && parsed.data.code === "23514"
    && parsed.data.message.includes("Company must retain at least one active owner")
  ) {
    return { formError: userMessage("lastCompanyOwnerRequired"), ok: false };
  }
  return { formError: userMessage("employeeManagementFailed"), ok: false };
}

export async function changeEmployeeRoleAction(
  input: unknown,
): Promise<EmployeeManagementActionResult> {
  const parsed = changeEmployeeRoleInputSchema.safeParse(input);
  if (!parsed.success) {
    const roleIssue = parsed.error.issues.find((issue) => issue.path[0] === "role");
    return {
      formError: roleIssue?.message ?? userMessage("employeeManagementInvalid"),
      ok: false,
    };
  }

  const { company, supabase } = await requireCompanyOwner();
  try {
    const { error } = await supabase.rpc("change_employee_role", {
      target_company_id: company.id,
      target_membership_id: parsed.data.membershipId,
      target_role: parsed.data.role,
    });
    if (error) return failure(error);
  } catch (error) {
    return failure(error);
  }

  revalidateLocalizedPath("/settings");
  return { ok: true };
}

export async function removeEmployeeAction(
  input: unknown,
): Promise<EmployeeManagementActionResult> {
  const parsed = removeEmployeeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { formError: userMessage("employeeManagementInvalid"), ok: false };
  }

  const { company, supabase } = await requireCompanyOwner();
  try {
    const { error } = await supabase.rpc("remove_employee", {
      target_company_id: company.id,
      target_membership_id: parsed.data.membershipId,
    });
    if (error) return failure(error);
  } catch (error) {
    return failure(error);
  }

  revalidateLocalizedPath("/settings");
  return { ok: true };
}
