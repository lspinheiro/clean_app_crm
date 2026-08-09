export type RecurrenceFrequency = "weekly" | "fortnightly";

export type RecurringNamedCleaner = {
  id: string;
  name: string;
  slotNumber: number;
};

export type RecurringAssignmentSummary = {
  id: string;
  siteId: string;
  service: {
    id: string;
    name: string;
  };
  frequency: RecurrenceFrequency;
  weekday: number;
  anchorDate: string;
  startTime: string;
  durationMinutes: number;
  cleanerPayCents: number;
  crewSize: number;
  active: boolean;
  namedCleaners: RecurringNamedCleaner[];
};

export type RecurringAssignmentsBySite = Record<
  string,
  RecurringAssignmentSummary[]
>;
