"use server";

import { createHash } from "node:crypto";

import { z } from "zod";

import { buildCleanerInviteEmail } from "@/features/cleaners/email";
import {
  CLEANER_INVITE_EMAIL_RECIPIENT_LIMIT,
  type CleanerInviteEmailRecipient,
} from "@/features/cleaners/email-csv";
import { buildCleanerJoinUrl } from "@/features/cleaners/invite";
import { userMessage } from "@/i18n/user-message";
import { requireCompanyAdmin } from "@/lib/auth/session";
import { sendResendEmailBatches, type ResendEmailOutcome } from "@/lib/resend";

const recipientSchema = z.object({
  email: z.string().trim().pipe(z.email().max(320)),
  name: z.union([z.string().trim().max(200), z.null()]).transform((value) => value || null),
});

const sendInputSchema = z.object({
  authorityConfirmed: z.literal(true),
  locale: z.enum(["en-AU", "pt-BR"]),
  postingId: z.uuid(),
  recipients: z.array(recipientSchema).min(1).max(CLEANER_INVITE_EMAIL_RECIPIENT_LIMIT),
});

const retryInputSchema = sendInputSchema.extend({ retryKey: z.uuid() });

const activePostingSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{16}$/),
  id: z.uuid(),
  intent: z.enum(["expression_of_interest", "one_time", "regular"]),
  state: z.literal("active"),
});

export type CleanerInviteEmailResultRecipient = {
  email: string;
  failureReason: string | null;
  name: string | null;
};

export type CleanerInviteEmailActionResult =
  | {
      accepted: CleanerInviteEmailResultRecipient[];
      batchId: string;
      failed: CleanerInviteEmailResultRecipient[];
      ok: true;
    }
  | { error: string; ok: false };

type EmailConfiguration = {
  apiKey: string;
  cleanerAppUrl: string;
  fromEmail: string;
  replyTo: string;
};

function uniqueRecipients(recipients: CleanerInviteEmailRecipient[]) {
  const seen = new Set<string>();
  return recipients.flatMap((recipient) => {
    const email = recipient.email.toLocaleLowerCase("en-AU");
    if (seen.has(email)) return [];
    seen.add(email);
    return [{ email, name: recipient.name }];
  });
}

function loadConfiguration(userEmail: string | undefined): EmailConfiguration | null {
  const parsed = z.object({
    apiKey: z.string().min(1),
    cleanerAppUrl: z.url(),
    fromEmail: z.email(),
    replyTo: z.email(),
  }).safeParse({
    apiKey: process.env.RESEND_API_KEY,
    cleanerAppUrl: process.env.NEXT_PUBLIC_CLEANER_APP_URL,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    replyTo: userEmail,
  });
  return parsed.success ? parsed.data : null;
}

function uuidFromParts(parts: unknown[]) {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function confirmationKey(
  postingId: string,
  locale: "en-AU" | "pt-BR",
  recipients: CleanerInviteEmailRecipient[],
) {
  return uuidFromParts([
    postingId,
    locale,
    recipients.map(({ email }) => email).sort(),
  ]);
}

function senderAddress(companyName: string, fromEmail: string) {
  const displayName = `${companyName} via The Clean Crew`
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  return `"${displayName}" <${fromEmail}>`;
}

function resultRecipient(
  recipient: CleanerInviteEmailRecipient,
  outcome: ResendEmailOutcome,
): CleanerInviteEmailResultRecipient {
  return {
    email: recipient.email,
    failureReason: outcome.status === "failed" ? outcome.failureReason : null,
    name: recipient.name,
  };
}

async function activePosting(
  supabase: Awaited<ReturnType<typeof requireCompanyAdmin>>["supabase"],
  companyId: string,
  postingId: string,
) {
  try {
    const { data, error } = await supabase
      .from("posting_states")
      .select("id, code, intent, state")
      .eq("id", postingId)
      .eq("company_id", companyId)
      .eq("state", "active")
      .maybeSingle();
    const parsed = activePostingSchema.safeParse(data);
    return error || !parsed.success ? null : parsed.data;
  } catch {
    return null;
  }
}

async function deliverMessage({
  attemptNumber,
  batchId,
  companyName,
  configuration,
  message,
  recipients,
}: {
  attemptNumber: number;
  batchId: string;
  companyName: string;
  configuration: EmailConfiguration;
  message: ReturnType<typeof buildCleanerInviteEmail>;
  recipients: CleanerInviteEmailRecipient[];
}): Promise<CleanerInviteEmailActionResult> {
  const messages = recipients.map((recipient) => ({
    ...message,
    recipientId: uuidFromParts([batchId, recipient.email]),
    to: recipient.email,
  }));
  const recipientsById = new Map(
    messages.map((outbound, index) => [outbound.recipientId, recipients[index]]),
  );
  const outcomes = await sendResendEmailBatches({
    apiKey: configuration.apiKey,
    attemptNumber,
    batchId,
    from: senderAddress(companyName, configuration.fromEmail),
    idempotencyNamespace: "cleaner-posting",
    messages,
    replyTo: configuration.replyTo,
  });
  const accepted: CleanerInviteEmailResultRecipient[] = [];
  const failed: CleanerInviteEmailResultRecipient[] = [];
  outcomes.forEach((outcome) => {
    const recipient = recipientsById.get(outcome.recipientId);
    if (!recipient) throw new Error("Email provider outcome did not match a prepared recipient");
    const result = resultRecipient(recipient, outcome);
    if (outcome.status === "accepted") accepted.push(result);
    else failed.push(result);
  });
  return {
    accepted,
    batchId,
    failed,
    ok: true,
  };
}

async function send(
  input: z.infer<typeof sendInputSchema>,
  attemptNumber: number,
  retryKey?: string,
): Promise<CleanerInviteEmailActionResult> {
  const { company, supabase, user } = await requireCompanyAdmin();
  const configuration = loadConfiguration(user.email);
  if (!configuration) return { error: userMessage("cleanerEmailNotConfigured"), ok: false };
  const posting = await activePosting(supabase, company.id, input.postingId);
  if (!posting) return { error: userMessage("cleanerEmailPrepareFailed"), ok: false };

  const recipients = uniqueRecipients(input.recipients);
  const batchId = retryKey ?? confirmationKey(posting.id, input.locale, recipients);
  let joinUrl: string;
  try {
    joinUrl = buildCleanerJoinUrl(configuration.cleanerAppUrl, posting.code);
  } catch {
    return { error: userMessage("cleanerEmailNotConfigured"), ok: false };
  }
  const message = buildCleanerInviteEmail({
    companyName: company.name,
    intent: posting.intent,
    joinUrl,
    locale: input.locale,
  });
  return deliverMessage({
    attemptNumber,
    batchId,
    companyName: company.name,
    configuration,
    message,
    recipients,
  });
}

export async function sendCleanerInviteEmails(input: unknown): Promise<CleanerInviteEmailActionResult> {
  const parsed = sendInputSchema.safeParse(input);
  if (!parsed.success) return { error: userMessage("cleanerEmailInvalidInput"), ok: false };
  return send(parsed.data, 0);
}

export async function retryFailedCleanerInviteEmails(input: unknown): Promise<CleanerInviteEmailActionResult> {
  const parsed = retryInputSchema.safeParse(input);
  if (!parsed.success) return { error: userMessage("cleanerEmailInvalidInput"), ok: false };
  return send(parsed.data, 1, parsed.data.retryKey);
}
