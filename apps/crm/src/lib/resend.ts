export type ResendEmailMessage = {
  html: string;
  recipientId: string;
  subject: string;
  text: string;
  to: string;
};

export type ResendEmailOutcome =
  | {
      providerMessageId: string;
      recipientId: string;
      status: "accepted";
    }
  | {
      failureReason:
        | "provider_invalid_response"
        | "provider_rejected"
        | "provider_unavailable";
      recipientId: string;
      status: "failed";
    };

type SendResendEmailBatchesInput = {
  apiKey: string;
  attemptNumber: number;
  batchId: string;
  fetcher?: typeof fetch;
  from: string;
  messages: ResendEmailMessage[];
  replyTo: string;
  wait?: (milliseconds: number) => Promise<void>;
};

const resendBatchUrl = "https://api.resend.com/emails/batch";
const resendBatchLimit = 100;
const resendMaxRateLimitAttempts = 3;
const resendMaximumWaitMs = 5_000;

function waitFor(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function secondsHeader(response: Response, name: string) {
  const raw = response.headers.get(name);
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  if (name === "retry-after") {
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.max(0, (date - Date.now()) / 1_000);
  }
  return null;
}

function boundedWaitMs(response: Response, names: string[], fallbackSeconds: number) {
  const seconds = names
    .map((name) => secondsHeader(response, name))
    .find((value): value is number => value !== null) ?? fallbackSeconds;
  return Math.min(Math.ceil(seconds * 1_000), resendMaximumWaitMs);
}

function failedChunk(
  messages: ResendEmailMessage[],
  failureReason: Extract<ResendEmailOutcome, { status: "failed" }>["failureReason"],
): ResendEmailOutcome[] {
  return messages.map(({ recipientId }) => ({
    failureReason,
    recipientId,
    status: "failed",
  }));
}

function responseIds(value: unknown, expectedLength: number): string[] | null {
  if (!value || typeof value !== "object" || !("data" in value)) return null;
  const data = value.data;
  if (!Array.isArray(data) || data.length !== expectedLength) return null;
  const ids = data.map((item) =>
    item && typeof item === "object" && "id" in item && typeof item.id === "string"
      ? item.id
      : null,
  );
  return ids.every((id): id is string => id !== null) ? ids : null;
}

export async function sendResendEmailBatches({
  apiKey,
  attemptNumber,
  batchId,
  fetcher = fetch,
  from,
  messages,
  replyTo,
  wait = waitFor,
}: SendResendEmailBatchesInput): Promise<ResendEmailOutcome[]> {
  const outcomes: ResendEmailOutcome[] = [];

  for (let offset = 0; offset < messages.length; offset += resendBatchLimit) {
    const chunkIndex = Math.floor(offset / resendBatchLimit);
    const chunk = messages.slice(offset, offset + resendBatchLimit);
    const request = {
      body: JSON.stringify(
        chunk.map(({ html, subject, text, to }) => ({
          from,
          html,
          reply_to: replyTo,
          subject,
          text,
          to: [to],
        })),
      ),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `cleaner-invite/${batchId}/attempt/${attemptNumber}/chunk/${chunkIndex}`,
      },
      method: "POST",
    } satisfies RequestInit;
    let response: Response | null = null;

    for (let requestAttempt = 0; requestAttempt < resendMaxRateLimitAttempts; requestAttempt += 1) {
      try {
        response = await fetcher(resendBatchUrl, request);
      } catch {
        response = null;
        break;
      }
      if (response.status !== 429 || requestAttempt === resendMaxRateLimitAttempts - 1) break;
      await wait(boundedWaitMs(response, ["retry-after", "ratelimit-reset"], 1));
    }

    if (!response) {
      outcomes.push(...failedChunk(chunk, "provider_unavailable"));
      continue;
    }

    if (!response.ok) {
      outcomes.push(...failedChunk(
        chunk,
        response.status === 429 ? "provider_unavailable" : "provider_rejected",
      ));
      if (
        offset + resendBatchLimit < messages.length
        && response.headers.get("ratelimit-remaining") === "0"
      ) {
        await wait(boundedWaitMs(response, ["ratelimit-reset", "retry-after"], 1));
      }
      continue;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      outcomes.push(...failedChunk(chunk, "provider_invalid_response"));
      continue;
    }
    const ids = responseIds(payload, chunk.length);
    if (!ids) {
      outcomes.push(...failedChunk(chunk, "provider_invalid_response"));
      continue;
    }

    outcomes.push(
      ...chunk.map(({ recipientId }, index) => ({
        providerMessageId: ids[index],
        recipientId,
        status: "accepted" as const,
      })),
    );

    if (
      offset + resendBatchLimit < messages.length
      && response.headers.get("ratelimit-remaining") === "0"
    ) {
      await wait(boundedWaitMs(response, ["ratelimit-reset"], 1));
    }
  }

  return outcomes;
}
