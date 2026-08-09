import { AlertTriangle, Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  addDays,
  formatRosterTime,
  formatRosterWeekHeading,
  rosterHref,
} from "@/features/roster/calendar";
import type {
  RosterCellItem,
  RosterDay,
  RosterModel,
  RosterView,
} from "@/features/roster/types";

type RosterWeekProps = {
  weekStart: string;
  days: RosterDay[];
  model: RosterModel;
  view: RosterView;
  hasFoundation: boolean;
};

function unfilledLabel(count: number, suffix = "") {
  return `${count} unfilled ${count === 1 ? "slot" : "slots"}${suffix}`;
}

function RosterEntry({ item, view }: { item: RosterCellItem; view: RosterView }) {
  if (item.kind === "gap") {
    return (
      <div
        className="roster-entry roster-entry--gap"
        data-job-id={item.jobId}
        data-testid="roster-gap"
        data-vacancy-key={item.key}
      >
        <strong><AlertTriangle aria-hidden="true" size={14} /> GAP</strong>
        <span>
          {view === "site" ? formatRosterTime(item.scheduledStart) : item.siteName}
        </span>
        <small className="tabular-numerals">
          {view === "cleaner" ? `${formatRosterTime(item.scheduledStart)} · ` : null}
          slot {item.crewSlot} of {item.crewSize}
        </small>
      </div>
    );
  }

  return (
    <div
      className="roster-entry roster-entry--job"
      data-job-id={item.jobId}
      data-testid="roster-job"
    >
      <strong>
        {view === "site" ? formatRosterTime(item.scheduledStart) : item.siteName}
      </strong>
      <span className={view === "cleaner" ? "tabular-numerals" : "roster-entry__cleaners"}>
        {view === "site"
          ? item.cleanerNames.join(", ") || "No cleaners assigned"
          : formatRosterTime(item.scheduledStart)}
      </span>
      {item.crewSize > 1 ? <small>{item.crewSize} cleaners</small> : null}
    </div>
  );
}

export function RosterWeek({ weekStart, days, model, view, hasFoundation }: RosterWeekProps) {
  const previousWeek = rosterHref(addDays(weekStart, -7), view);
  const nextWeek = rosterHref(addDays(weekStart, 7), view);
  const gapState = model.vacancyCount > 0
    ? "gaps"
    : model.jobIds.length > 0
      ? "clear"
      : "unscheduled";

  return (
    <>
      <main className="page-shell roster-page-shell">
        <header className="roster-header">
          <div>
            <p className="eyebrow">Company operations</p>
            <h1 className="page-heading">Roster</h1>
            <div className="roster-toolbar">
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
              <nav className="roster-view-switch" aria-label="Roster view">
                <Link
                  aria-current={view === "cleaner" ? "page" : undefined}
                  href={rosterHref(weekStart, "cleaner")}
                >
                  By cleaner
                </Link>
                <Link
                  aria-current={view === "site" ? "page" : undefined}
                  href={rosterHref(weekStart, "site")}
                >
                  By site
                </Link>
              </nav>
            </div>
          </div>
          {hasFoundation ? (
            <p
              className={`roster-gap-count${
                gapState === "clear" ? " is-clear" : gapState === "unscheduled" ? " is-unscheduled" : ""
              }`}
              data-testid="roster-gap-count"
            >
              {gapState === "unscheduled" ? "Nothing scheduled" : unfilledLabel(model.vacancyCount)}
            </p>
          ) : null}
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
            aria-label={`Roster by ${view}`}
            tabIndex={0}
          >
            <table className="roster-grid">
              <thead>
                <tr>
                  <th scope="col">{view === "cleaner" ? "Cleaner" : "Site"}</th>
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
                      {row.sublabel ? (
                        <small className="roster-row-client">{row.sublabel}</small>
                      ) : null}
                    </th>
                    {days.map((day) => {
                      const items = row.cells[day.dateKey] ?? [];
                      return (
                        <td key={day.dateKey}>
                          {items.length ? items.map((item) => (
                            <RosterEntry item={item} key={item.key} view={view} />
                          )) : <span className="roster-no-work" aria-label="No work">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                )) : (
                  <tr>
                    <th scope="row">
                      {view === "cleaner" ? "No active cleaners" : "No company sites"}
                    </th>
                    <td colSpan={7} className="roster-grid-message">
                      {view === "cleaner"
                        ? "Invite a cleaner to add a row to this week."
                        : "Add a client site to create a roster row."}
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
              className={gapState === "clear" ? "is-clear" : gapState === "unscheduled" ? "is-unscheduled" : undefined}
              data-gap-state={gapState}
              data-testid="roster-footer-gap-count"
            >
              {gapState === "clear" ? <Check aria-hidden="true" size={18} /> : null}
              {gapState === "gaps" ? <AlertTriangle aria-hidden="true" size={18} /> : null}
              {gapState === "unscheduled"
                ? "Nothing scheduled this week yet. Recurring jobs are generated 4 weeks ahead."
                : unfilledLabel(model.vacancyCount, " this week")}
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
