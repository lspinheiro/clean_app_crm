"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { describeApplyError, describeWithdrawError } from "@/features/board/application";
import { toVacancies } from "@/features/board/model";
import type { BoardRow, Vacancy } from "@/features/board/types";
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

export default function BoardPage() {
  const router = useRouter();
  const cleaner = useCleaner();
  const [board, setBoard] = useState<BoardState>({ status: "loading" });
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    void loadBoard().then((next) => {
      if (active) setBoard(next);
    });

    return () => {
      active = false;
    };
  }, []);

  // Both mutations follow the same shape: hold the card busy, run the RPC, then re-read the
  // board so what she sees is the database's answer rather than an optimistic guess. A
  // failure re-reads too — "this job is full now" is usually a board that has moved on.
  const runOnJob = useCallback(
    async (jobId: string, mutate: () => Promise<string | null>) => {
      setPendingJobId(jobId);
      setErrors((previous) => {
        if (!(jobId in previous)) return previous;
        const rest = { ...previous };
        delete rest[jobId];
        return rest;
      });

      const failure = await mutate();
      const next = await loadBoard();

      setBoard(next);
      if (failure) setErrors((previous) => ({ ...previous, [jobId]: failure }));
      setPendingJobId(null);
    },
    [],
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
        busy={pendingJobId === vacancy.jobId}
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
