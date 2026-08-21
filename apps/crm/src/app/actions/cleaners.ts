"use server";

import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";
import { requireCompanyAdmin } from "@/lib/auth/session";

export type RotateInviteResult =
  | { ok: true; code: string; inviteId: string }
  | { ok: false; error: string };

export async function rotateCleanerInvite(): Promise<RotateInviteResult> {
  const { company, supabase } = await requireCompanyAdmin();
  const { data, error } = await supabase.rpc("rotate_company_invite", {
    target_company_id: company.id,
  });

  if (error || !data) {
    return {
      ok: false,
      error: userMessage("inviteRotateFailed"),
    };
  }

  revalidateLocalizedPath("/cleaners");
  return { ok: true, code: data.code, inviteId: data.id };
}
