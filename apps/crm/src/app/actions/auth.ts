"use server";

import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  defaultLocale,
  explicitLocaleCookieName,
  isAppLocale,
  localeCookieMaxAgeSeconds,
  localeCookieName,
} from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { evaluateCrmAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

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
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t("checkDetails") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: t("failed") };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, preferred_locale")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const decision = evaluateCrmAccess({ userId: data.user.id, profile });
  if (decision.kind === "denied") {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    return { error: t("notAuthorised") };
  }

  const cookieStore = await cookies();
  const explicitLocaleValue = cookieStore.get(explicitLocaleCookieName)?.value;
  const explicitLocale = isAppLocale(explicitLocaleValue)
    ? explicitLocaleValue
    : null;
  const targetLocale =
    explicitLocale ??
    (isAppLocale(profile?.preferred_locale)
      ? profile.preferred_locale
      : isAppLocale(locale)
        ? locale
        : defaultLocale);
  if (explicitLocale) {
    let preferenceIsSaved = explicitLocale === profile?.preferred_locale;
    if (!preferenceIsSaved) {
      const { error: localeError } = await supabase.rpc("set_preferred_locale", {
        target_locale: explicitLocale,
      });
      preferenceIsSaved = !localeError;
    }
    if (preferenceIsSaved) cookieStore.delete(explicitLocaleCookieName);
  }
  cookieStore.set(localeCookieName, targetLocale, {
    maxAge: localeCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
  });
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
