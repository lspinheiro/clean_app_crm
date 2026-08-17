import { describe, expect, it, vi } from "vitest";

import { sendResendEmailBatches } from "./resend";

function messages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    html: `<p>${index}</p>`,
    recipientId: `recipient-${index}`,
    subject: "Join the pool",
    text: `Message ${index}`,
    to: `cleaner-${index}@example.com`,
  }));
}

describe("CLE-79 Resend batch adapter", () => {
  it("chunks at 100 and uses a stable idempotency key for each chunk", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: messages(100).map((_, index) => ({ id: `id-${index}` })) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "id-100" }] }), { status: 200 }));

    const outcome = await sendResendEmailBatches({
      apiKey: "server-secret",
      attemptNumber: 0,
      batchId: "batch-id",
      fetcher,
      from: "Coastal Cleaning via The Clean Crew <invite@example.com>",
      messages: messages(101),
      replyTo: "admin@example.com",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toHaveLength(100);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toHaveLength(1);
    expect(fetcher.mock.calls.map(([, init]) => init.headers["Idempotency-Key"])).toEqual([
      "pool-invite/batch-id/attempt/0/chunk/0",
      "pool-invite/batch-id/attempt/0/chunk/1",
    ]);
    expect(outcome.filter((item) => item.status === "accepted")).toHaveLength(101);
  });

  it("honours Retry-After and retries a rate-limited chunk with the same key", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("provider internals", {
        headers: { "retry-after": "0.5" },
        status: 429,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: messages(100).map((_, index) => ({ id: `accepted-${index}` })),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "accepted-100" }] }), { status: 200 }));

    const outcome = await sendResendEmailBatches({
      apiKey: "server-secret",
      attemptNumber: 2,
      batchId: "batch-id",
      fetcher,
      from: "Company via The Clean Crew <invite@example.com>",
      messages: messages(101),
      replyTo: "admin@example.com",
      wait,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledWith(500);
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"])
      .toBe(fetcher.mock.calls[1][1].headers["Idempotency-Key"]);
    expect(outcome.slice(0, 100).every((item) => item.status === "accepted")).toBe(true);
    expect(outcome[100]).toMatchObject({
      providerMessageId: "accepted-100",
      status: "accepted",
    });
    expect(JSON.stringify(outcome)).not.toContain("provider internals");
  });

  it("waits for the advertised rate-limit reset before the next chunk", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: messages(100).map((_, index) => ({ id: `id-${index}` })),
      }), {
        headers: {
          "ratelimit-remaining": "0",
          "ratelimit-reset": "0.25",
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "id-100" }] }), { status: 200 }));

    await sendResendEmailBatches({
      apiKey: "server-secret",
      attemptNumber: 0,
      batchId: "batch-id",
      fetcher,
      from: "Company via The Clean Crew <invite@example.com>",
      messages: messages(101),
      replyTo: "admin@example.com",
      wait,
    });

    expect(wait).toHaveBeenCalledWith(250);
  });

  it("maps network and malformed responses to safe failures", async () => {
    const networkFailure = await sendResendEmailBatches({
      apiKey: "server-secret",
      attemptNumber: 0,
      batchId: "batch-id",
      fetcher: vi.fn().mockRejectedValue(new Error("socket secret")),
      from: "Company via The Clean Crew <invite@example.com>",
      messages: messages(1),
      replyTo: "admin@example.com",
    });
    const malformed = await sendResendEmailBatches({
      apiKey: "server-secret",
      attemptNumber: 0,
      batchId: "batch-id",
      fetcher: vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
      from: "Company via The Clean Crew <invite@example.com>",
      messages: messages(1),
      replyTo: "admin@example.com",
    });

    expect(networkFailure[0]).toMatchObject({
      failureReason: "provider_unavailable",
      status: "failed",
    });
    expect(malformed[0]).toMatchObject({
      failureReason: "provider_invalid_response",
      status: "failed",
    });
  });
});
