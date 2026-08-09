export type SiteSummary = {
  id: string;
  clientId: string;
  name: string;
  address: string;
  suburb: string;
  accessNotes: string | null;
  defaultService: ServiceOption | null;
  defaultDurationMinutes: number | null;
  defaultRateCents: number | null;
};

export type ServiceOption = {
  id: string;
  name: string;
};

export type ClientWithSites = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  notes: string | null;
  sites: SiteSummary[];
};
