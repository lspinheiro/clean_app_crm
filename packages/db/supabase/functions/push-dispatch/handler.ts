export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type StoredNotification = {
  recipientId: string;
  jobId: string | null;
  recurringAssignmentId?: string | null;
  type: string;
};

/**
 * Mirrors the nullable `profiles.preferred_locale` column (enum `public.app_locale`). A
 * cleaner who has never chosen reads English, the same default the apps use.
 */
export type RecipientLocale = "en-AU" | "pt-BR";

export type BoardVisibleJob = {
  serviceName: string;
  serviceSlug: string | null;
  siteName: string;
  suburb: string;
  scheduledStart: string;
};

export type PushMessage =
  | {
    type: "job_assigned" | "job_posted" | "job_cancelled" | "hired";
    jobId: string;
    title: string;
    body: string;
    url: "/my-jobs" | "/board";
  }
  | {
    type: "hired" | "admitted" | "rejected";
    jobId: null;
    recurringAssignmentId: string | null;
    title: string;
    body: string;
    url: "/my-jobs" | "/board" | "/";
  };

export interface DispatchStore {
  getNotification(notificationId: string): Promise<StoredNotification | null>;
  listSubscriptions(profileId: string): Promise<StoredPushSubscription[]>;
  getBoardVisibleJob(jobId: string): Promise<BoardVisibleJob | null>;
  getRecipientLocale(profileId: string): Promise<RecipientLocale | null>;
  deleteSubscription(subscriptionId: string): Promise<void>;
}

export interface PushSender {
  send(
    subscription: StoredPushSubscription,
    message: PushMessage,
  ): Promise<{ statusCode: number }>;
}

type HandlerDependencies = {
  store: DispatchStore;
  sender: PushSender;
  secret: string;
  logger: Pick<Console, "error">;
};

type JobNotificationType = "job_assigned" | "job_posted" | "job_cancelled";
type DecisionNotificationType = "hired" | "admitted" | "rejected";
type DeliveredNotificationType = JobNotificationType | DecisionNotificationType;

type WebhookPayload = {
  notificationId: string;
  recipientId: string;
  jobId: string | null;
  type: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const notificationDestination: Record<JobNotificationType, "/my-jobs" | "/board"> = {
  job_assigned: "/my-jobs",
  job_posted: "/board",
  job_cancelled: "/my-jobs",
};

// Deno cannot reach the apps' next-intl catalogues, so the handful of push titles are
// restated here — the same trade the auth e-mail templates make for their subjects.
const notificationTitle: Record<
  RecipientLocale,
  Record<JobNotificationType, string>
> = {
  "en-AU": {
    job_assigned: "Job assigned",
    job_posted: "New job available",
    job_cancelled: "Job cancelled",
  },
  "pt-BR": {
    job_assigned: "Serviço atribuído",
    job_posted: "Novo serviço disponível",
    job_cancelled: "Serviço cancelado",
  },
};

const decisionCopy: Record<
  RecipientLocale,
  Record<DecisionNotificationType, { title: string; body: string }>
> = {
  "en-AU": {
    hired: { title: "You're hired", body: "Your work is ready to view." },
    admitted: { title: "Join request admitted", body: "You can now view the cleaner board." },
    rejected: { title: "Join request closed", body: "The company closed your join request." },
  },
  "pt-BR": {
    hired: { title: "Você foi contratado", body: "Seu serviço está pronto para visualizar." },
    admitted: { title: "Solicitação aprovada", body: "Agora você pode ver o quadro de serviços." },
    rejected: { title: "Solicitação encerrada", body: "A empresa encerrou sua solicitação." },
  },
};

const defaultLocale: RecipientLocale = "en-AU";

const knownServiceSlugs = [
  "office-clean",
  "standard-clean",
  "deep-clean",
  "end-of-lease-clean",
] as const;

type KnownServiceSlug = (typeof knownServiceSlugs)[number];

const serviceLabel: Record<
  RecipientLocale,
  Record<KnownServiceSlug, string>
> = {
  "en-AU": {
    "office-clean": "Office clean",
    "standard-clean": "Standard clean",
    "deep-clean": "Deep clean",
    "end-of-lease-clean": "End-of-lease clean",
  },
  "pt-BR": {
    "office-clean": "Limpeza de escritório",
    "standard-clean": "Limpeza padrão",
    "deep-clean": "Limpeza pesada",
    "end-of-lease-clean": "Limpeza de fim de locação",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownServiceSlug(value: string | null): value is KnownServiceSlug {
  return value !== null && knownServiceSlugs.some((slug) => slug === value);
}

function localisedServiceLabel(
  job: BoardVisibleJob,
  locale: RecipientLocale,
): string {
  return isKnownServiceSlug(job.serviceSlug)
    ? serviceLabel[locale][job.serviceSlug]
    : job.serviceName;
}

function parseWebhookPayload(value: unknown): WebhookPayload | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "jobId,notificationId,recipientId,type") return null;

  const { notificationId, recipientId, jobId, type } = value;
  if (
    typeof notificationId !== "string" ||
    typeof recipientId !== "string" ||
    (jobId !== null && typeof jobId !== "string") ||
    typeof type !== "string" ||
    !uuidPattern.test(notificationId) ||
    !uuidPattern.test(recipientId) ||
    (jobId !== null && !uuidPattern.test(jobId)) ||
    type.trim() === ""
  ) {
    return null;
  }

  return { notificationId, recipientId, jobId, type };
}

function isDeliveredType(type: string): type is DeliveredNotificationType {
  return Object.hasOwn(notificationDestination, type)
    || type === "hired"
    || type === "admitted"
    || type === "rejected";
}

function isJobType(type: DeliveredNotificationType): type is JobNotificationType {
  return Object.hasOwn(notificationDestination, type);
}

function formatScheduledStart(value: string, locale: RecipientLocale): string {
  // The work happens in Queensland whatever language describes it, so the zone is pinned
  // while the language varies. Dropping it would read the deploying machine's zone and
  // shift every near-midnight job by a day.
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Brisbane",
  })
    .format(new Date(value))
    .replaceAll("\u202f", " ");
}

