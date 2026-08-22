"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";

import {
  parseCompanyCreation,
  type CompanyCreationFieldErrors,
  type CompanyCreationInput,
} from "@/features/company-creation/schema";
import type { CompanyCreationState } from "@/features/company-creation/state";
import { defaultLocale, isAppLocale, type AppLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";
import { requireCompanyAdmin } from "@/lib/auth/session";

function localiseErrors(
  errors: CompanyCreationFieldErrors,
  locale: AppLocale,
): CompanyCreationFieldErrors {
  return {
    abn: localiseUserMessage(errors.abn, locale) ?? undefined,
    companyName: localiseUserMessage(errors.companyName, locale) ?? undefined,
  };
}

export async function createCompanyAction(
  _previous: CompanyCreationState,
  formData: FormData,
): Promise<CompanyCreationState> {
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  const t = await getTranslations("CompanyCreation");
  const values: CompanyCreationInput = {
    abn: String(formData.get("abn") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
  };
  const parsed = parseCompanyCreation(values);

  if (!parsed.data) {
    return {
      fieldErrors: localiseErrors(parsed.fieldErrors, locale),
      formError: null,
      values,
    };
  }

  const { supabase } = await requireCompanyAdmin();
  const { data, error } = await supabase.rpc("create_company", {
    company_abn: parsed.data.abn,
    company_name: parsed.data.companyName,
  });

  if (error?.code === "23505") {
    return {
      fieldErrors: { abn: t("duplicateAbn") },
      formError: null,
      values: parsed.data,
    };
  }

  if (error || !data) {
    return {
      fieldErrors: {},
      formError: t("failed"),
      values: parsed.data,
    };
  }

  revalidatePath("/", "layout");
  return redirect({ href: "/onboarding", locale });
}
