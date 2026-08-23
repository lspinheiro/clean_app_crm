"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandBubbles } from "@/components/brand-bubbles";
import { accessErrorKey, type AccessErrorKey } from "@/features/my-jobs/access";
import { toMyJobs } from "@/features/my-jobs/model";
import { statusErrorKey, type StatusErrorKey } from "@/features/my-jobs/status";
import type { JobStatus, MyJobRow } from "@/features/my-jobs/types";
import type { AppLocale } from "@/i18n/config";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

import { MyJobCard, type JobAccess } from "./my-job-card";

// Only the columns the card renders. The view holds no address and no access notes at
// all, so this query cannot leak them — the address arrives separately, through
// get_cleaner_job_access, and only when she asks for it.
const myJobColumns =
  "assignment_id, job_id, slot_number, company_name, site_name, suburb, service_name, service_slug, status, scheduled_start, duration_minutes, cleaner_pay_cents";

/** How long the job-done confirmation stays armed. */
const CONFIRM_WINDOW_MS = 4000;

type MyJobsErrorKey = AccessErrorKey | StatusErrorKey;

type ListState =
  | { status: "loading" }
  | { status: "ready"; rows: MyJobRow[] }
  | { status: "error" };

async function loadMyJobs(): Promise<ListState> {
  const { data, error } = await getSupabaseClient()
    .from("cleaner_my_jobs")
    .select(myJobColumns)
    .order("scheduled_start");

  if (error) return { status: "error" };
  return { status: "ready", rows: (data ?? []) as MyJobRow[] };
}

/**
 * Where a job stands on the list she can actually see. `absent` covers both "no longer
 * listed" and "the list could not be read" — in either case no card exists to carry a
 * message about that job.
 */
function standingOf(list: ListState, jobId: string): JobStatus | "absent" {
  if (list.status !== "ready") return "absent";

  const row = list.rows.find((candidate) => candidate.job_id === jobId);
  return row ? row.status : "absent";
}

