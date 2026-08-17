import type { JobStatus } from "./types";

import { formatBrisbaneTime } from "@/lib/format/schedule";

const jobStatusLabels: Record<"en-AU" | "pt-BR", Record<JobStatus, string>> = {
  "en-AU": {
    draft: "Draft",
    posted: "Posted",
    assigned: "Assigned",
    on_the_way: "On the way",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  "pt-BR": {
    draft: "Rascunho",
    posted: "Publicado",
    assigned: "Alocado",
    on_the_way: "A caminho",
    in_progress: "Em andamento",
    completed: "Concluído",
    cancelled: "Cancelado",
  },
};

export function formatJobDate(value: string, locale = "en-AU") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function formatJobTime(value: string, locale = "en-AU") {
  return formatBrisbaneTime(value, locale);
}

export function formatJobDuration(minutes: number, locale = "en-AU") {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const formatNumber = new Intl.NumberFormat(locale);
  if (!hours) return `${formatNumber.format(remainingMinutes)} min`;
  if (!remainingMinutes) return `${formatNumber.format(hours)} h`;
  return `${formatNumber.format(hours)} h ${formatNumber.format(remainingMinutes)} min`;
}

export function formatCleanerPay(cents: number, locale = "en-AU") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatJobStatus(status: JobStatus, locale: "en-AU" | "pt-BR" = "en-AU") {
  return jobStatusLabels[locale][status];
}
