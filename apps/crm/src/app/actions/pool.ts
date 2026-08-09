"use server";

import { revalidatePath } from "next/cache";

import { requireCompanyAdmin } from "@/lib/auth/session";

export type RotateInviteResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export async function rotatePoolInvite(): Promise<RotateInviteResult> {
  const { company, supabase } = await requireCompanyAdmin();
  const { data, error } = await supabase.rpc("rotate_company_invite", {
    target_company_id: company.id,
  });

  if (error || !data) {
    return {
      ok: false,
      error: "A new invite code could not be generated. Please try again.",
    };
  }

  revalidatePath("/pool");
  return { ok: true, code: data.code };
}
