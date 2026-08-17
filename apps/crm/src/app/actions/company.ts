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
import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";

export type CompanyIdentityActionResult = {
  ok: boolean;
  fieldErrors: CompanyIdentityFieldErrors;
  formError: string | null;
};

function indeterminateSaveResult(): CompanyIdentityActionResult {
  return {
    ok: false,
    fieldErrors: {},
    formError: userMessage("companySaveUnconfirmed"),
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
      fieldErrors: { logo: userMessage("logoUploadType") },
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
            userMessage("logoPrepareFailed"),
        };
      }

      if (reservation.error || !reservation.data) {
        return {
          ok: false,
          fieldErrors: {},
          formError:
            userMessage("logoPrepareFailed"),
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
              userMessage("staleLogoCleanupFailed"),
          };
        }
      } catch {
        return {
          ok: false,
          fieldErrors: {},
          formError:
            userMessage("staleLogoCleanupFailed"),
        };
      }
    }

    if (!candidateReserved) {
      return {
        ok: false,
        fieldErrors: {},
        formError:
          userMessage("staleLogoCleanupFailed"),
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
        formError: userMessage("logoUploadFailed"),
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

  revalidateLocalizedPath("/settings");
  revalidateLocalizedPath("/", "layout");
  return { ok: true, fieldErrors: {}, formError: null };
}
