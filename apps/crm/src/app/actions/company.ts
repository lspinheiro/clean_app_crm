"use server";

import { revalidatePath } from "next/cache";

import {
  COMPANY_LOGO_MAX_BYTES,
} from "@/features/company-identity/compress-logo";
import {
  parseCompanyIdentity,
  type CompanyIdentityFieldErrors,
} from "@/features/company-identity/schema";
import { requireCompanyAdmin } from "@/lib/auth/session";

export type CompanyIdentityActionResult = {
  ok: boolean;
  fieldErrors: CompanyIdentityFieldErrors;
  formError: string | null;
};

export async function updateCompanyIdentity(
  formData: FormData,
): Promise<CompanyIdentityActionResult> {
  const parsed = parseCompanyIdentity({
    name: String(formData.get("name") ?? ""),
    abn: String(formData.get("abn") ?? ""),
  });
  if (!parsed.data) {
    return { ok: false, fieldErrors: parsed.fieldErrors, formError: null };
  }

  const logoValue = formData.get("logo");
  const logo = logoValue instanceof File && logoValue.size > 0 ? logoValue : null;
  if (
    logo &&
    (logo.type !== "image/webp" || logo.size > COMPANY_LOGO_MAX_BYTES)
  ) {
    return {
      ok: false,
      fieldErrors: { logo: "Choose a compressed WebP logo under 400 KB." },
      formError: null,
    };
  }

  const { company, supabase } = await requireCompanyAdmin();
  if (logo) {
    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(`${company.id}/logo.webp`, logo, {
        cacheControl: "3600",
        contentType: "image/webp",
        upsert: true,
      });
    if (uploadError) {
      return {
        ok: false,
        fieldErrors: {},
        formError: "The logo could not be uploaded. Your company details were not changed.",
      };
    }
  }

  const { error: updateError } = await supabase.rpc("update_company_identity", {
    target_company_id: company.id,
    company_name: parsed.data.name,
    company_abn: parsed.data.abn,
    logo_uploaded: Boolean(logo),
  });
  if (updateError) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "Company details could not be saved. Please try again.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, fieldErrors: {}, formError: null };
}
