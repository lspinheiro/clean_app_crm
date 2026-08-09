import type { RecurringAssignmentSummary } from "./types";

const weekdayLabels = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatRecurrence(rule: Pick<RecurringAssignmentSummary, "frequency" | "weekday">) {
  const weekday = weekdayLabels[rule.weekday] ?? "day";
  return rule.frequency === "fortnightly" ? `Every second ${weekday}` : `Every ${weekday}`;
}

export function formatLocalTime(value: string) {
  return value.slice(0, 5);
}

export function formatNamedCoverage(
  rule: Pick<RecurringAssignmentSummary, "crewSize" | "namedCleaners">,
) {
  const names = rule.namedCleaners.map((cleaner) => cleaner.name);
  const openSlots = Math.max(0, rule.crewSize - names.length);
  const openLabel = openSlots ? `${openSlots} open` : "";
  return [...names, openLabel].filter(Boolean).join(" + ");
}
