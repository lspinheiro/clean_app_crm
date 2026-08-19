"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { describeApplyError, describeWithdrawError } from "@/features/board/application";
import { toVacancies } from "@/features/board/model";
import type { ApplicationStatus, BoardRow, Vacancy } from "@/features/board/types";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

import { VacancyCard } from "./vacancy-card";

// Only the columns the card renders. The view holds no address, access notes, client phone,
// or client charge at all, so the board cannot leak them — this keeps the payload small.
// `my_application_status` is her own application on the job, and it is what makes the
// waiting state survive a reload: the state lives in the database, not in this component.
const boardColumns =
  "job_id, company_name, site_name, suburb, service_name, scheduled_start, duration_minutes, cleaner_pay_cents, crew_size, crew_slot, my_application_status";

type BoardState =
  | { status: "loading" }
  | { status: "ready"; vacancies: Vacancy[] }
  | { status: "error" };

async function loadBoard(): Promise<BoardState> {
  const { data, error } = await getSupabaseClient()
    .from("cleaner_job_board")
    .select(boardColumns)
    .order("scheduled_start");

  if (error) return { status: "error" };
  return { status: "ready", vacancies: toVacancies((data ?? []) as BoardRow[]) };
}

/**
 * Where a job stands on the board she can actually see. `absent` covers both "no longer on
 * the board" and "the board could not be read" — in either case no card exists to carry a
 * message about that job.
 */
type JobStanding = ApplicationStatus | null | "absent";

function standingOf(board: BoardState, jobId: string): JobStanding {
  if (board.status !== "ready") return "absent";

  const vacancy = board.vacancies.find((candidate) => candidate.jobId === jobId);
  return vacancy ? vacancy.applicationStatus : "absent";
}

export default function BoardPage() {
  const router = useRouter();
  const cleaner = useCleaner();
  const [board, setBoard] = useState<BoardState>({ status: "loading" });
  const [pendingJobIds, setPendingJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  // What is on screen right now, readable without re-creating the callbacks on every render.
  const shown = useRef<BoardState>({ status: "loading" });

  // Two cards mutating at once issue one board read each, and the older read may answer
  // last. Ticket each read as it is *issued* and apply only the newest to land — otherwise
  // a stale snapshot silently undoes the other card's work.
  const issuedTicket = useRef(0);
  const appliedTicket = useRef(0);

  const readBoard = useCallback(async () => {
    const ticket = ++issuedTicket.current;
    const next = await loadBoard();

    if (ticket > appliedTicket.current) {
      appliedTicket.current = ticket;
      shown.current = next;
      setBoard(next);
    }
  }, []);

  useEffect(() => {
    void readBoard();
  }, [readBoard]);

  // Both mutations follow the same shape: hold the card busy, run the RPC, then re-read the
  // board so what she sees is the database's answer rather than an optimistic guess. A
  // failure re-reads too — "this job is full now" is usually a board that has moved on.
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
      await readBoard();

      // Almost every way these RPCs fail also takes the job off the board — it filled up,
      // it was unposted, she was assigned in the meantime. Routing the message by where the
      // job ended up is what keeps the most carefully worded reasons reachable at all.
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
    [readBoard],
  );

  const apply = useCallback(
    (jobId: string) =>
      void runOnJob(jobId, async () => {
        const { error } = await getSupabaseClient().rpc("apply_to_job", {
          target_job_id: jobId,
        });
        return error ? describeApplyError(error) : null;
      }),
    [runOnJob],
  );

  const withdraw = useCallback(
    (jobId: string) =>
      void runOnJob(jobId, async () => {
        const { error } = await getSupabaseClient().rpc("withdraw_application", {
          target_job_id: jobId,
        });
        return error ? describeWithdrawError(error) : null;
      }),
    [runOnJob],
  );

  // The layout holds the gate; this only renders once it has allowed the cleaner through.
  if (cleaner.status !== "allowed") return null;

  const { profile } = cleaner;

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.replace("/login");
  }

  const vacancies = board.status === "ready" ? board.vacancies : [];
  const applied = vacancies.filter((vacancy) => vacancy.applicationStatus === "applied");
  const open = vacancies.filter((vacancy) => vacancy.applicationStatus !== "applied");

  function renderCard(vacancy: Vacancy) {
    return (
      <VacancyCard
        busy={pendingJobIds.has(vacancy.jobId)}
        error={errors[vacancy.jobId] ?? null}
        key={vacancy.jobId}
        onApply={apply}
        onWithdraw={withdraw}
        vacancy={vacancy}
      />
    );
  }

  return (
    <main className="screen">
      <div>
        <h1 className="screen-title">Open jobs</h1>
        <p className="screen-lead">
          {profile.suburb ? `${profile.full_name} · ${profile.suburb}` : profile.full_name}
        </p>
      </div>

      {/* Sits outside the list on purpose: it carries the reasons whose card has gone, and
          it has to survive the re-read failing and replacing the list wholesale. */}
      {notice ? (
        <p className="board-notice" role="alert">
          {notice}
        </p>
      ) : null}

      {board.status === "loading" ? <p className="screen-lead">Loading…</p> : null}

      {board.status === "error" ? (
        <div className="empty-state">
          <p>We could not load your jobs.</p>
          <p>Check your connection and open the app again.</p>
        </div>
      ) : null}

      {applied.length > 0 ? (
        <section className="board-section">
          <h2 className="board-section__title">Applied</h2>
          <ul aria-label="Applied" className="vacancy-list">
            {applied.map(renderCard)}
          </ul>
        </section>
      ) : null}

      {board.status === "ready" && vacancies.length === 0 ? (
        <div className="empty-state">
          <p>No open jobs yet.</p>
          <p>When a company you work with posts a job, it appears here.</p>
        </div>
      ) : null}

      {open.length > 0 ? (
        <ul aria-label="Open jobs" className="vacancy-list">
          {open.map(renderCard)}
        </ul>
      ) : null}

      <div className="screen-footer">
        <button
          className="button button--secondary button--small"
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
