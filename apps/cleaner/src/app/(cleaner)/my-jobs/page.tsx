"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { describeAccessError } from "@/features/my-jobs/access";
import { toMyJobs } from "@/features/my-jobs/model";
import { describeStatusError } from "@/features/my-jobs/status";
import type { JobStatus, MyJob, MyJobRow } from "@/features/my-jobs/types";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

import { MyJobCard, type JobAccess } from "./my-job-card";

// Only the columns the card renders. The view holds no address and no access notes at
// all, so this query cannot leak them — the address arrives separately, through
// get_cleaner_job_access, and only when she asks for it.
const myJobColumns =
  "assignment_id, job_id, slot_number, company_name, site_name, suburb, service_name, status, scheduled_start, duration_minutes, cleaner_pay_cents";

/** How long the job-done confirmation stays armed. */
const CONFIRM_WINDOW_MS = 4000;

type ListState =
  | { status: "loading" }
  | { status: "ready"; jobs: MyJob[] }
  | { status: "error" };

async function loadMyJobs(): Promise<ListState> {
  const { data, error } = await getSupabaseClient()
    .from("cleaner_my_jobs")
    .select(myJobColumns)
    .order("scheduled_start");

  if (error) return { status: "error" };
  return { status: "ready", jobs: toMyJobs((data ?? []) as MyJobRow[]) };
}

/**
 * Where a job stands on the list she can actually see. `absent` covers both "no longer
 * listed" and "the list could not be read" — in either case no card exists to carry a
 * message about that job.
 */
function standingOf(list: ListState, jobId: string): JobStatus | "absent" {
  if (list.status !== "ready") return "absent";

  const job = list.jobs.find((candidate) => candidate.jobId === jobId);
  return job ? job.status : "absent";
}

export default function MyJobsPage() {
  const cleaner = useCleaner();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [pendingJobIds, setPendingJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const [access, setAccess] = useState<Record<string, JobAccess>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
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
    async (jobId: string, mutate: () => Promise<string | null>) => {
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
        return error ? describeStatusError(error) : null;
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
      setErrors((previous) => ({ ...previous, [jobId]: describeAccessError(error) }));
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

  // The layout holds the gate; this only renders once it has allowed the cleaner through.
  if (cleaner.status !== "allowed") return null;

  const jobs = list.status === "ready" ? list.jobs : [];

  return (
    <main className="screen">
      <div>
        <h1 className="screen-title">My jobs</h1>
      </div>

      {/* Sits outside the list on purpose: it carries the reasons whose card has gone, and
          it has to survive the re-read failing and replacing the list wholesale. */}
      {notice ? (
        <p className="board-notice" role="alert">
          {notice}
        </p>
      ) : null}

      {list.status === "loading" ? <p className="screen-lead">Loading…</p> : null}

      {list.status === "error" ? (
        <div className="empty-state">
          <p>We could not load your jobs.</p>
          <p>Check your connection and open the app again.</p>
        </div>
      ) : null}

      {list.status === "ready" && jobs.length === 0 ? (
        <div className="empty-state">
          <p>No jobs yet.</p>
          <p>When a company gives you a job, it appears here.</p>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <ul aria-label="My jobs" className="vacancy-list">
          {jobs.map((job) => (
            <MyJobCard
              access={access[job.jobId] ?? null}
              busy={pendingJobIds.has(job.jobId)}
              confirming={confirmingJobId === job.jobId}
              error={errors[job.jobId] ?? null}
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
