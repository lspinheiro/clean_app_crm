import type { Database } from "@clean-app/db";

export type JobStatus = Database["public"]["Enums"]["job_status"];
export type JobApplicationStatus =
  Database["public"]["Enums"]["application_status"];
export type JobAssignmentSource =
  Database["public"]["Enums"]["assignment_source"];

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
  awaitingApplications: number;
};

export type JobApplicant = {
  cleanerId: string;
  cleanerName: string;
  status: JobApplicationStatus;
  appliedAt: string;
  preferredRank: number | null;
};

export type JobCleanerCandidate = {
  cleanerId: string;
  cleanerName: string;
  preferredRank: number | null;
};

export type JobPendingOffer = {
  id: string;
  cleanerId: string;
  cleanerName: string;
  createdAt: string;
};

export type JobAssignmentRecord = {
  cleanerId: string;
  cleanerName: string;
  slotNumber: number;
  source: JobAssignmentSource;
  assignedAt: string;
  unassignedAt: string | null;
};

export type ActiveJobSlotAssignment = {
  cleanerId: string;
  cleanerName: string;
  source: JobAssignmentSource;
  assignedAt: string;
};

export type PreviousJobSlotAssignment = ActiveJobSlotAssignment & {
  releasedAt: string;
};

export type JobSlot =
  | {
      slotNumber: number;
      state: "assigned";
      assignment: ActiveJobSlotAssignment;
    }
  | {
      slotNumber: number;
      state: "open";
      previousAssignment: PreviousJobSlotAssignment | null;
    }
  | {
      slotNumber: number;
      state: "closed";
      previousAssignment: PreviousJobSlotAssignment | null;
    };

export type JobDetail = {
  id: string;
  status: JobStatus;
  scheduledStart: string;
  durationMinutes: number;
  cleanerPayCents: number;
  clientChargeCents: number | null;
  notes: string | null;
  crewSize: number;
  clientName: string;
  serviceName: string;
  site: {
    id: string;
    name: string;
    address: string;
    suburb: string;
    accessNotes: string | null;
  };
  slots: JobSlot[];
  applicants: JobApplicant[];
  cleanerCandidates: JobCleanerCandidate[];
  pendingOffers: JobPendingOffer[];
};
