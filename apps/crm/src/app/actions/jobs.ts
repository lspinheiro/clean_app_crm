"use server";

import { revalidatePath } from "next/cache";

import {
  firstJobFieldErrors,
  oneOffJobSchema,
} from "@/features/jobs/schema";
import { requireCompanyAdmin } from "@/lib/auth/session";

export type JobMutationResult = {
  ok: boolean;
  fieldErrors: Record<string, string>;
  formError: string | null;
  jobId: string | null;
};

export async function createOneOffJob(
  formData: FormData,
): Promise<JobMutationResult> {
  const parsed = oneOffJobSchema.safeParse({
    siteId: String(formData.get("siteId") ?? ""),
    serviceId: String(formData.get("serviceId") ?? ""),
    date: String(formData.get("date") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    durationHours: String(formData.get("durationHours") ?? ""),
    cleanerPayAud: String(formData.get("cleanerPayAud") ?? ""),
    clientChargeAud: String(formData.get("clientChargeAud") ?? ""),
    crewSize: String(formData.get("crewSize") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    mode: String(formData.get("mode") ?? ""),
  });
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: firstJobFieldErrors(parsed.error),
      formError: null,
      jobId: null,
    };
  }

  const { supabase } = await requireCompanyAdmin();
  let data: string | null;
  let error: { message: string } | null;
  let status: number | undefined;
  try {
    ({ data, error, status } = await supabase.rpc("create_one_off_job", {
      target_site_id: parsed.data.siteId,
      target_service_id: parsed.data.serviceId,
      target_local_date: parsed.data.date,
      target_local_start_time: parsed.data.startTime,
      target_duration_minutes: parsed.data.durationMinutes,
      target_cleaner_pay_cents: parsed.data.cleanerPayCents,
      target_crew_size: parsed.data.crewSize,
      target_post_now: parsed.data.postNow,
      target_client_charge_cents: parsed.data.clientChargeCents ?? undefined,
      target_notes: parsed.data.notes ?? undefined,
    }));
  } catch {
    revalidatePath("/jobs");
    return {
      ok: false,
      fieldErrors: {},
      formError:
        "The save could not be confirmed. Refresh Jobs before trying again.",
      jobId: null,
    };
  }

  if (error && status === 0) {
    revalidatePath("/jobs");
    return {
      ok: false,
      fieldErrors: {},
      formError:
        "The save could not be confirmed. Refresh Jobs before trying again.",
      jobId: null,
    };
  }

  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "The job could not be saved. Please try again.",
      jobId: null,
    };
  }

  if (!data) {
    revalidatePath("/jobs");
    return {
      ok: false,
      fieldErrors: {},
      formError:
        "The save could not be confirmed. Refresh Jobs before trying again.",
      jobId: null,
    };
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${data}`);
  revalidatePath("/roster");
  return {
    ok: true,
    fieldErrors: {},
    formError: null,
    jobId: data,
  };
}
