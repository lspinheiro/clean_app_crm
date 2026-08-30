import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  addDays,
  formatRosterTime,
  formatRosterWeekHeading,
  normaliseWeekStart,
  rosterHref,
} from "@/features/roster/calendar";
import type {
  RosterCellItem,
  RosterDay,
  RosterModel,
  RosterView,
} from "@/features/roster/types";
import type { AppLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";

type RosterWeekProps = {
  weekStart: string;
  days: RosterDay[];
  model: RosterModel;
  view: RosterView;
  hasFoundation: boolean;
  todayKey: string;
};

type RosterEntryMessageKey =
  | "cleanerCount"
  | "gap"
  | "noCleanersAssigned"
  | "offered"
  | "slotOf";

type Translator = (
  key: RosterEntryMessageKey,
  values?: Record<string, string | number>,
) => string;

function RosterEntry({
  item,
  locale,
  t,
  view,
}: {
  item: RosterCellItem;
  locale: AppLocale;
  t: Translator;
  view: RosterView;
}) {
  if (item.kind === "gap") {
    return (
      <Link
        className="roster-entry roster-entry--gap"
        data-job-id={item.jobId}
        data-testid="roster-gap"
        data-vacancy-key={item.key}
        href={`/jobs/${item.jobId}`}
      >
        <strong><AlertTriangle aria-hidden="true" size={14} /> {t("gap")}</strong>
        <span>
          {view === "site" ? formatRosterTime(item.scheduledStart, locale) : item.siteName}
        </span>
        <small className="tabular-numerals">
          {view === "cleaner" ? `${formatRosterTime(item.scheduledStart, locale)} · ` : null}
          {t("slotOf", { slot: item.crewSlot, crewSize: item.crewSize })}
        </small>
      </Link>
    );
  }

  if (item.kind === "offered") {
    return (
      <Link
        className="roster-entry roster-entry--offered"
        data-job-id={item.jobId}
        data-testid="roster-offered"
        href={`/jobs/${item.jobId}`}
      >
        <strong><Clock3 aria-hidden="true" size={14} /> {t("offered")}</strong>
        <span>{view === "site" ? item.cleanerName : item.siteName}</span>
        <small className="tabular-numerals">
          {formatRosterTime(item.scheduledStart, locale)}
        </small>
      </Link>
    );
  }

  return (
    <Link
      className="roster-entry roster-entry--job"
      data-job-id={item.jobId}
      data-testid="roster-job"
      href={`/jobs/${item.jobId}`}
    >
      <strong>
        {view === "site" ? formatRosterTime(item.scheduledStart, locale) : item.siteName}
      </strong>
      <span className={view === "cleaner" ? "tabular-numerals" : "roster-entry__cleaners"}>
        {view === "site"
          ? item.cleanerNames.join(", ") || t("noCleanersAssigned")
          : formatRosterTime(item.scheduledStart, locale)}
      </span>
      {item.crewSize > 1 ? <small>{t("cleanerCount", { count: item.crewSize })}</small> : null}
    </Link>
  );
}

export function RosterWeek({
  weekStart,
  days,
  model,
  view,
  hasFoundation,
  todayKey,
}: RosterWeekProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Roster");
  const previousWeek = rosterHref(addDays(weekStart, -7), view);
  const nextWeek = rosterHref(addDays(weekStart, 7), view);
  const currentWeekStart = normaliseWeekStart(todayKey);
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
            <p className="eyebrow">{t("eyebrow")}</p>
            <h1 className="page-heading">{t("title")}</h1>
            <div className="roster-toolbar">
              <div className="roster-week-controls">
                <Link className="icon-button roster-week-link" href={previousWeek} aria-label={t("previousWeek")}>
                  <ChevronLeft aria-hidden="true" size={20} />
                </Link>
                <p className="roster-week-title tabular-numerals">
                  {formatRosterWeekHeading(weekStart, locale, (range) =>
                    t("weekOf", { range }))}
                </p>
                <Link className="icon-button roster-week-link" href={nextWeek} aria-label={t("nextWeek")}>
                  <ChevronRight aria-hidden="true" size={20} />
                </Link>
                {currentWeekStart && currentWeekStart !== weekStart ? (
                  <Link className="roster-this-week" href={rosterHref(currentWeekStart, view)}>
                    {t("thisWeek")}
                  </Link>
                ) : null}
              </div>
              <nav className="roster-view-switch" aria-label={t("view")}>
                <Link
                  aria-current={view === "cleaner" ? "page" : undefined}
                  href={rosterHref(weekStart, "cleaner")}
                >
                  {t("byCleaner")}
                </Link>
                <Link
                  aria-current={view === "site" ? "page" : undefined}
                  href={rosterHref(weekStart, "site")}
                >
                  {t("bySite")}
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
              {gapState === "gaps" ? <AlertTriangle aria-hidden="true" size={14} /> : null}
              {gapState === "clear" ? <Check aria-hidden="true" size={14} /> : null}
              {gapState === "unscheduled"
                ? t("nothingScheduled")
                : t("unfilled", { count: model.vacancyCount })}
            </p>
          ) : null}
        </header>

        {!hasFoundation ? (
          <section className="roster-empty-state" aria-labelledby="roster-empty-heading">
            <div className="bubble-cluster" aria-hidden="true">
              <span /><span /><span />
            </div>
            <h2 id="roster-empty-heading">{t("foundationTitle")}</h2>
            <p>{t("foundationDescription")}</p>
            <Link className="button button--secondary" href="/clients">{t("goToClients")}</Link>
          </section>
        ) : (
          <div
            className="roster-grid-region"
            role="region"
            aria-label={t(view === "cleaner" ? "rosterByCleaner" : "rosterBySite")}
            tabIndex={0}
          >
            <table className="roster-grid">
              <thead>
                <tr>
                  <th scope="col">{view === "cleaner" ? t("cleaner") : t("site")}</th>
                  {days.map((day) => (
                    <th
                      key={day.dateKey}
                      scope="col"
                      className={`tabular-numerals${day.dateKey === todayKey ? " is-today" : ""}`}
                      aria-current={day.dateKey === todayKey ? "date" : undefined}
                    >
                      {day.headerLabel}
                      {day.dateKey === todayKey ? (
                        <span aria-hidden="true" className="roster-today-tag">{t("today")}</span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.rows.length ? model.rows.map((row) => (
                  <tr key={row.id} className={row.kind === "gaps" ? "roster-gap-row" : undefined}>
                    <th scope="row">
                      <span>{row.label}</span>
                      {row.kind === "gaps" ? <small>{t("vacancies")}</small> : null}
                      {row.sublabel ? (
                        <small className="roster-row-client">{row.sublabel}</small>
                      ) : null}
                    </th>
                    {days.map((day) => {
                      const items = row.cells[day.dateKey] ?? [];
                      return (
                        <td
                          key={day.dateKey}
                          className={day.dateKey === todayKey ? "is-today" : undefined}
                        >
                          {items.length ? items.map((item) => (
                            <RosterEntry item={item} key={item.key} locale={locale} t={t} view={view} />
                          )) : (
                            <span className="roster-no-work">
                              <span aria-hidden="true">—</span>
                              <span className="visually-hidden">{t("noWork")}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )) : (
                  <tr>
                    <th scope="row">
                      {view === "cleaner" ? t("noCleaners") : t("noSites")}
                    </th>
                    <td colSpan={7} className="roster-grid-message">
                      {view === "cleaner"
                        ? t("inviteCleaner")
                        : t("addSite")}
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
                ? t("nothingThisWeek")
                : t("unfilledThisWeek", { count: model.vacancyCount })}
            </p>
            <div className="roster-offer-control">
              <button className="button button--secondary" type="button" disabled>
                {t("offerToCleaners")}
              </button>
              <span>{t("cleanersLater")}</span>
            </div>
          </div>
        </footer>
      ) : null}
    </>
  );
}
