"use server";

import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import {
  parseFirstAdminAcceptance,
  type FirstAdminAcceptanceFieldErrors,
  type FirstAdminAcceptanceInput,
} from "@/features/first-admin/schema";
import {
  defaultLocale,
  isAppLocale,
  localeCookieMaxAgeSeconds,
  localeCookieName,
} from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";
import { createClient } from "@/lib/supabase/server";

export type FirstAdminState = {
  fieldErrors: FirstAdminAcceptanceFieldErrors;
  formError: string | null;
};

export const initialFirstAdminState: FirstAdminState = {
  fieldErrors: {},
  formError: null,
};

function localiseErrors(
  fieldErrors: FirstAdminAcceptanceFieldErrors,
  locale: "en-AU" | "pt-BR",
): FirstAdminAcceptanceFieldErrors {
  return {
    abn: localiseUserMessage(fieldErrors.abn, locale) ?? undefined,
    companyName: localiseUserMessage(fieldErrors.companyName, locale) ?? undefined,
    confirmPassword: localiseUserMessage(fieldErrors.confirmPassword, locale) ?? undefined,
    fullName: localiseUserMessage(fieldErrors.fullName, locale) ?? undefined,
    locale: localiseUserMessage(fieldErrors.locale, locale) ?? undefined,
    password: localiseUserMessage(fieldErrors.password, locale) ?? undefined,
    phone: localiseUserMessage(fieldErrors.phone, locale) ?? undefined,
  };
}

export async function acceptFirstAdminAction(
  _previous: FirstAdminState,
  formData: FormData,
): Promise<FirstAdminState> {
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  const t = await getTranslations("FirstAdminInvitation");
  const input: FirstAdminAcceptanceInput = {
    abn: String(formData.get("abn") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    locale: String(formData.get("locale") ?? ""),
    password: String(formData.get("password") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };
  const parsed = parseFirstAdminAcceptance(input);
  if (!parsed.data) {
    return {
      fieldErrors: localiseErrors(parsed.fieldErrors, locale),
      formError: null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.email) {
    return { fieldErrors: {}, formError: t("formUnavailable") };
  }

  const { data: context, error: contextError } = await supabase.rpc(
    "get_first_admin_invitation_context",
  );
  if (contextError || context?.[0]?.invitation_status !== "pending") {
    return { fieldErrors: {}, formError: t("formUnavailable") };
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (passwordError) {
    return {
      fieldErrors: { password: t("passwordRejected") },
      formError: null,
    };
  }

  const { error: acceptanceError } = await supabase.rpc(
    "accept_first_admin_invitation",
    {
      company_abn: parsed.data.abn,
      company_name: parsed.data.companyName,
      contact_phone: parsed.data.phone,
      full_name: parsed.data.fullName,
      target_locale: parsed.data.locale,
    },
  );
  if (acceptanceError) {
    return { fieldErrors: {}, formError: t("formUnavailable") };
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, parsed.data.locale, {
    maxAge: localeCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
  });
  return redirect({ href: "/onboarding", locale: parsed.data.locale });
}
