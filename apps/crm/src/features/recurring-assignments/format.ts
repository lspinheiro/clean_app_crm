import type { RecurringAssignmentSummary } from "./types";

export type RecurringLabels = {
  everyFortnight: (weekday: string) => string;
  everyWeek: (weekday: string) => string;
  openSlots: (count: number) => string;
  weekday: (day: number) => string;
};

export function formatRecurrence(
  rule: Pick<RecurringAssignmentSummary, "frequency" | "weekday">,
  labels: RecurringLabels,
) {
  const weekday = labels.weekday(rule.weekday);
  return rule.frequency === "fortnightly"
    ? labels.everyFortnight(weekday)
    : labels.everyWeek(weekday);
}

export function formatLocalTime(value: string) {
  return value.slice(0, 5);
}

export function formatNamedCoverage(
  rule: Pick<RecurringAssignmentSummary, "crewSize" | "namedCleaners">,
  labels: RecurringLabels,
) {
  const names = rule.namedCleaners.map((cleaner) => cleaner.name);
  const openSlots = Math.max(0, rule.crewSize - names.length);
  const openLabel = openSlots ? labels.openSlots(openSlots) : "";
  return [...names, openLabel].filter(Boolean).join(" + ");
}
