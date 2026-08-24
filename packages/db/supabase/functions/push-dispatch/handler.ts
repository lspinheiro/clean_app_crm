export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type StoredNotification = {
  recipientId: string;
  jobId: string;
  type: string;
};

export type BoardVisibleJob = {
  serviceName: string;
  siteName: string;
  suburb: string;
  scheduledStart: string;
};

export type PushMessage = {
  type: "job_assigned" | "job_posted" | "job_cancelled";
  jobId: string;
  title: string;
  body: string;
  url: "/my-jobs" | "/board";
};

export interface DispatchStore {
  getNotification(notificationId: string): Promise<StoredNotification | null>;
  listSubscriptions(profileId: string): Promise<StoredPushSubscription[]>;
  getBoardVisibleJob(jobId: string): Promise<BoardVisibleJob | null>;
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

type DeliveredNotificationType = PushMessage["type"];

type WebhookPayload = {
  notificationId: string;
  recipientId: string;
  jobId: string;
  type: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const notificationPresentation: Record<
  DeliveredNotificationType,
  Pick<PushMessage, "title" | "url">
> = {
  job_assigned: { title: "Job assigned", url: "/my-jobs" },
  job_posted: { title: "New job available", url: "/board" },
  job_cancelled: { title: "Job cancelled", url: "/my-jobs" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWebhookPayload(value: unknown): WebhookPayload | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "jobId,notificationId,recipientId,type") return null;

  const { notificationId, recipientId, jobId, type } = value;
  if (
    typeof notificationId !== "string" ||
    typeof recipientId !== "string" ||
    typeof jobId !== "string" ||
    typeof type !== "string" ||
    !uuidPattern.test(notificationId) ||
    !uuidPattern.test(recipientId) ||
    !uuidPattern.test(jobId) ||
    type.trim() === ""
  ) {
    return null;
  }

  return { notificationId, recipientId, jobId, type };
}

function isDeliveredType(type: string): type is DeliveredNotificationType {
  return Object.hasOwn(notificationPresentation, type);
}

function formatScheduledStart(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Brisbane",
  })
    .format(new Date(value))
    .replaceAll("\u202f", " ");
}

function buildMessage(
  type: DeliveredNotificationType,
  jobId: string,
  job: BoardVisibleJob,
): PushMessage {
  const presentation = notificationPresentation[type];
  return {
    type,
    jobId,
    title: presentation.title,
    body: `${job.serviceName} · ${job.siteName}, ${job.suburb} · ${
      formatScheduledStart(job.scheduledStart)
    }`,
    url: presentation.url,
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

      const [subscriptions, job] = await Promise.all([
        store.listSubscriptions(notification.recipientId),
        store.getBoardVisibleJob(notification.jobId),
      ]);
      if (!job || subscriptions.length === 0) {
        return Response.json({ delivered: 0 });
      }

      const message = buildMessage(notification.type, notification.jobId, job);
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
