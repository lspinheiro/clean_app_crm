import type { CleanerPath } from "@/i18n/config";

/**
 * The kinds of `public.notification_type` addressed to a cleaner. `application_received`
 * shares the database type but is addressed to company employees, so it is deliberately
 * absent: one account can hold an employee membership and also work as a cleaner for the
 * same company, and the kind — not the account — decides what her list shows.
 */
export type CleanerNotificationType =
  | "job_posted"
  | "job_assigned"
  | "job_cancelled"
  | "payment_marked_paid";

/** One row of `public.cleaner_notifications`, as the view returns it. */
export type CleanerNotificationRow = {
  notification_id: string;
  job_id: string;
  type: string;
  read_at: string | null;
  created_at: string;
  company_name: string;
  site_name: string;
  suburb: string;
  service_name: string;
  service_slug: string | null;
  scheduled_start: string;
};

/**
 * The catalogue keys inside the `Notifications` namespace. A literal union rather than
 * `string`, so next-intl checks at build time that every kind has words shipped for it.
 */
export type NotificationCopyKey =
  | "jobPosted"
  | "jobAssigned"
  | "jobCancelled"
  | "paymentMarkedPaid";

export type NotificationCopy = {
  kind: CleanerNotificationType;
  copyKey: NotificationCopyKey;
  destination: CleanerPath;
};

export type CleanerNotification = {
  notificationId: string;
  jobId: string;
  type: CleanerNotificationType;
  copyKey: NotificationCopyKey;
  destination: CleanerPath;
  readAt: string | null;
  createdAt: string;
  companyName: string;
  siteName: string;
  suburb: string;
  serviceName: string;
  serviceSlug: string | null;
  scheduledStart: string;
};

/**
 * One entry per kind, so the exhaustive `Record` makes a new notification kind a type
 * error here rather than a blank row on a phone. Only a posted job goes to the board —
 * everything else concerns work she already holds.
 */
const copyByKind: Record<CleanerNotificationType, NotificationCopy> = {
  job_posted: { kind: "job_posted", copyKey: "jobPosted", destination: "/board" },
  job_assigned: { kind: "job_assigned", copyKey: "jobAssigned", destination: "/my-jobs" },
  job_cancelled: { kind: "job_cancelled", copyKey: "jobCancelled", destination: "/my-jobs" },
  payment_marked_paid: {
    kind: "payment_marked_paid",
    copyKey: "paymentMarkedPaid",
    destination: "/my-jobs",
  },
};

export function isCleanerNotificationType(value: string): value is CleanerNotificationType {
  return Object.hasOwn(copyByKind, value);
}

export function toNotificationCopy(kind: CleanerNotificationType): NotificationCopy {
  return copyByKind[kind];
}

/**
 * The view already orders by recency, but a live insert arrives out of band and the list
 * is re-read on every change, so ordering is settled here rather than trusted from the
 * wire. A kind this app has no words for drops out instead of rendering blank.
 */
export function toCleanerNotifications(rows: CleanerNotificationRow[]): CleanerNotification[] {
  return rows
    .filter((row) => isCleanerNotificationType(row.type))
    .map((row) => {
      const { kind, copyKey, destination } = toNotificationCopy(
        row.type as CleanerNotificationType,
      );
      return {
        notificationId: row.notification_id,
        jobId: row.job_id,
        type: kind,
        copyKey,
        destination,
        readAt: row.read_at,
        createdAt: row.created_at,
        companyName: row.company_name,
        siteName: row.site_name,
        suburb: row.suburb,
        serviceName: row.service_name,
        serviceSlug: row.service_slug,
        scheduledStart: row.scheduled_start,
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
