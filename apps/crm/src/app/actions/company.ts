"use server";

import { randomUUID } from "node:crypto";

import {
  COMPANY_LOGO_MAX_BYTES,
} from "@/features/company-identity/compress-logo";
import {
  parseCompanyIdentity,
  type CompanyIdentityFieldErrors,
} from "@/features/company-identity/schema";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { revalidateLocalizedPath as revalidatePath } from "@/i18n/revalidate";

export type CompanyIdentityActionResult = {
  ok: boolean;
  fieldErrors: CompanyIdentityFieldErrors;
  formError: string | null;
};

function indeterminateSaveResult(): CompanyIdentityActionResult {
  return {
    ok: false,
    fieldErrors: {},
    formError:
      "The save could not be confirmed. Reload before trying again to reconcile your company details and logo.",
  };
}

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
  const logoBucket = supabase.storage.from("company-logos");
  const candidateLogoPath = logo
    ? `${company.id}/logo-${randomUUID()}.webp`
    : null;
  if (logo && candidateLogoPath) {
    let candidateReserved = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let reservation: {
        data: string | null;
        error: { message: string } | null;
      };
      try {
        reservation = await supabase.rpc("reserve_company_logo_upload", {
          target_company_id: company.id,
          requested_object_name: candidateLogoPath,
        });
      } catch {
        return {
          ok: false,
          fieldErrors: {},
          formError:
            "The logo upload could not be prepared. Your company details were not changed.",
        };
      }

      if (reservation.error || !reservation.data) {
        return {
          ok: false,
          fieldErrors: {},
          formError:
            "The logo upload could not be prepared. Your company details were not changed.",
        };
      }
      if (reservation.data === candidateLogoPath) {
        candidateReserved = true;
        break;
      }

      try {
        const { error: staleCleanupError } = await logoBucket.remove([
          reservation.data,
        ]);
        if (staleCleanupError) {
          return {
            ok: false,
            fieldErrors: {},
            formError:
              "A previous pending logo could not be cleared. Your company details were not changed.",
          };
        }
      } catch {
        return {
          ok: false,
          fieldErrors: {},
          formError:
            "A previous pending logo could not be cleared. Your company details were not changed.",
        };
      }
    }

    if (!candidateReserved) {
      return {
        ok: false,
        fieldErrors: {},
        formError:
          "A previous pending logo could not be cleared. Your company details were not changed.",
      };
    }

    let uploadError: { message: string } | null;
    try {
      const result = await logoBucket.upload(candidateLogoPath, logo, {
        cacheControl: "3600",
        contentType: "image/webp",
        upsert: false,
      });
      uploadError = result.error;
    } catch {
      uploadError = { message: "Storage request failed" };
    }
    if (uploadError) {
      return {
        ok: false,
        fieldErrors: {},
        formError: "The logo could not be uploaded. Your company details were not changed.",
      };
    }
  }

  let updateError: { message: string } | null;
  try {
    const result = await supabase.rpc("update_company_identity", {
      target_company_id: company.id,
      company_name: parsed.data.name,
      company_abn: parsed.data.abn,
      company_logo_path: candidateLogoPath ?? undefined,
    });
    updateError = result.error;
  } catch {
    return indeterminateSaveResult();
  }
  if (updateError) {
    return indeterminateSaveResult();
  }

  if (
    candidateLogoPath &&
    company.logo_path &&
    company.logo_path !== candidateLogoPath
  ) {
    try {
      const { error: cleanupError } = await logoBucket.remove([company.logo_path]);
      if (cleanupError) console.error("Previous company logo cleanup failed.");
    } catch {
      console.error("Previous company logo cleanup failed.");
    }
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, fieldErrors: {}, formError: null };
}
