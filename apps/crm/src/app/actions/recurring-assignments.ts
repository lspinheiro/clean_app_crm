"use server";

import { firstFieldErrors } from "@/features/clients/schema";
import {
  recurringAssignmentActiveSchema,
  recurringAssignmentSchema,
} from "@/features/recurring-assignments/schema";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";

export type RecurringMutationResult = {
  ok: boolean;
  fieldErrors: Record<string, string>;
  formError: string | null;
};

export async function saveRecurringAssignment(
  input: unknown,
): Promise<RecurringMutationResult> {
  const parsed = recurringAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: firstFieldErrors(parsed.error),
      formError: null,
    };
  }

  const { supabase } = await requireCompanyAdmin();
  const sharedArgs = {
    target_service_id: parsed.data.serviceId,
    target_frequency: parsed.data.frequency,
    target_weekday: parsed.data.weekday,
    target_anchor_date: parsed.data.anchorDate,
    target_local_start_time: parsed.data.startTime,
    target_duration_minutes: parsed.data.durationMinutes,
    target_cleaner_pay_cents: parsed.data.cleanerPayCents,
    target_crew_size: parsed.data.crewSize,
    named_cleaner_ids: parsed.data.cleanerIds,
  };
  const { error } = parsed.data.recurringAssignmentId
    ? await supabase.rpc("update_recurring_assignment", {
        target_recurring_assignment_id: parsed.data.recurringAssignmentId,
        ...sharedArgs,
      })
    : await supabase.rpc("create_recurring_assignment", {
        target_site_id: parsed.data.siteId,
        ...sharedArgs,
      });

  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: userMessage("recurringSaveFailed"),
    };
  }

  revalidateLocalizedPath(`/clients/${parsed.data.clientId}`);
  return { ok: true, fieldErrors: {}, formError: null };
}

export async function setRecurringAssignmentActive(
  input: unknown,
): Promise<RecurringMutationResult> {
  const parsed = recurringAssignmentActiveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: firstFieldErrors(parsed.error),
      formError: null,
    };
  }

  const { supabase } = await requireCompanyAdmin();
  const { error } = await supabase.rpc("set_recurring_assignment_active", {
    target_recurring_assignment_id: parsed.data.recurringAssignmentId,
    target_active: parsed.data.active,
  });
  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: userMessage("recurringStatusSaveFailed"),
    };
  }

  revalidateLocalizedPath(`/clients/${parsed.data.clientId}`);
  return { ok: true, fieldErrors: {}, formError: null };
}
