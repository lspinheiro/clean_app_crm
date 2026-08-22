import assert from "node:assert/strict";

import {
  type BoardVisibleJob,
  createPushDispatchHandler,
  type DispatchStore,
  type PushMessage,
  type PushSender,
  type StoredPushSubscription,
} from "./handler.ts";

const notificationId = "25000000-0000-4000-8000-000000000801";
const recipientId = "10000000-0000-4000-8000-000000000002";
const jobId = "25000000-0000-4000-8000-000000000501";
const secret = "test-webhook-secret";

type NotificationRecord = {
  recipientId: string;
  jobId: string;
  type: string;
};

const subscription: StoredPushSubscription = {
  id: "25000000-0000-4000-8000-000000000901",
  endpoint: "https://push.example.test/subscription",
  p256dh: "browser-public-key",
  auth: "browser-auth-key",
};

const safeJob: BoardVisibleJob = {
  serviceName: "Office clean",
  siteName: "Palm Grove Practice",
  suburb: "Robina",
  scheduledStart: "2099-09-01T08:00:00+10:00",
};

class FakeStore implements DispatchStore {
  readonly deleted: string[] = [];
  readonly notificationLookups: string[] = [];
  readonly subscriptionLookups: string[] = [];
  readonly jobLookups: string[] = [];

  constructor(
    private readonly subscriptions: StoredPushSubscription[] = [subscription],
    private readonly job: BoardVisibleJob | null = safeJob,
    private readonly notification: NotificationRecord | null = {
      recipientId,
      jobId,
      type: "job_assigned",
    },
  ) {}

  getNotification(
    targetNotificationId: string,
  ): Promise<NotificationRecord | null> {
    this.notificationLookups.push(targetNotificationId);
    return Promise.resolve(this.notification);
  }

  listSubscriptions(profileId: string): Promise<StoredPushSubscription[]> {
    this.subscriptionLookups.push(profileId);
    return Promise.resolve(this.subscriptions);
  }

  getBoardVisibleJob(targetJobId: string): Promise<BoardVisibleJob | null> {
    this.jobLookups.push(targetJobId);
    return Promise.resolve(this.job);
  }

  deleteSubscription(subscriptionId: string): Promise<void> {
    this.deleted.push(subscriptionId);
    return Promise.resolve();
  }
}

class FakeSender implements PushSender {
  readonly sent: Array<
    { subscription: StoredPushSubscription; message: PushMessage }
  > = [];

  constructor(
    private readonly result: { statusCode: number } | Error = {
      statusCode: 201,
    },
  ) {}

  send(
    targetSubscription: StoredPushSubscription,
    message: PushMessage,
  ): Promise<{ statusCode: number }> {
    this.sent.push({ subscription: targetSubscription, message });
    if (this.result instanceof Error) return Promise.reject(this.result);
    return Promise.resolve(this.result);
  }
}

function webhookRequest(
  type: string,
  bearer = secret,
  overrides: Partial<
    { notificationId: string; recipientId: string; jobId: string }
  > = {},
): Request {
  return new Request("http://localhost/push-dispatch", {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      notificationId,
      recipientId,
      jobId,
      type,
      ...overrides,
    }),
  });
}

async function dispatch(
  type: string,
  store = new FakeStore(),
  sender = new FakeSender(),
) {
  const handler = createPushDispatchHandler({
    store,
    sender,
    secret,
    logger: { error() {} },
  });
  const response = await handler(webhookRequest(type));
  return { response, store, sender };
}

Deno.test("job_assigned sends a safe payload that opens My jobs", async () => {
  const { response, store, sender } = await dispatch("job_assigned");

  assert.equal(response.status, 200);
  assert.deepEqual(store.subscriptionLookups, [recipientId]);
  assert.deepEqual(store.jobLookups, [jobId]);
  assert.equal(sender.sent.length, 1);
  assert.deepEqual(sender.sent[0]?.subscription, subscription);
  assert.deepEqual(sender.sent[0]?.message, {
    type: "job_assigned",
    jobId,
    title: "Job assigned",
    body: "Office clean · Palm Grove Practice, Robina · 1 Sept 2099, 8:00 am",
    url: "/my-jobs",
  });
});

Deno.test("job_posted sends a safe payload that opens the board", async () => {
  const store = new FakeStore([subscription], safeJob, {
    recipientId,
    jobId,
    type: "job_posted",
  });
  const { sender } = await dispatch("job_posted", store);

  assert.deepEqual(sender.sent[0]?.message, {
    type: "job_posted",
    jobId,
    title: "New job available",
    body: "Office clean · Palm Grove Practice, Robina · 1 Sept 2099, 8:00 am",
    url: "/board",
  });
});

Deno.test("job_cancelled sends a safe payload that opens My jobs", async () => {
  const store = new FakeStore([subscription], safeJob, {
    recipientId,
    jobId,
    type: "job_cancelled",
  });
  const { sender } = await dispatch("job_cancelled", store);

  assert.deepEqual(sender.sent[0]?.message, {
    type: "job_cancelled",
    jobId,
    title: "Job cancelled",
    body: "Office clean · Palm Grove Practice, Robina · 1 Sept 2099, 8:00 am",
    url: "/my-jobs",
  });
});

