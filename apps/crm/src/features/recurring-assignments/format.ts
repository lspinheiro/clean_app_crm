import type { RecurringAssignmentSummary } from "./types";

const weekdayLabels = {
  "en-AU": ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "pt-BR": [
    "",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
  ],
} as const;

export function formatRecurrence(
  rule: Pick<RecurringAssignmentSummary, "frequency" | "weekday">,
  locale: "en-AU" | "pt-BR" = "en-AU",
) {
  const weekday = weekdayLabels[locale][rule.weekday] ?? (locale === "pt-BR" ? "dia" : "day");
  if (locale === "pt-BR") {
    return rule.frequency === "fortnightly"
      ? `Repete a cada duas semanas: ${weekday}`
      : `Repete semanalmente: ${weekday}`;
  }
  return rule.frequency === "fortnightly" ? `Every second ${weekday}` : `Every ${weekday}`;
}

export function formatLocalTime(value: string) {
  return value.slice(0, 5);
}

export function formatNamedCoverage(
  rule: Pick<RecurringAssignmentSummary, "crewSize" | "namedCleaners">,
  locale: "en-AU" | "pt-BR" = "en-AU",
) {
  const names = rule.namedCleaners.map((cleaner) => cleaner.name);
  const openSlots = Math.max(0, rule.crewSize - names.length);
  const openLabel = openSlots
    ? locale === "pt-BR"
      ? `${openSlots} ${openSlots === 1 ? "vaga aberta" : "vagas abertas"}`
      : `${openSlots} open`
    : "";
  return [...names, openLabel].filter(Boolean).join(" + ");
}
