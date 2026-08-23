"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandBubbles } from "@/components/brand-bubbles";
import {
  applyErrorKey,
  type BoardErrorKey,
  withdrawErrorKey,
} from "@/features/board/application";
import { toVacancies } from "@/features/board/model";
import type { ApplicationStatus, BoardRow, Vacancy } from "@/features/board/types";
import type { AppLocale } from "@/i18n/config";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

import { VacancyCard } from "./vacancy-card";

// Only the columns the card renders. The view holds no address, access notes, client phone,
// or client charge at all, so the board cannot leak them — this keeps the payload small.
// `my_application_status` is her own application on the job, and it is what makes the
// waiting state survive a reload: the state lives in the database, not in this component.
const boardColumns =
  "job_id, company_name, site_name, suburb, service_name, service_slug, scheduled_start, duration_minutes, cleaner_pay_cents, crew_size, crew_slot, my_application_status";

type BoardState =
  | { status: "loading" }
  | { status: "ready"; rows: BoardRow[] }
  | { status: "error" };

async function loadBoard(): Promise<BoardState> {
  const { data, error } = await getSupabaseClient()
    .from("cleaner_job_board")
    .select(boardColumns)
    .order("scheduled_start");

  if (error) return { status: "error" };
  return { status: "ready", rows: (data ?? []) as BoardRow[] };
}

/**
 * Where a job stands on the board she can actually see. `absent` covers both "no longer on
 * the board" and "the board could not be read" — in either case no card exists to carry a
 * message about that job.
 */
type JobStanding = ApplicationStatus | null | "absent";

function standingOf(board: BoardState, jobId: string): JobStanding {
  if (board.status !== "ready") return "absent";

  const row = board.rows.find((candidate) => candidate.job_id === jobId);
  return row ? row.my_application_status : "absent";
}

export default function BoardPage() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Board");
  const commonT = useTranslations("Common");
  const cleaner = useCleaner();
  const [board, setBoard] = useState<BoardState>({ status: "loading" });
  const [pendingJobIds, setPendingJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, BoardErrorKey>>({});
  const [notice, setNotice] = useState<BoardErrorKey | null>(null);

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
    async (jobId: string, mutate: () => Promise<BoardErrorKey | null>) => {
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
        return error ? applyErrorKey(error) : null;
      }),
    [runOnJob],
  );

  const withdraw = useCallback(
    (jobId: string) =>
      void runOnJob(jobId, async () => {
        const { error } = await getSupabaseClient().rpc("withdraw_application", {
          target_job_id: jobId,
        });
        return error ? withdrawErrorKey(error) : null;
      }),
    [runOnJob],
  );

  const vacancies = useMemo(
    () => (board.status === "ready" ? toVacancies(board.rows, locale) : []),
    [board, locale],
  );

  // The layout holds the gate; this only renders once it has allowed the cleaner through.
  if (cleaner.status !== "allowed") return null;

  const { profile } = cleaner;
  const applied = vacancies.filter((vacancy) => vacancy.applicationStatus === "applied");
  const open = vacancies.filter((vacancy) => vacancy.applicationStatus !== "applied");

  function renderCard(vacancy: Vacancy) {
    return (
      <VacancyCard
        busy={pendingJobIds.has(vacancy.jobId)}
        error={errors[vacancy.jobId] ? t(errors[vacancy.jobId]) : null}
        key={vacancy.jobId}
        onApply={apply}
        onWithdraw={withdraw}
        vacancy={vacancy}
      />
    );
  }

  return (
    <main className="screen">
      <header className="screen-heading">
        <h1 className="screen-title">{t("title")}</h1>
        <p className="screen-lead">
          {profile.suburb
            ? t("profileSummary", { name: profile.full_name, suburb: profile.suburb })
            : profile.full_name}
        </p>
      </header>

      {/* Sits outside the list on purpose: it carries the reasons whose card has gone, and
          it has to survive the re-read failing and replacing the list wholesale. */}
      {notice ? (
        <p className="board-notice" role="alert">
          {t(notice)}
        </p>
      ) : null}

      {board.status === "loading" ? <BoardSkeleton label={t("loading")} /> : null}

      {board.status === "error" ? (
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
              setBoard({ status: "loading" });
              void readBoard();
            }}
            type="button"
          >
            {commonT("retry")}
          </button>
        </div>
      ) : null}

      {applied.length > 0 ? (
        <section className="board-section board-section--applied">
          <h2 className="board-section__title">{t("appliedTitle")}</h2>
          <ul aria-label={t("appliedList")} className="vacancy-list vacancy-list--applied">
            {applied.map(renderCard)}
          </ul>
        </section>
      ) : null}

      {board.status === "ready" ? (
        <section className="board-section board-section--open">
          <div className="board-section__head">
            <h2 className="board-section__title">{t("openTitle")}</h2>
            <span className="board-section__count">{t("openCount", { count: open.length })}</span>
          </div>
          {open.length > 0 ? (
            <ul aria-label={t("openList")} className="vacancy-list">
              {open.map(renderCard)}
            </ul>
          ) : (
            <div className="empty-state">
              <BrandBubbles size={44} />
              <div>
                <p className="empty-state__title">{t("emptyTitle")}</p>
                <p>{t("emptyBody")}</p>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

function BoardSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-busy="true" className="board-skeleton" role="status">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden="true" className="board-skeleton__applied" />
      <div aria-hidden="true" className="board-skeleton__heading" />
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
