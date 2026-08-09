import { AlertTriangle, Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  addDays,
  formatRosterTime,
  formatRosterWeekHeading,
  rosterHref,
} from "@/features/roster/calendar";
import type { CleanerRosterModel, RosterCellItem, RosterDay } from "@/features/roster/types";

type RosterWeekProps = {
  weekStart: string;
  days: RosterDay[];
  model: CleanerRosterModel;
  hasFoundation: boolean;
};

function unfilledLabel(count: number, suffix = "") {
  return `${count} unfilled ${count === 1 ? "slot" : "slots"}${suffix}`;
}

function RosterEntry({ item }: { item: RosterCellItem }) {
  if (item.kind === "gap") {
    return (
      <div
        className="roster-entry roster-entry--gap"
        data-testid="roster-gap"
        data-vacancy-key={item.key}
      >
        <strong><AlertTriangle aria-hidden="true" size={14} /> GAP</strong>
        <span>{item.siteName}</span>
        <small className="tabular-numerals">
          {formatRosterTime(item.scheduledStart)} · slot {item.crewSlot} of {item.crewSize}
        </small>
      </div>
    );
  }

  return (
    <div className="roster-entry roster-entry--job" data-job-id={item.jobId}>
      <strong>{item.siteName}</strong>
      <span className="tabular-numerals">{formatRosterTime(item.scheduledStart)}</span>
      {item.crewSize > 1 ? <small>{item.crewSize} cleaners</small> : null}
    </div>
  );
}

export function RosterWeek({ weekStart, days, model, hasFoundation }: RosterWeekProps) {
  const previousWeek = rosterHref(addDays(weekStart, -7));
  const nextWeek = rosterHref(addDays(weekStart, 7));

  return (
    <>
      <main className="page-shell roster-page-shell">
        <header className="roster-header">
          <div>
            <p className="eyebrow">Company operations</p>
            <h1 className="page-heading">Roster</h1>
            <div className="roster-week-controls">
              <Link className="icon-button roster-week-link" href={previousWeek} aria-label="Previous week">
                <ChevronLeft aria-hidden="true" size={20} />
              </Link>
              <p className="roster-week-title tabular-numerals">
                {formatRosterWeekHeading(weekStart)}
              </p>
              <Link className="icon-button roster-week-link" href={nextWeek} aria-label="Next week">
                <ChevronRight aria-hidden="true" size={20} />
              </Link>
            </div>
          </div>
          <p
            className={`roster-gap-count${model.vacancyCount === 0 ? " is-clear" : ""}`}
            data-testid="roster-gap-count"
          >
            {unfilledLabel(model.vacancyCount)}
          </p>
        </header>

        {!hasFoundation ? (
          <section className="roster-empty-state" aria-labelledby="roster-empty-heading">
            <div className="bubble-cluster" aria-hidden="true">
              <span /><span /><span />
            </div>
            <h2 id="roster-empty-heading">Build your roster foundation</h2>
            <p>Add a client site and invite cleaners before recurring work can appear here.</p>
            <Link className="button button--secondary" href="/clients">Go to clients</Link>
          </section>
        ) : (
          <div
            className="roster-grid-region"
            role="region"
            aria-label="Roster by cleaner"
            tabIndex={0}
          >
            <table className="roster-grid">
              <thead>
                <tr>
                  <th scope="col">Cleaner</th>
                  {days.map((day) => (
                    <th key={day.dateKey} scope="col" className="tabular-numerals">
                      {day.headerLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.rows.length ? model.rows.map((row) => (
                  <tr key={row.id} className={row.kind === "gaps" ? "roster-gap-row" : undefined}>
                    <th scope="row">
                      <span>{row.label}</span>
                      {row.kind === "gaps" ? <small>Vacancy view</small> : null}
                    </th>
                    {days.map((day) => {
                      const items = row.cells[day.dateKey] ?? [];
                      return (
                        <td key={day.dateKey}>
                          {items.length ? items.map((item) => (
                            <RosterEntry item={item} key={item.key} />
                          )) : <span className="roster-no-work" aria-label="No work">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                )) : (
                  <tr>
                    <th scope="row">No active cleaners</th>
                    <td colSpan={7} className="roster-grid-message">
                      Invite a cleaner to add a row to this week.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {hasFoundation ? (
        <footer className="roster-summary-bar">
          <div className="roster-summary-bar__inner">
            <p
              className={model.vacancyCount === 0 ? "is-clear" : undefined}
              data-gap-state={model.vacancyCount === 0 ? "clear" : "gaps"}
              data-testid="roster-footer-gap-count"
            >
              {model.vacancyCount === 0
                ? <Check aria-hidden="true" size={18} />
                : <AlertTriangle aria-hidden="true" size={18} />}
              {unfilledLabel(model.vacancyCount, " this week")}
            </p>
            <div className="roster-offer-control">
              <button className="button button--secondary" type="button" disabled>
                Offer to pool
              </button>
              <span>Available after the cleaner job board launches.</span>
            </div>
          </div>
        </footer>
      ) : null}
    </>
  );
}
