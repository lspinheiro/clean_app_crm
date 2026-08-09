"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { evaluateCrmAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginState = { error: string | null };

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Email or password is incorrect." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const decision = evaluateCrmAccess({ userId: data.user.id, profile });
  if (decision.kind === "denied") {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    return { error: "This CRM is for company admins." };
  }

  redirect("/roster");
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  redirect("/login");
}
