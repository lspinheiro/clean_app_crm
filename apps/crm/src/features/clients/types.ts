export type SiteSummary = {
  id: string;
  clientId: string;
  name: string;
  address: string;
  suburb: string;
  accessNotes: string | null;
};

export type ClientWithSites = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  notes: string | null;
  sites: SiteSummary[];
};