Deno.test("payload construction ignores private job fields even when the store returns them", async () => {
  const privateJob = {
    ...safeJob,
    address: "25 Private Street",
    accessNotes: "Code 1234",
    clientPhone: "0400 000 000",
    clientChargeCents: 45000,
    internalNotes: "Do not disclose",
  };
  const { sender } = await dispatch(
    "job_posted",
    new FakeStore([subscription], privateJob, {
      recipientId,
      jobId,
      type: "job_posted",
    }),
  );

  const serialised = JSON.stringify(sender.sent[0]?.message);
  assert.equal(serialised.includes("25 Private Street"), false);
  assert.equal(serialised.includes("Code 1234"), false);
  assert.equal(serialised.includes("0400 000 000"), false);
  assert.equal(serialised.includes("45000"), false);
  assert.equal(serialised.includes("Do not disclose"), false);
  assert.deepEqual(Object.keys(sender.sent[0]?.message ?? {}).sort(), [
    "body",
    "jobId",
    "title",
    "type",
    "url",
  ]);
});

Deno.test("a 410 response prunes the dead subscription", async () => {
  const store = new FakeStore();
  const sender = new FakeSender({ statusCode: 410 });
  const result = await dispatch("job_assigned", store, sender);

  assert.equal(result.response.status, 200);
  assert.deepEqual(store.deleted, [subscription.id]);
});

Deno.test("an unknown notification type is a 200 no-op", async () => {
  const store = new FakeStore([subscription], safeJob, {
    recipientId,
    jobId,
    type: "payment_marked_paid",
  });
  const sender = new FakeSender();
  const result = await dispatch("payment_marked_paid", store, sender);

  assert.equal(result.response.status, 200);
  assert.deepEqual(store.subscriptionLookups, []);
  assert.deepEqual(store.jobLookups, []);
  assert.deepEqual(sender.sent, []);
});

Deno.test("the notification row overrides forged recipient, job, and type fields", async () => {
  const store = new FakeStore();
  const sender = new FakeSender();
  const handler = createPushDispatchHandler({
    store,
    sender,
    secret,
    logger: { error() {} },
  });
  const response = await handler(webhookRequest("job_cancelled", secret, {
    recipientId: "10000000-0000-4000-8000-000000000099",
    jobId: "25000000-0000-4000-8000-000000000599",
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(store.notificationLookups, [notificationId]);
  assert.deepEqual(store.subscriptionLookups, [recipientId]);
  assert.deepEqual(store.jobLookups, [jobId]);
  assert.equal(sender.sent[0]?.message.type, "job_assigned");
  assert.equal(sender.sent[0]?.message.jobId, jobId);
});

Deno.test("a missing notification row is a 200 no-op", async () => {
  const store = new FakeStore([subscription], safeJob, null);
  const sender = new FakeSender();
  const result = await dispatch("job_assigned", store, sender);

  assert.equal(result.response.status, 200);
  assert.deepEqual(store.notificationLookups, [notificationId]);
  assert.deepEqual(store.subscriptionLookups, []);
  assert.deepEqual(store.jobLookups, []);
  assert.deepEqual(sender.sent, []);
});

Deno.test("a failed send is logged and does not prevent later subscriptions", async () => {
  const secondSubscription = {
    ...subscription,
    id: "25000000-0000-4000-8000-000000000902",
    endpoint: "https://push.example.test/subscription-2",
  };
  const store = new FakeStore([subscription, secondSubscription]);
  const errors: unknown[][] = [];
  const calls: string[] = [];
  const sender: PushSender = {
    async send(targetSubscription) {
      calls.push(targetSubscription.id);
      if (targetSubscription.id === subscription.id) {
        throw new Error("push service unavailable");
      }
      return { statusCode: 201 };
    },
  };
  const handler = createPushDispatchHandler({
    store,
    sender,
    secret,
    logger: { error: (...values) => errors.push(values) },
  });

  const response = await handler(webhookRequest("job_posted"));

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [subscription.id, secondSubscription.id]);
  assert.equal(errors.length, 1);
});

Deno.test("the webhook rejects the wrong bearer before any database read", async () => {
  const store = new FakeStore();
  const sender = new FakeSender();
  const handler = createPushDispatchHandler({
    store,
    sender,
    secret,
    logger: { error() {} },
  });

  const response = await handler(webhookRequest("job_posted", "wrong-secret"));

  assert.equal(response.status, 401);
  assert.deepEqual(store.notificationLookups, []);
  assert.deepEqual(store.subscriptionLookups, []);
  assert.deepEqual(sender.sent, []);
});

Deno.test("the webhook rejects malformed identifiers before any database read", async () => {
  const store = new FakeStore();
  const sender = new FakeSender();
  const handler = createPushDispatchHandler({
    store,
    sender,
    secret,
    logger: { error() {} },
  });
  const request = new Request("http://localhost/push-dispatch", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      notificationId: "not-a-uuid",
      recipientId,
      jobId,
      type: "job_posted",
    }),
  });

  const response = await handler(request);

  assert.equal(response.status, 400);
  assert.deepEqual(store.notificationLookups, []);
  assert.deepEqual(store.subscriptionLookups, []);
  assert.deepEqual(sender.sent, []);
});
