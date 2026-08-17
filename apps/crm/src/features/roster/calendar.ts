import type { RosterDay, RosterView } from "./types";

export const BRISBANE_TIME_ZONE = "Australia/Brisbane";

type RosterHref = `/roster?week=${string}` | `/roster?week=${string}&view=site`;

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRISBANE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options });
}

function fromDateKey(dateKey: string) {
  const match = dateKeyPattern.exec(dateKey);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function toDateKey(date: Date) {
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

export function getBrisbaneDateKey(now = new Date()) {
  const parts = Object.fromEntries(
    dateKeyFormatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(dateKey: string, dayCount: number) {
  const date = fromDateKey(dateKey);
  if (!date) throw new Error(`Invalid date key: ${dateKey}`);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return toDateKey(date);
}

export function normaliseWeekStart(dateKey: string) {
  const date = fromDateKey(dateKey);
  if (!date) return null;
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toDateKey(date);
}

export function parseRosterWeek(
  value: string | string[] | undefined,
  now = new Date(),
) {
  const requested = Array.isArray(value) ? value[0] : value;
  return normaliseWeekStart(requested ?? "")
    ?? normaliseWeekStart(getBrisbaneDateKey(now))
    ?? getBrisbaneDateKey(now);
}

export function parseRosterView(value: string | string[] | undefined): RosterView {
  const requested = Array.isArray(value) ? value[0] : value;
  return requested === "site" ? "site" : "cleaner";
}

export function buildRosterDays(weekStart: string, locale = "en-AU"): RosterDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDays(weekStart, index);
    const date = fromDateKey(dateKey);
    if (!date) throw new Error(`Invalid roster week: ${weekStart}`);
    return {
      dateKey,
      headerLabel: dateFormatter(locale, { weekday: "short", day: "numeric" }).format(date),
    };
  });
}

export function getRosterWeekBounds(weekStart: string) {
  const nextWeek = addDays(weekStart, 7);
  return {
    startsAt: new Date(`${weekStart}T00:00:00+10:00`).toISOString(),
    endsAt: new Date(`${nextWeek}T00:00:00+10:00`).toISOString(),
  };
}

export function formatRosterWeekHeading(weekStart: string, locale = "en-AU") {
  const start = fromDateKey(weekStart);
  const end = fromDateKey(addDays(weekStart, 6));
  if (!start || !end) throw new Error(`Invalid roster week: ${weekStart}`);
  const prefix = locale === "pt-BR" ? "Semana de" : "Week of";
  const full = dateFormatter(locale, { day: "numeric", month: "short", year: "numeric" });
  const month = dateFormatter(locale, { day: "numeric", month: "short" });
  const day = dateFormatter(locale, { day: "numeric" });
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${prefix} ${full.format(start)} – ${full.format(end)}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${prefix} ${month.format(start)} – ${full.format(end)}`;
  }
  return `${prefix} ${day.format(start)}–${full.format(end)}`;
}

export function formatRosterTitle(weekStart: string, view: RosterView, locale = "en-AU") {
  const roster = locale === "pt-BR" ? "Escala" : "Roster";
  const byView = locale === "pt-BR"
    ? view === "site" ? "por local" : "por profissional"
    : `by ${view}`;
  return `${roster} · ${formatRosterWeekHeading(weekStart, locale)} · ${byView}`;
}

export function formatRosterTime(timestamp: string, locale = "en-AU") {
  const value = new Intl.DateTimeFormat(locale, {
    timeZone: BRISBANE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
  return locale === "en-AU" ? value.replace(/^0/, "") : value;
}

export function getRosterDateKey(timestamp: string) {
  return getBrisbaneDateKey(new Date(timestamp));
}

export function rosterHref(weekStart: string, view: RosterView = "cleaner"): RosterHref {
  return view === "site"
    ? `/roster?week=${weekStart}&view=site`
    : `/roster?week=${weekStart}`;
}
