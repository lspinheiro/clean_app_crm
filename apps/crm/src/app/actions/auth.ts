"use server";

import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  defaultLocale,
  isAppLocale,
  localeCookieMaxAgeSeconds,
  localeCookieName,
} from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
  fieldErrors: { email?: string; password?: string };
};

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const locale = await getLocale();
  const t = await getTranslations("Auth");
  const loginSchema = z.object({
    email: z.email(t("invalidEmail")),
    password: z.string().min(1, t("passwordRequired")),
  });
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    return {
      error: null,
      fieldErrors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: t("failed"), fieldErrors: {} };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, preferred_locale")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    return { error: t("notAuthorised"), fieldErrors: {} };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("employee_memberships")
    .select("company_id")
    .eq("profile_id", data.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;

  const cookieStore = await cookies();
  const targetLocale =
    isAppLocale(profile?.preferred_locale)
      ? profile.preferred_locale
      : isAppLocale(locale)
        ? locale
        : defaultLocale;
  cookieStore.set(localeCookieName, targetLocale, {
    maxAge: localeCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
  });
  if (!membership) {
    return redirect({ href: "/no-company-access", locale: targetLocale });
  }
  return redirect({ href: "/roster", locale: targetLocale });
}

export async function signOutAction() {
  const locale = await getLocale();
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return redirect({
    href: "/login",
    locale: isAppLocale(locale) ? locale : defaultLocale,
  });
}