export default function MyJobsPage() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("MyJobs");
  const commonT = useTranslations("Common");
  const cleaner = useCleaner();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [pendingJobIds, setPendingJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const [access, setAccess] = useState<Record<string, JobAccess>>({});
  const [errors, setErrors] = useState<Record<string, MyJobsErrorKey>>({});
  const [notice, setNotice] = useState<MyJobsErrorKey | null>(null);
  const [confirmingJobId, setConfirmingJobId] = useState<string | null>(null);

  // What is on screen right now, readable without re-creating the callbacks every render.
  const shown = useRef<ListState>({ status: "loading" });

  // Two cards mutating at once issue one list read each, and the older read may answer
  // last. Ticket each read as it is *issued* and apply only the newest to land — otherwise
  // a stale snapshot silently undoes the other card's work.
  const issuedTicket = useRef(0);
  const appliedTicket = useRef(0);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readList = useCallback(async () => {
    const ticket = ++issuedTicket.current;
    const next = await loadMyJobs();

    if (ticket > appliedTicket.current) {
      appliedTicket.current = ticket;
      shown.current = next;
      setList(next);
    }
  }, []);

  useEffect(() => {
    void readList();
  }, [readList]);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const clearConfirm = useCallback(() => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    setConfirmingJobId(null);
  }, []);

  // One card at a time may be armed: arming a second disarms the first, so a phone in a
  // pocket never holds two live commits.
  const confirmToggle = useCallback((jobId: string) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingJobId(jobId);
    confirmTimer.current = setTimeout(() => setConfirmingJobId(null), CONFIRM_WINDOW_MS);
  }, []);

  const runOnJob = useCallback(
    async (jobId: string, mutate: () => Promise<StatusErrorKey | null>) => {
      const before = standingOf(shown.current, jobId);

      setPendingJobIds((previous) => new Set(previous).add(jobId));
      setNotice(null);
      setErrors((previous) => {
        if (!(jobId in previous)) return previous;
        const rest = { ...previous };
        delete rest[jobId];
        return rest;
      });

      const failure = await mutate();
      await readList();

      // A failed status change usually means the job has moved on without her, and a job
      // that has moved on is often no longer on this list at all — so route the message by
      // where the job ended up rather than pinning it to a card that may have unmounted.
      if (failure) {
        const after = standingOf(shown.current, jobId);

        if (after === "absent") setNotice(failure);
        else if (after === before) {
          setErrors((previous) => ({ ...previous, [jobId]: failure }));
        }
        // Otherwise the re-read already changed what the card says, and the failed
        // attempt's message would sit there contradicting the state beside it.
      }

      setPendingJobIds((previous) => {
        const rest = new Set(previous);
        rest.delete(jobId);
        return rest;
      });
    },
    [readList],
  );

  const advance = useCallback(
    (jobId: string, to: JobStatus) => {
      clearConfirm();
      void runOnJob(jobId, async () => {
        const { error } = await getSupabaseClient().rpc("update_job_status", {
          target_job_id: jobId,
          target_new_status: to,
        });
        return error ? statusErrorKey(error) : null;
      });
    },
    [clearConfirm, runOnJob],
  );

  // Not routed through runOnJob: revealing an address does not change the list, so there
  // is nothing to re-read and no standing to compare against.
  const showAddress = useCallback(async (jobId: string) => {
    setPendingJobIds((previous) => new Set(previous).add(jobId));
    setErrors((previous) => {
      if (!(jobId in previous)) return previous;
      const rest = { ...previous };
      delete rest[jobId];
      return rest;
    });

    const { data, error } = await getSupabaseClient().rpc("get_cleaner_job_access", {
      target_job_id: jobId,
    });
    const found = Array.isArray(data) ? data[0] : null;

    if (error || !found) {
      setErrors((previous) => ({
        ...previous,
        [jobId]: accessErrorKey(error),
      }));
    } else {
      setAccess((previous) => ({
        ...previous,
        [jobId]: { address: found.address, accessNotes: found.access_notes ?? "" },
      }));
    }

    setPendingJobIds((previous) => {
      const rest = new Set(previous);
      rest.delete(jobId);
      return rest;
    });
  }, []);

  const jobs = useMemo(
    () => (list.status === "ready" ? toMyJobs(list.rows, locale) : []),
    [list, locale],
  );

  // The layout holds the gate; this only renders once it has allowed the cleaner through.
  if (cleaner.status !== "allowed") return null;

  return (
    <main className="screen">
      <div>
        <h1 className="screen-title">{t("title")}</h1>
      </div>

      {/* Sits outside the list on purpose: it carries the reasons whose card has gone, and
          it has to survive the re-read failing and replacing the list wholesale. */}
      {notice ? (
        <p className="board-notice" role="alert">
          {t(notice)}
        </p>
      ) : null}

      {list.status === "loading" ? <MyJobsSkeleton label={t("loading")} /> : null}

      {list.status === "error" ? (
        <div className="empty-state empty-state--error">
          <BrandBubbles size={44} />
          <div>
            <p className="empty-state__title">{t("loadErrorTitle")}</p>
            <p>{t("loadErrorBody")}</p>
          </div>
          <button
            className="button button--secondary button--small"
            onClick={() => {
              shown.current = { status: "loading" };
              setList({ status: "loading" });
              void readList();
            }}
            type="button"
          >
            {commonT("retry")}
          </button>
        </div>
      ) : null}

      {list.status === "ready" && jobs.length === 0 ? (
        <div className="empty-state">
          <BrandBubbles size={44} />
          <div>
            <p className="empty-state__title">{t("emptyTitle")}</p>
            <p>{t("emptyBody")}</p>
          </div>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <ul aria-label={t("list")} className="vacancy-list">
          {jobs.map((job) => (
            <MyJobCard
              access={access[job.jobId] ?? null}
              busy={pendingJobIds.has(job.jobId)}
              confirming={confirmingJobId === job.jobId}
              error={errors[job.jobId] ? t(errors[job.jobId]) : null}
              job={job}
              key={job.jobId}
              onAdvance={advance}
              onConfirmToggle={confirmToggle}
              onShowAddress={(jobId) => void showAddress(jobId)}
            />
          ))}
        </ul>
      ) : null}
    </main>
  );
}

function MyJobsSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-busy="true" className="board-skeleton" role="status">
      <span className="visually-hidden">{label}</span>
      {[0, 1, 2].map((item) => (
        <div aria-hidden="true" className="board-skeleton__card" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
