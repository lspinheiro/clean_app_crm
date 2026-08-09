import type { Database } from "@clean-app/db";

export type JobStatus = Database["public"]["Enums"]["job_status"];

export type JobSummary = {
  id: string;
  siteName: string;
  clientName: string;
  serviceName: string;
  scheduledStart: string;
  durationMinutes: number;
  cleanerPayCents: number;
  status: JobStatus;
  crewSize: number;
  assignedSlots: number;
};
