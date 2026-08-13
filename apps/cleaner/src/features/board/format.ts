// Mirrors apps/crm/src/features/jobs/format.ts so both apps read the same way. Timezone is
// fixed to Brisbane: Queensland has no daylight saving, so the offset never moves.
const brisbaneDateFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Brisbane",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const brisbaneTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Brisbane",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatJobDate(value: string) {
  return brisbaneDateFormatter.format(new Date(value));
}

export function formatJobTime(value: string) {
  return brisbaneTimeFormatter.format(new Date(value)).toLowerCase();
}

export function formatJobDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min`;
  if (!remainingMinutes) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

export function formatCleanerPay(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** A one-cleaner job has nothing to say about crew; a crew job states what is left. */
export function describeOpenSlots(openSlots: number, crewSize: number) {
  if (crewSize <= 1) return "";
  return `${openSlots} of ${crewSize} spots open`;
}
