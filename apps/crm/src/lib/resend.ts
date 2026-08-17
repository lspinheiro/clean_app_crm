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
};

const resendBatchUrl = "https://api.resend.com/emails/batch";
const resendBatchLimit = 100;

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
}: SendResendEmailBatchesInput): Promise<ResendEmailOutcome[]> {
  const outcomes: ResendEmailOutcome[] = [];

  for (let offset = 0; offset < messages.length; offset += resendBatchLimit) {
    const chunkIndex = Math.floor(offset / resendBatchLimit);
    const chunk = messages.slice(offset, offset + resendBatchLimit);
    let response: Response;

    try {
      response = await fetcher(resendBatchUrl, {
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
          "Idempotency-Key": `pool-invite/${batchId}/attempt/${attemptNumber}/chunk/${chunkIndex}`,
        },
        method: "POST",
      });
    } catch {
      outcomes.push(...failedChunk(chunk, "provider_unavailable"));
      continue;
    }

    if (!response.ok) {
      outcomes.push(...failedChunk(chunk, "provider_rejected"));
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
  }

  return outcomes;
}
