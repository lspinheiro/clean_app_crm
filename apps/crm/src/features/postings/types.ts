import type { Database } from "@clean-app/db";

export type PostingIntent = Database["public"]["Enums"]["posting_intent"];

export type PostingClosingReason =
  | "expired"
  | "revoked"
  | "cap_reached"
  | "filled"
  | "start_passed"
  | "work_unavailable";

export type PostingSummary = {
  applicationCount: number;
  closingReason: PostingClosingReason | null;
  code: string;
  createdAt: string;
  id: string;
  intent: PostingIntent;
  publicDescription: string;
  state: "active" | "closed";
};

type PostingWorkOptionBase = {
  cleanerPayCents: number;
  durationMinutes: number;
  id: string;
  serviceName: string;
  siteName: string;
  suburb: string;
};

export type OneTimePostingOption = PostingWorkOptionBase & {
  intent: "one_time";
  scheduledStart: string;
};

export type RegularPostingOption = PostingWorkOptionBase & {
  frequency: Database["public"]["Enums"]["recurrence_frequency"];
  intent: "regular";
  localStartTime: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

export type PostingWorkOption = OneTimePostingOption | RegularPostingOption;
