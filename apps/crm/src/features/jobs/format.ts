import type { JobStatus } from "./types";

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

const jobStatusLabels: Record<JobStatus, string> = {
  draft: "Draft",
  posted: "Posted",
  assigned: "Assigned",
  on_the_way: "On the way",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

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

export function formatJobStatus(status: JobStatus) {
  return jobStatusLabels[status];
}
