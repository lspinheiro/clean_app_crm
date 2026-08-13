"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { toVacancies } from "@/features/board/model";
import type { BoardRow, Vacancy } from "@/features/board/types";
import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

import { VacancyCard } from "./vacancy-card";

// Only the columns the card renders. The view holds no address, access notes, client phone,
// or client charge at all, so the board cannot leak them — this keeps the payload small.
const boardColumns =
  "job_id, company_name, site_name, suburb, service_name, scheduled_start, duration_minutes, cleaner_pay_cents, crew_size, crew_slot";

type BoardState =
  | { status: "loading" }
  | { status: "ready"; vacancies: Vacancy[] }
  | { status: "error" };

export default function BoardPage() {
  const router = useRouter();
  const cleaner = useCleaner();
  const [board, setBoard] = useState<BoardState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function load(): Promise<BoardState> {
      const { data, error } = await getSupabaseClient()
        .from("cleaner_job_board")
        .select(boardColumns)
        .order("scheduled_start");

      if (error) return { status: "error" };
      return { status: "ready", vacancies: toVacancies((data ?? []) as BoardRow[]) };
    }

    void load().then((next) => {
      if (active) setBoard(next);
    });

    return () => {
      active = false;
    };
  }, []);

  // The layout holds the gate; this only renders once it has allowed the cleaner through.
  if (cleaner.status !== "allowed") return null;

  const { profile } = cleaner;

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.replace("/login");
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

      {board.status === "ready" && board.vacancies.length === 0 ? (
        <div className="empty-state">
          <p>No open jobs yet.</p>
          <p>When a company you work with posts a job, it appears here.</p>
        </div>
      ) : null}

      {board.status === "ready" && board.vacancies.length > 0 ? (
        <ul aria-label="Open jobs" className="vacancy-list">
          {board.vacancies.map((vacancy) => (
            <VacancyCard key={vacancy.jobId} vacancy={vacancy} />
          ))}
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
