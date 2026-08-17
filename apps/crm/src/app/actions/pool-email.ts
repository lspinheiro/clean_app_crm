"use server";

import { z } from "zod";

import { buildPoolInviteEmail } from "@/features/pool/email";
import type { PoolInviteEmailRecipient } from "@/features/pool/email-csv";
import { buildCleanerJoinUrl } from "@/features/pool/invite";
import { userMessage } from "@/i18n/user-message";
import { requireCompanyAdmin } from "@/lib/auth/session";
import {
  sendResendEmailBatches,
  type ResendEmailOutcome,
} from "@/lib/resend";

const recipientSchema = z.object({
  email: z.string().trim().pipe(z.email().max(320)),
  name: z.union([z.string().trim().max(200), z.null()]).transform((value) => value || null),
});

const sendInputSchema = z.object({
  authorityConfirmed: z.literal(true),
  confirmationKey: z.uuid(),
  inviteId: z.uuid(),
  locale: z.enum(["en-AU", "pt-BR"]),
  recipients: z.array(recipientSchema).min(1),
});

const retryInputSchema = z.object({
  batchId: z.uuid(),
  retryKey: z.uuid(),
});

const preparedRecipientSchema = z.object({
  attempt_number: z.number().int().nonnegative(),
  batch_id: z.uuid(),
  email: z.email(),
  failure_reason: z.string().nullable(),
  invite_code: z.string(),
  locale: z.enum(["en-AU", "pt-BR"]),
  name: z.string().nullable(),
  provider_message_id: z.string().nullable(),
  recipient_id: z.uuid(),
  status: z.enum(["pending", "accepted", "failed"]),
});

const recordedRecipientSchema = z.object({
  email: z.email(),
  failure_reason: z.string().nullable(),
  name: z.string().nullable(),
  provider_message_id: z.string().nullable(),
  recipient_id: z.uuid(),
  status: z.enum(["pending", "accepted", "failed"]),
});

type PreparedRecipient = z.infer<typeof preparedRecipientSchema>;
type RecordedRecipient = z.infer<typeof recordedRecipientSchema>;

export type PoolInviteEmailResultRecipient = {
  email: string;
  failureReason: string | null;
  name: string | null;
};

export type PoolInviteEmailActionResult =
  | {
      accepted: PoolInviteEmailResultRecipient[];
      batchId: string;
      failed: PoolInviteEmailResultRecipient[];
      ok: true;
    }
  | { error: string; ok: false };

type EmailConfiguration = {
  apiKey: string;
  cleanerAppUrl: string;
  fromEmail: string;
  replyTo: string;
};

