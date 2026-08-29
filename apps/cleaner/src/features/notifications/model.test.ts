import { describe, expect, it } from "vitest";

import enAu from "../../../messages/en-AU.json";
import ptBr from "../../../messages/pt-BR.json";

import {
  isCleanerNotificationType,
  toCleanerNotifications,
  toNotificationCopy,
  type CleanerNotificationRow,
  type CleanerNotificationType,
} from "./model";

/** The kinds of `public.notification_type` a cleaner can be the recipient of. */
const everyKind: CleanerNotificationType[] = [
  "job_posted",
  "job_assigned",
  "job_cancelled",
  "payment_marked_paid",
];

function row(overrides: Partial<CleanerNotificationRow> = {}): CleanerNotificationRow {
  return {
    notification_id: "notification-1",
    job_id: "job-a",
    type: "job_assigned",
    read_at: null,
    created_at: "2026-08-25T00:01:00+00:00",
    company_name: "Coastal Demo Cleaning",
    site_name: "Palm Grove Practice",
    suburb: "Southport",
    service_name: "Standard clean",
    service_slug: "standard-clean",
    scheduled_start: "2026-08-19T22:30:00+00:00",
    ...overrides,
  };
}

/** Reads a shipped catalogue without asserting anything about its type shape. */
function namespaceOf(catalogue: unknown, namespace: string): Record<string, string> {
  const namespaces = catalogue as Record<string, Record<string, string> | undefined>;
  return namespaces[namespace] ?? {};
}

describe("CLE-90 what a notification says and where it opens", () => {
  it("sends a new job on the board to the board", () => {
    expect(toNotificationCopy("job_posted")).toEqual({
      kind: "job_posted",
      copyKey: "jobPosted",
      destination: "/board",
    });
  });

  it("sends everything about a job she already holds to My jobs", () => {
    expect(toNotificationCopy("job_assigned")).toEqual({
      kind: "job_assigned",
      copyKey: "jobAssigned",
      destination: "/my-jobs",
    });
    expect(toNotificationCopy("job_cancelled")).toEqual({
      kind: "job_cancelled",
      copyKey: "jobCancelled",
      destination: "/my-jobs",
    });
    expect(toNotificationCopy("payment_marked_paid")).toEqual({
      kind: "payment_marked_paid",
      copyKey: "paymentMarkedPaid",
      destination: "/my-jobs",
    });
  });

  it("only ever opens the board or My jobs, and the board only for a posted job", () => {
    // The bell is a shortcut into the two screens the app has. A destination this app
    // cannot route to would be a dead tap on a phone.
    for (const kind of everyKind) {
      const copy = toNotificationCopy(kind);
      expect(["/board", "/my-jobs"]).toContain(copy.destination);
      expect(copy.destination === "/board").toBe(kind === "job_posted");
    }
  });

  it("gives each kind its own words, so two notifications never read the same", () => {
    const copyKeys = everyKind.map((kind) => toNotificationCopy(kind).copyKey);

    expect(new Set(copyKeys).size).toBe(everyKind.length);
  });
});

describe("CLE-90 every notification has English and Portuguese words", () => {
  it("names a copy key both shipped catalogues translate", () => {
    const english = namespaceOf(enAu, "Notifications");
    const portuguese = namespaceOf(ptBr, "Notifications");

    for (const kind of everyKind) {
      const { copyKey } = toNotificationCopy(kind);
      expect((english[copyKey] ?? "").trim(), `${copyKey} in en-AU`).not.toBe("");
      expect((portuguese[copyKey] ?? "").trim(), `${copyKey} in pt-BR`).not.toBe("");
    }
  });

  it("has the bell's own words in both catalogues too", () => {
    const english = namespaceOf(enAu, "Notifications");
    const portuguese = namespaceOf(ptBr, "Notifications");

    for (const key of ["title", "unread", "empty"]) {
      expect((english[key] ?? "").trim(), `${key} in en-AU`).not.toBe("");
      expect((portuguese[key] ?? "").trim(), `${key} in pt-BR`).not.toBe("");
    }
  });
});

describe("CLE-90 turning view rows into a list", () => {
  it("carries the row through with the words and the destination resolved", () => {
    expect(toCleanerNotifications([row()])).toEqual([
      {
        notificationId: "notification-1",
        jobId: "job-a",
        type: "job_assigned",
        copyKey: "jobAssigned",
        destination: "/my-jobs",
        readAt: null,
        createdAt: "2026-08-25T00:01:00+00:00",
        companyName: "Coastal Demo Cleaning",
        siteName: "Palm Grove Practice",
        suburb: "Southport",
        serviceName: "Standard clean",
        serviceSlug: "standard-clean",
        scheduledStart: "2026-08-19T22:30:00+00:00",
      },
    ]);
  });

  it("puts the newest first, whatever order the rows arrive in", () => {
    const list = toCleanerNotifications([
      row({ notification_id: "middle", created_at: "2026-08-25T00:02:00+00:00" }),
      row({ notification_id: "oldest", created_at: "2026-08-24T23:00:00+00:00" }),
      row({ notification_id: "newest", created_at: "2026-08-25T00:03:00+00:00" }),
    ]);

    expect(list.map((item) => item.notificationId)).toEqual(["newest", "middle", "oldest"]);
  });

  it("keeps read state, so the bell can count what is still unread", () => {
    const list = toCleanerNotifications([
      row({ notification_id: "seen", read_at: "2026-08-25T01:00:00+00:00" }),
      row({ notification_id: "unseen", created_at: "2026-08-25T00:02:00+00:00" }),
    ]);

    expect(list.filter((item) => item.readAt === null).map((item) => item.notificationId))
      .toEqual(["unseen"]);
  });

  it("ignores a kind this app has no words for", () => {
    // `application_received` shares `public.notification_type` but is addressed to company
    // admins. A value this app cannot describe must drop out of her list, not blank it.
    const list = toCleanerNotifications([
      row({ notification_id: "admin-only", type: "application_received" }),
      row({ notification_id: "hers", type: "job_posted" }),
    ]);

    expect(list.map((item) => item.notificationId)).toEqual(["hers"]);
  });
});

describe("CLE-90 which kinds belong to a cleaner", () => {
  it("recognises exactly the four kinds she can receive", () => {
    for (const kind of everyKind) expect(isCleanerNotificationType(kind)).toBe(true);

    expect(isCleanerNotificationType("application_received")).toBe(false);
    expect(isCleanerNotificationType("")).toBe(false);
  });
});
