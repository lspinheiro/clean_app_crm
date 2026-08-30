"use server";

import { z } from "zod";

import { createPostingSchema } from "@/features/postings/schema";
import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";
import { requireCompanyAdmin } from "@/lib/auth/session";

export type PostingMutationResult =
  | { fieldErrors: Record<string, string>; formError: string | null; ok: false }
  | { ok: true; postingId: string };

export type RevokePostingResult =
  | { error: string; ok: false }
  | { ok: true };

function fieldErrors(error: z.ZodError) {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !result[field]) result[field] = issue.message;
  }
  return result;
}

export async function createPosting(input: unknown): Promise<PostingMutationResult> {
  const parsed = createPostingSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), formError: null, ok: false };
  }

  const { company, supabase } = await requireCompanyAdmin();
  const targetJobId = parsed.data.intent === "one_time" ? parsed.data.targetId : undefined;
  const targetRecurringAssignmentId = parsed.data.intent === "regular"
    ? parsed.data.targetId
    : undefined;
  const { data, error } = await supabase.rpc("create_posting", {
    posting_application_cap: parsed.data.applicationCap,
    posting_expires_at: parsed.data.expiresAt,
    public_description: parsed.data.publicDescription,
    target_company_id: company.id,
    target_intent: parsed.data.intent,
    target_job_id: targetJobId,
    target_recurring_assignment_id: targetRecurringAssignmentId,
  });

  if (error || !data) {
    return {
      fieldErrors: {},
      formError: userMessage("postingCreateFailed"),
      ok: false,
    };
  }

  revalidateLocalizedPath("/cleaners");
  return { ok: true, postingId: data };
}

export async function revokePosting(input: unknown): Promise<RevokePostingResult> {
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) return { error: userMessage("postingRevokeFailed"), ok: false };

  const { supabase } = await requireCompanyAdmin();
  const { error } = await supabase.rpc("revoke_posting", {
    target_posting_id: parsed.data,
  });
  if (error) return { error: userMessage("postingRevokeFailed"), ok: false };

  revalidateLocalizedPath("/cleaners");
  return { ok: true };
}