function uniqueRecipients(recipients: PoolInviteEmailRecipient[]) {
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

function safeSenderName(companyName: string) {
  return companyName.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim();
}

function resultFromRows(
  batchId: string,
  rows: RecordedRecipient[],
): PoolInviteEmailActionResult {
  const mapRow = (row: RecordedRecipient): PoolInviteEmailResultRecipient => ({
    email: row.email,
    failureReason: row.failure_reason,
    name: row.name,
  });
  return {
    accepted: rows.filter((row) => row.status === "accepted").map(mapRow),
    batchId,
    failed: rows.filter((row) => row.status === "failed").map(mapRow),
    ok: true,
  };
}

function providerResults(outcomes: ResendEmailOutcome[]) {
  return outcomes.map((outcome) =>
    outcome.status === "accepted"
      ? {
          failure_reason: null,
          provider_message_id: outcome.providerMessageId,
          recipient_id: outcome.recipientId,
          status: outcome.status,
        }
      : {
          failure_reason: outcome.failureReason,
          provider_message_id: null,
          recipient_id: outcome.recipientId,
          status: outcome.status,
        },
  );
}

async function deliverPreparedRecipients(
  preparedRows: PreparedRecipient[],
  companyName: string,
  configuration: EmailConfiguration,
  supabase: Awaited<ReturnType<typeof requireCompanyAdmin>>["supabase"],
): Promise<PoolInviteEmailActionResult> {
  const first = preparedRows[0];
  if (!first) return { error: userMessage("poolEmailPrepareFailed"), ok: false };

  const pending = preparedRows.filter((row) => row.status === "pending");
  if (pending.length === 0) {
    return resultFromRows(first.batch_id, preparedRows);
  }

  let joinUrl: string;
  try {
    joinUrl = buildCleanerJoinUrl(configuration.cleanerAppUrl, first.invite_code);
  } catch {
    return { error: userMessage("poolEmailNotConfigured"), ok: false };
  }
  const message = buildPoolInviteEmail({
    companyName,
    joinUrl,
    locale: first.locale,
  });
  const outcomes = await sendResendEmailBatches({
    apiKey: configuration.apiKey,
    attemptNumber: first.attempt_number,
    batchId: first.batch_id,
    from: `${safeSenderName(companyName)} via The Clean Crew <${configuration.fromEmail}>`,
    messages: pending.map((recipient) => ({
      ...message,
      recipientId: recipient.recipient_id,
      to: recipient.email,
    })),
    replyTo: configuration.replyTo,
  });

  try {
    const { data, error } = await supabase.rpc("record_pool_invite_email_results", {
      attempt_number: first.attempt_number,
      provider_results: providerResults(outcomes),
      selected_batch_id: first.batch_id,
    });
    const parsed = z.array(recordedRecipientSchema).safeParse(data);
    if (error || !parsed.success) {
      return { error: userMessage("poolEmailRecordFailed"), ok: false };
    }
    return resultFromRows(first.batch_id, parsed.data);
  } catch {
    return { error: userMessage("poolEmailRecordFailed"), ok: false };
  }
}

export async function sendPoolInviteEmails(input: unknown): Promise<PoolInviteEmailActionResult> {
  const parsed = sendInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: userMessage("poolEmailInvalidInput"), ok: false };
  }

  const { company, supabase, user } = await requireCompanyAdmin();
  const configuration = loadConfiguration(user.email);
  if (!configuration) {
    return { error: userMessage("poolEmailNotConfigured"), ok: false };
  }
  const recipients = uniqueRecipients(parsed.data.recipients);
  let preparedRows: PreparedRecipient[];
  try {
    const { data, error } = await supabase.rpc("prepare_pool_invite_email_batch", {
      authority_confirmed: parsed.data.authorityConfirmed,
      confirmation_key: parsed.data.confirmationKey,
      recipients,
      selected_invite_id: parsed.data.inviteId,
      selected_locale: parsed.data.locale,
      target_company_id: company.id,
    });
    const prepared = z.array(preparedRecipientSchema).safeParse(data);
    if (error || !prepared.success) {
      return { error: userMessage("poolEmailPrepareFailed"), ok: false };
    }
    preparedRows = prepared.data;
  } catch {
    return { error: userMessage("poolEmailPrepareFailed"), ok: false };
  }
  return deliverPreparedRecipients(preparedRows, company.name, configuration, supabase);
}

export async function retryFailedPoolInviteEmails(
  input: unknown,
): Promise<PoolInviteEmailActionResult> {
  const parsed = retryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: userMessage("poolEmailInvalidInput"), ok: false };
  }

  const { company, supabase, user } = await requireCompanyAdmin();
  const configuration = loadConfiguration(user.email);
  if (!configuration) {
    return { error: userMessage("poolEmailNotConfigured"), ok: false };
  }
  let preparedRows: PreparedRecipient[];
  try {
    const { data, error } = await supabase.rpc("prepare_pool_invite_email_retry", {
      retry_key: parsed.data.retryKey,
      selected_batch_id: parsed.data.batchId,
    });
    const prepared = z.array(preparedRecipientSchema).safeParse(data);
    if (error || !prepared.success) {
      return { error: userMessage("poolEmailPrepareFailed"), ok: false };
    }
    preparedRows = prepared.data;
  } catch {
    return { error: userMessage("poolEmailPrepareFailed"), ok: false };
  }
  return deliverPreparedRecipients(preparedRows, company.name, configuration, supabase);
}
