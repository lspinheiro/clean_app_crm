"use server";

import {
  jobOfferRevocationSchema,
  jobOfferSchema,
} from "@/features/jobs/schema";
import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";
import { requireCompanyAdmin } from "@/lib/auth/session";

export type JobOfferOperationResult =
  | { ok: true; formError: null }
  | { ok: false; formError: string };

export async function offerJob(
  formData: FormData,
): Promise<JobOfferOperationResult> {
  const parsed = jobOfferSchema.safeParse({
    jobId: String(formData.get("jobId") ?? ""),
    cleanerId: String(formData.get("cleanerId") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, formError: userMessage("validJobOffer") };
  }

  const { supabase } = await requireCompanyAdmin();
  let data: string | null;
  let error: { message: string } | null;
  let status: number | undefined;
  try {
    ({ data, error, status } = await supabase.rpc("offer_job", {
      target_job_id: parsed.data.jobId,
      target_cleaner_id: parsed.data.cleanerId,
    }));
  } catch {
    revalidateJobOfferConsumers(parsed.data.jobId);
    return { ok: false, formError: userMessage("jobOfferUnconfirmed") };
  }

  revalidateJobOfferConsumers(parsed.data.jobId);
  if (error) {
    return {
      ok: false,
      formError: status === 0
        ? userMessage("jobOfferUnconfirmed")
        : userMessage("jobOfferChanged"),
    };
  }
  if (!data) {
    return { ok: false, formError: userMessage("jobOfferUnconfirmed") };
  }
  return { ok: true, formError: null };
}

export async function revokeJobOffer(
  jobId: string,
  offerId: string,
): Promise<JobOfferOperationResult> {
  const parsed = jobOfferRevocationSchema.safeParse({ jobId, offerId });
  if (!parsed.success) {
    return { ok: false, formError: userMessage("validJobOffer") };
  }

  const { supabase } = await requireCompanyAdmin();
  let error: { message: string } | null;
  let status: number | undefined;
  try {
    ({ error, status } = await supabase.rpc("revoke_offer", {
      target_offer_id: parsed.data.offerId,
    }));
  } catch {
    revalidateJobOfferConsumers(parsed.data.jobId);
    return { ok: false, formError: userMessage("jobOfferUnconfirmed") };
  }

  revalidateJobOfferConsumers(parsed.data.jobId);
  if (error) {
    return {
      ok: false,
      formError: status === 0
        ? userMessage("jobOfferUnconfirmed")
        : userMessage("jobOfferChanged"),
    };
  }
  return { ok: true, formError: null };
}

function revalidateJobOfferConsumers(jobId: string) {
  revalidateLocalizedPath(`/jobs/${jobId}`);
  revalidateLocalizedPath("/jobs");
  revalidateLocalizedPath("/roster");
}
