export type RosterView = "cleaner" | "site";

export type RosterDay = {
  dateKey: string;
  headerLabel: string;
};

export type RosterCleaner = {
  id: string;
  name: string;
};

export type RosterSite = {
  id: string;
  name: string;
};

export type RosterJob = {
  id: string;
  siteId: string;
  siteName: string;
  scheduledStart: string;
  crewSize: number;
};

export type RosterAssignment = {
  jobId: string;
  cleanerId: string;
  slotNumber: number;
};

export type RosterVacancy = {
  key: string;
  jobId: string;
  siteId: string;
  siteName: string;
  scheduledStart: string;
  crewSlot: number;
  crewSize: number;
};

export type RosterJobItem = {
  kind: "job";
  key: string;
  jobId: string;
  siteName: string;
  scheduledStart: string;
  crewSize: number;
};

export type RosterGapItem = {
  kind: "gap";
  key: string;
  jobId: string;
  siteName: string;
  scheduledStart: string;
  crewSlot: number;
  crewSize: number;
};

export type RosterCellItem = RosterJobItem | RosterGapItem;

export type RosterRow = {
  id: string;
  label: string;
  kind: "cleaner" | "gaps";
  cells: Record<string, RosterCellItem[]>;
};

export type CleanerRosterModel = {
  rows: RosterRow[];
  vacancyCount: number;
  vacancyKeys: string[];
  jobIds: string[];
};
