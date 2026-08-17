"use server";

import {
  assignJobSlotSchema,
  firstJobFieldErrors,
  jobIdSchema,
  oneOffJobSchema,
} from "@/features/jobs/schema";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";

export type JobMutationResult = {
  ok: boolean;
  fieldErrors: Record<string, string>;
  formError: string | null;
  jobId: string | null;
};

export type JobOperationResult =
  | { ok: true; formError: null }
  | { ok: false; formError: string };

export async function createOneOffJob(
  formData: FormData,
): Promise<JobMutationResult> {
  const parsed = oneOffJobSchema.safeParse({
    clientId: String(formData.get("clientId") ?? ""),
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
    revalidateJobCollections();
    return {
      ok: false,
      fieldErrors: {},
      formError:
        userMessage("jobSaveUnconfirmed"),
      jobId: null,
    };
  }

  if (error && status === 0) {
    revalidateJobCollections();
    return {
      ok: false,
      fieldErrors: {},
      formError:
        userMessage("jobSaveUnconfirmed"),
      jobId: null,
    };
  }

  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: userMessage("jobSaveFailed"),
      jobId: null,
    };
  }

  if (!data) {
    revalidateJobCollections();
    return {
      ok: false,
      fieldErrors: {},
      formError:
        userMessage("jobSaveUnconfirmed"),
      jobId: null,
    };
  }

  revalidateJobConsumers(data);
  return {
    ok: true,
    fieldErrors: {},
    formError: null,
    jobId: data,
  };
}

export async function assignJobSlot(
  formData: FormData,
): Promise<JobOperationResult> {
  const parsed = assignJobSlotSchema.safeParse({
    jobId: String(formData.get("jobId") ?? ""),
    slotNumber: String(formData.get("slotNumber") ?? ""),
    cleanerId: String(formData.get("cleanerId") ?? ""),
  });
  if (!parsed.success) {
    return {
      ok: false,
      formError: userMessage("validAssignment"),
    };
  }

  const { supabase } = await requireCompanyAdmin();
  let data: string | null;
  let error: { message: string } | null;
  let status: number | undefined;
  try {
    ({ data, error, status } = await supabase.rpc("assign_job_slot", {
      target_job_id: parsed.data.jobId,
      target_slot_number: parsed.data.slotNumber,
      target_cleaner_id: parsed.data.cleanerId,
    }));
  } catch {
    revalidateJobConsumers(parsed.data.jobId);
    return {
      ok: false,
      formError:
        userMessage("assignmentUnconfirmed"),
    };
  }

  revalidateJobConsumers(parsed.data.jobId);
  if (error) {
    if (error.message === "Cleaner is unavailable for this time") {
      return {
        ok: false,
        formError: userMessage("cleanerUnavailable"),
      };
    }
    if (
      error.message === "Crew slot is already assigned" ||
      error.message === "Cleaner already has a slot on this job" ||
      error.message === "Job is not open for assignment"
    ) {
      return {
        ok: false,
        formError:
          userMessage("jobChanged"),
      };
    }
    if (status === 0) {
      return {
        ok: false,
        formError:
          userMessage("assignmentUnconfirmed"),
      };
    }
    return {
      ok: false,
      formError:
        userMessage("cleanerAssignFailed"),
    };
  }

  if (!data) {
    return {
      ok: false,
      formError:
        userMessage("assignmentUnconfirmed"),
    };
  }

  return { ok: true, formError: null };
}

export async function cancelJob(jobId: string): Promise<JobOperationResult> {
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) {
    return { ok: false, formError: userMessage("jobCancelFailed") };
  }

  const { supabase } = await requireCompanyAdmin();
  let error: { message: string } | null;
  let status: number | undefined;
  try {
    ({ error, status } = await supabase.rpc("cancel_job", {
      target_job_id: parsed.data,
    }));
  } catch {
    revalidateJobConsumers(parsed.data);
    return {
      ok: false,
      formError:
        userMessage("cancellationUnconfirmed"),
    };
  }

  revalidateJobConsumers(parsed.data);
  if (error && status === 0) {
    return {
      ok: false,
      formError:
        userMessage("cancellationUnconfirmed"),
    };
  }
  if (error) {
    return {
      ok: false,
      formError:
        userMessage("jobCancelChanged"),
    };
  }

  return { ok: true, formError: null };
}

function revalidateJobConsumers(jobId: string) {
  revalidateLocalizedPath(`/jobs/${jobId}`);
  revalidateJobCollections();
}

function revalidateJobCollections() {
  revalidateLocalizedPath("/jobs");
  revalidateLocalizedPath("/roster");
}