function buildJobMessage(
  type: JobNotificationType | "hired",
  jobId: string,
  job: BoardVisibleJob,
  locale: RecipientLocale,
): PushMessage {
  return {
    type,
    jobId,
    title: type === "hired" ? decisionCopy[locale].hired.title : notificationTitle[locale][type],
    body: `${localisedServiceLabel(job, locale)} · ${job.siteName}, ${job.suburb} · ${
      formatScheduledStart(job.scheduledStart, locale)
    }`,
    url: type === "hired" ? "/my-jobs" : notificationDestination[type],
  };
}

function buildDecisionMessage(
  type: DecisionNotificationType,
  recurringAssignmentId: string | null,
  locale: RecipientLocale,
): PushMessage {
  return {
    type,
    jobId: null,
    recurringAssignmentId,
    ...decisionCopy[locale][type],
    url: type === "admitted" ? "/board" : type === "hired" ? "/my-jobs" : "/",
  };
}

function errorStatusCode(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const statusCode = Reflect.get(error, "statusCode");
  if (typeof statusCode === "number") return statusCode;
  const status = Reflect.get(error, "status");
  return typeof status === "number" ? status : null;
}

function isDeadSubscriptionStatus(statusCode: number | null): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function createPushDispatchHandler(dependencies: HandlerDependencies) {
  const { store, sender, secret, logger } = dependencies;

  async function pruneSubscription(subscriptionId: string): Promise<void> {
    try {
      await store.deleteSubscription(subscriptionId);
    } catch (error) {
      logger.error(
        "Could not prune dead push subscription",
        subscriptionId,
        error,
      );
    }
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    if (
      secret === "" ||
      request.headers.get("authorization") !== `Bearer ${secret}`
    ) {
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    }

    let payload: WebhookPayload | null = null;
    try {
      payload = parseWebhookPayload(await request.json());
    } catch {
      // The caller receives a validation response; no database work has happened.
    }
    if (!payload) {
      return Response.json({ error: "Invalid webhook payload" }, {
        status: 400,
      });
    }

    try {
      const notification = await store.getNotification(payload.notificationId);
      if (!notification) {
        return Response.json({ delivered: 0 });
      }
      if (!isDeliveredType(notification.type)) {
        return Response.json({ delivered: 0, ignored: true });
      }

      const [subscriptions, locale] = await Promise.all([
        store.listSubscriptions(notification.recipientId),
        // The notification row names the recipient, so a forged payload cannot choose
        // somebody else's language any more than it can choose their subscriptions.
        store.getRecipientLocale(notification.recipientId).catch((error) => {
          logger.error(
            "Could not load push recipient locale; falling back to English",
            notification.recipientId,
            error,
          );
          return null;
        }),
      ]);
      if (subscriptions.length === 0) {
        return Response.json({ delivered: 0 });
      }

      const chosenLocale = locale ?? defaultLocale;
      let message: PushMessage;
      if (isJobType(notification.type) || (notification.type === "hired" && notification.jobId)) {
        if (!notification.jobId) return Response.json({ delivered: 0 });
        const job = await store.getBoardVisibleJob(notification.jobId);
        if (!job) return Response.json({ delivered: 0 });
        message = buildJobMessage(notification.type, notification.jobId, job, chosenLocale);
      } else {
        if (notification.type === "hired" && !notification.recurringAssignmentId) {
          return Response.json({ delivered: 0 });
        }
        message = buildDecisionMessage(
          notification.type,
          notification.type === "hired" ? notification.recurringAssignmentId ?? null : null,
          chosenLocale,
        );
      }
      let delivered = 0;
      for (const subscription of subscriptions) {
        try {
          const result = await sender.send(subscription, message);
          if (isDeadSubscriptionStatus(result.statusCode)) {
            await pruneSubscription(subscription.id);
          } else if (result.statusCode >= 200 && result.statusCode < 300) {
            delivered += 1;
          } else {
            logger.error(
              "Push service rejected a subscription",
              subscription.id,
              result.statusCode,
            );
          }
        } catch (error) {
          if (isDeadSubscriptionStatus(errorStatusCode(error))) {
            await pruneSubscription(subscription.id);
          } else {
            logger.error("Push delivery failed", subscription.id, error);
          }
        }
      }

      return Response.json({ delivered });
    } catch (error) {
      logger.error(
        "Push dispatch failed after webhook validation",
        payload.notificationId,
        error,
      );
      return Response.json({ delivered: 0 });
    }
  };
}
