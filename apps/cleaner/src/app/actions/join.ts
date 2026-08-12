"use server";

import { redirect } from "next/navigation";

import { describeJoinFailure, normaliseInviteCode } from "@/features/join/invite";
import { registrationSchema } from "@/features/join/schema";
import { createClient } from "@/lib/supabase/server";

export type JoinState = { error: string | null };

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

export async function joinAction(
  _previous: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const code = normaliseInviteCode(field(formData, "code"));
  if (!code) {
    return { error: "This invite link is missing its code. Ask the company to send it again." };
  }

  const parsed = registrationSchema.safeParse({
    fullName: field(formData, "fullName"),
    email: field(formData, "email"),
    password: field(formData, "password"),
    phone: field(formData, "phone"),
    suburb: field(formData, "suburb"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) {
    return {
      error: "We could not create your account. Check your email address, or sign in if you already have one.",
    };
  }
  if (!data.session) {
    return { error: "Check your email to confirm your account, then open this link again." };
  }

  const { error: joinError } = await supabase.rpc("join_company_pool", {
    invite_code: code,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    suburb: parsed.data.suburb,
  });
  if (joinError) return { error: describeJoinFailure(joinError.message) };

  redirect("/board");
}
