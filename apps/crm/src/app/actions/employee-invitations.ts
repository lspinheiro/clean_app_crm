"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  employeeInvitationIdSchema,
  employeeInvitationInputSchema,
  newEmployeeAccountSchema,
} from "@/features/employee-invitations/schema";
import type { EmployeeInvitationActionResult } from "@/features/employee-invitations/state";
import { normaliseCleanerAppUrl } from "@/features/cleaners/invite";
import {
  localeCookieMaxAgeSeconds,
  localeCookieName,
} from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { revalidateLocalizedPath } from "@/i18n/revalidate";
import { userMessage } from "@/i18n/user-message";
import { requireCompanyOwner } from "@/lib/auth/session";
import { sendResendEmailBatches } from "@/lib/resend";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const preparedInvitationSchema = z.object({
  /** A usable login exists: the address is confirmed and a password is set. */
  account_existed: z.boolean(),
  /** Some auth record exists, with or without a password. Not the same question. */
  auth_user_exists: z.boolean(),
  invitation_expires_at: z.iso.datetime({ offset: true }),
  invitation_id: z.uuid(),
});

const invitationContextSchema = z.object({
  account_existed_at_invitation: z.boolean(),
  // Every lifecycle state is read, not only 'pending'. Accepting the literal and nothing else
  // turned "this expired ten minutes ago" into a parse failure, and a parse failure into the one
  // sentence that fits any of them — which is the sentence that tells the invitee nothing.
  invitation_status: z.enum(["accepted", "expired", "pending", "replaced", "revoked"]),
  locale: z.enum(["en-AU", "pt-BR"]),
  profile_full_name: z.string(),
  profile_locale: z.enum(["en-AU", "pt-BR"]).nullable(),
});

/**
 * The form is drawn from a reading taken when the page loaded, and any of these can happen
 * between that reading and the submit. Naming the state is the difference between "ask the
 * company for a new invitation" and "open the newer e-mail you already have".
 */
const lapsedInvitationMessages = {
  expired: userMessage("employeeInvitationExpired"),
  replaced: userMessage("employeeInvitationReplaced"),
  revoked: userMessage("employeeInvitationRevoked"),
} as const;

function failure(
  formError: string | null,
  fieldErrors: Exclude<EmployeeInvitationActionResult, { ok: true }>["fieldErrors"] = {},
): EmployeeInvitationActionResult {
  return { fieldErrors, formError, ok: false };
}

function invitationUrl(appUrl: string, locale: "en-AU" | "pt-BR", invitationId: string) {
  const url = new URL(`/${locale}/invite/accept`, normaliseCleanerAppUrl(appUrl));
  url.searchParams.set("employeeInvitation", invitationId);
  return url.toString();
}

/**
 * The invitation rides in the path, so this redirect carries no query string. Auth templates
 * can then all join the token with `?`. While it was a query parameter the employee branch of
 * the invite template had to use `&`, and a redirect Auth refused — substituting `site_url` —
 * reached the invitee as `https://cleaner.thecleancrew.app&token_hash=…`: no path, wrong app,
 * and not a valid URL.
 */
function confirmationUrl(appUrl: string, locale: "en-AU" | "pt-BR", invitationId: string) {
  return new URL(
    `/${locale}/auth/confirm/${invitationId}`,
    normaliseCleanerAppUrl(appUrl),
  ).toString();
}

/** Carries the provider's reason to the handler without putting it in front of the owner. */
class DeliveryRejected extends Error {
  constructor(readonly cause: unknown) {
    super("Delivery rejected");
    this.name = "DeliveryRejected";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function existingAccountMessage(input: {
  companyName: string;
  invitationUrl: string;
  locale: "en-AU" | "pt-BR";
}) {
  const companyName = escapeHtml(input.companyName);
  const url = escapeHtml(input.invitationUrl);
  if (input.locale === "pt-BR") {
    return {
      html: `<p>${companyName} convidou você para a equipe.</p><p><a href="${url}">Entre e aceite o convite</a>.</p><p>O convite vence em 7 dias. Se você não esperava esta mensagem, ignore-a.</p>`,
      subject: `Convite para a equipe da ${input.companyName}`,
      text: `${input.companyName} convidou você para a equipe. Entre e aceite o convite: ${input.invitationUrl}\n\nO convite vence em 7 dias. Se você não esperava esta mensagem, ignore-a.`,
    };
  }
  return {
    html: `<p>${companyName} invited you to join its team.</p><p><a href="${url}">Sign in and accept the invitation</a>.</p><p>The invitation expires in 7 days. If you did not expect this message, ignore it.</p>`,
    subject: `Invitation to join ${input.companyName}`,
    text: `${input.companyName} invited you to join its team. Sign in and accept the invitation: ${input.invitationUrl}\n\nThe invitation expires in 7 days. If you did not expect this message, ignore it.`,
  };
}

/**
 * Supabase reports an exhausted e-mail allowance as 429 / `over_email_send_rate_limit`. The
 * project's `rate_limit_email_sent` is a per-hour figure, so an owner testing invitations
 * reaches it easily — and "check the address" is the wrong thing to tell them.
 */
function isEmailRateLimit(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  const status = Reflect.get(cause, "status");
  const code = Reflect.get(cause, "code");
  return status === 429 || code === "over_email_send_rate_limit";
}

/**
 * Auth refuses a password change that changes nothing, as 422 `same_password`. On the retry that
 * follows a failed membership step that is not a rejection — it is the confirmation that the
 * password being submitted is already this account's, which is all this step ever had to achieve.
 *
 * Safe against the CLE-94 lockout, and only because of where the check sits in Auth: it compares
 * against a stored hash and is skipped entirely when there is none, so `same_password` cannot be
 * returned for an account that has no password. Treating it as "already done" therefore never
 * lets a membership be created for an account that cannot sign in.
 */
function isPasswordAlreadySet(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  return Reflect.get(cause, "code") === "same_password";
}

async function revokeFailedDelivery(
  supabase: Awaited<ReturnType<typeof requireCompanyOwner>>["supabase"],
  companyId: string,
  invitationId: string,
) {
  try {
    const { error } = await supabase.rpc("revoke_employee_invitation", {
      target_company_id: companyId,
      target_invitation_id: invitationId,
    });
    if (error) {
      console.error("Failed employee invitation delivery could not be revoked.");
      return false;
    }
    return true;
  } catch {
    console.error("Failed employee invitation delivery could not be revoked.");
    return false;
  }
}

export async function inviteEmployeeAction(
  formData: FormData,
): Promise<EmployeeInvitationActionResult> {
  const parsed = employeeInvitationInputSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    locale: String(formData.get("locale") ?? ""),
    role: String(formData.get("role") ?? ""),
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return failure(null, {
      email: errors.email?.[0],
      locale: errors.locale?.[0],
      role: errors.role?.[0],
    });
  }

  const { company, supabase, user } = await requireCompanyOwner();
  let prepared: z.infer<typeof preparedInvitationSchema>;
  try {
    const { data, error } = await supabase.rpc("prepare_employee_invitation", {
      target_company_id: company.id,
      target_email: parsed.data.email,
      target_locale: parsed.data.locale,
      target_role: parsed.data.role,
    });
    const result = preparedInvitationSchema.safeParse(data?.[0]);
    if (error || !result.success) {
      return failure(userMessage("employeeInvitationFailed"));
    }
    prepared = result.data;
  } catch {
    return failure(userMessage("employeeInvitationFailed"));
  }

  const appUrl = process.env.NEXT_PUBLIC_CRM_APP_URL;
  try {
    if (!appUrl) throw new Error("CRM URL missing");
    if (prepared.account_existed) {
      const configuration = z.object({
        apiKey: z.string().min(1),
        fromEmail: z.email(),
        replyTo: z.email(),
      }).parse({
        apiKey: process.env.RESEND_API_KEY,
        fromEmail: process.env.RESEND_FROM_EMAIL,
        replyTo: user.email,
      });
      const link = invitationUrl(appUrl, parsed.data.locale, prepared.invitation_id);
      const message = existingAccountMessage({
        companyName: company.name,
        invitationUrl: link,
        locale: parsed.data.locale,
      });
      const outcomes = await sendResendEmailBatches({
        apiKey: configuration.apiKey,
        attemptNumber: 0,
        batchId: prepared.invitation_id,
        from: `The Clean Crew <${configuration.fromEmail}>`,
        messages: [{
          ...message,
          recipientId: prepared.invitation_id,
          to: parsed.data.email,
        }],
        replyTo: configuration.replyTo,
      });
      if (outcomes[0]?.status !== "accepted") throw new DeliveryRejected(outcomes[0]);
    } else if (prepared.auth_user_exists) {
      // Registered but with no password — the state an invite link leaves behind when a scanner
      // follows it, which confirms the address while the password is still only set inside
      // acceptance. `inviteUserByEmail` refuses an address that is already registered, and
      // "sign in and accept" points at a login that does not exist, so recovery is the only
      // way to reach this person. Same reasoning as `requestEmployeeInvitationLinkAction`.
      const admin = createAdminClient();
      const { error } = await admin.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: confirmationUrl(appUrl, parsed.data.locale, prepared.invitation_id),
      });
      if (error) throw new DeliveryRejected(error);
    } else {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
        data: {
          company_name: company.name,
          invitation_kind: "employee",
          preferred_locale: parsed.data.locale,
        },
        redirectTo: confirmationUrl(appUrl, parsed.data.locale, prepared.invitation_id),
      });
      if (error || !data.user) throw new DeliveryRejected(error);
    }
  } catch (cause) {
    // The reason has to survive. A bare `catch {}` here made a rate limit, a rejected address
    // and a provider outage the same event, which is why an invitation revoked 46 ms after it
    // was created on 2026-08-25 could not be explained afterwards.
    const reason = cause instanceof DeliveryRejected ? cause.cause : cause;
    console.error("Employee invitation delivery failed", {
      companyId: company.id,
      invitationId: prepared.invitation_id,
      reason,
    });
    const withdrawn = await revokeFailedDelivery(supabase, company.id, prepared.invitation_id);
    // Either outcome leaves the owner's list wrong: it was drawn before this invitation
    // existed, so it shows neither the withdrawal nor the row they now have to revoke by hand.
    revalidateLocalizedPath("/settings");
    // The provider's text can name the address or the mailbox, so it stays in the log.
    const rateLimited = isEmailRateLimit(reason);
    if (!withdrawn) {
      // Silence here is what made the 2026-08-25 invitation invisible: pending in the database,
      // absent from the list, and holding the address against the next attempt. The owner is
      // the only one who can clear it, so they have to be told it is theirs to clear.
      return failure(userMessage(
        rateLimited
          ? "employeeInvitationRateLimitedStillOpen"
          : "employeeInvitationDeliveryFailedStillOpen",
      ));
    }
    return failure(userMessage(
      rateLimited
        ? "employeeInvitationRateLimited"
        : "employeeInvitationDeliveryFailed",
    ));
  }

  revalidateLocalizedPath("/settings");
  return { ok: true };
}

/**
 * Callable without a session: the invitee has no account yet, which is the whole problem.
 * Authority comes from holding the invitation id — an unguessable uuid that reached the
 * inbox — and from the claim, which refuses anything but a live invitation and bounds
 * re-sends to the project's own sixty-second `smtp_max_frequency`.
 *
 * The answer is always `ok`. Reporting why a claim was refused would tell whoever holds a
 * link id which invitations are live, and let them time the answers.
 */
export async function requestEmployeeInvitationLinkAction(
  invitationId: string,
): Promise<EmployeeInvitationActionResult> {
  const parsed = employeeInvitationIdSchema.safeParse(invitationId);
  if (!parsed.success) return failure(userMessage("employeeInvitationFailed"));

  const appUrl = process.env.NEXT_PUBLIC_CRM_APP_URL;
  if (!appUrl) return failure(userMessage("employeeInvitationFailed"));

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_employee_invitation_link", {
    target_invitation_id: parsed.data,
  });
  const claim = data?.[0];
  if (error || !claim?.claimed || !claim.invitee_email || !claim.locale) {
    return { ok: true };
  }

  const redirectTo = confirmationUrl(appUrl, claim.locale, parsed.data);

  try {
    // "Confirmed" does not mean "can sign in". Following an invite link confirms the address,
    // and an e-mail scanner following it for the invitee does the same — but the password is
    // only set later, inside acceptance. Re-inviting such an address is refused as already
    // registered, so recovery is the only way back in for the person this feature exists for.
    //
    // Which e-mail goes out is decided here and never reflected in the response, so holding a
    // link id cannot be used to learn whether an address already has an account.
    const { error: deliveryError } = claim.account_confirmed
      ? await admin.auth.resetPasswordForEmail(claim.invitee_email, { redirectTo })
      : await admin.auth.admin.inviteUserByEmail(claim.invitee_email, {
        data: {
          company_name: "",
          invitation_kind: "employee",
          preferred_locale: claim.locale,
        },
        redirectTo,
      });
    if (deliveryError) throw new DeliveryRejected(deliveryError);
  } catch (cause) {
    const reason = cause instanceof DeliveryRejected ? cause.cause : cause;
    console.error("Employee invitation link could not be re-sent", {
      invitationId: parsed.data,
      reason,
    });
    // The claim reserved the next minute before the provider had accepted anything. Giving it
    // back stops a rejected send from blocking the retry that would have worked.
    await admin.rpc("release_employee_invitation_link_claim", {
      target_invitation_id: parsed.data,
    });
  }

  return { ok: true };
}

export async function revokeEmployeeInvitationAction(
  invitationId: string,
): Promise<EmployeeInvitationActionResult> {
  const parsedId = employeeInvitationIdSchema.safeParse(invitationId);
  if (!parsedId.success) return failure(userMessage("employeeInvitationFailed"));

  const { company, supabase } = await requireCompanyOwner();
  try {
    const { error } = await supabase.rpc("revoke_employee_invitation", {
      target_company_id: company.id,
      target_invitation_id: parsedId.data,
    });
    if (error) return failure(userMessage("employeeInvitationFailed"));
  } catch {
    return failure(userMessage("employeeInvitationFailed"));
  }
  revalidateLocalizedPath("/settings");
  return { ok: true };
}

/**
 * The end of acceptance, reached both by completing it and by finding it already complete. A
 * retry after a lost answer has to land in the same place succeeding first time would have.
 */
async function enterCompany(targetLocale: "en-AU" | "pt-BR"): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, targetLocale, {
    maxAge: localeCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
  });
  return redirect({ href: "/roster", locale: targetLocale });
}

/**
 * Two steps that cannot be made one: the password is saved through Auth, the membership through
 * a Postgres RPC, and no transaction spans them. So neither step may be a point of no return.
 * The password step is idempotent — re-submitting the password it already saved counts as done —
 * and the membership RPC is atomic in the database, leaving nothing behind when it fails. What
 * remains is to say which of the two got as far as it did, so that pressing accept again is
 * visibly the whole of what is left.
 *
 * Order is fixed by CLE-94 and cannot be swapped to make the failure cheaper: a membership
 * created before the password exists is a member who can use this one session and is locked out
 * of every one after it.
 */
export async function acceptEmployeeInvitationAction(
  _previous: EmployeeInvitationActionResult,
  formData: FormData,
): Promise<EmployeeInvitationActionResult> {
  const invitationId = employeeInvitationIdSchema.safeParse(
    String(formData.get("invitationId") ?? ""),
  );
  if (!invitationId.success) return failure(userMessage("employeeInvitationUnavailable"));

  const supabase = await createClient();
  let context: z.infer<typeof invitationContextSchema>;
  try {
    const { data, error } = await supabase.rpc("get_employee_invitation_context", {
      target_invitation_id: invitationId.data,
    });
    const result = invitationContextSchema.safeParse(data?.[0]);
    if (error || !result.success) {
      return failure(userMessage("employeeInvitationUnavailable"));
    }
    context = result.data;
  } catch {
    return failure(userMessage("employeeInvitationUnavailable"));
  }

  // Read before anything is written, so a submit against an invitation that has already lapsed
  // cannot change this account's password on its way to being refused.
  if (context.invitation_status === "accepted") {
    // The membership landed; only its answer went missing. This account already holds it, so
    // the invitee belongs in the company rather than in front of a refusal.
    return enterCompany(context.profile_locale ?? context.locale);
  }
  if (context.invitation_status !== "pending") {
    return failure(lapsedInvitationMessages[context.invitation_status]);
  }

  let fullName = context.profile_full_name;
  let targetLocale = context.profile_locale ?? context.locale;
  if (!context.account_existed_at_invitation) {
    const account = newEmployeeAccountSchema.safeParse({
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      locale: String(formData.get("locale") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (!account.success) {
      const errors = z.flattenError(account.error).fieldErrors;
      return failure(null, {
        confirmPassword: errors.confirmPassword?.[0],
        fullName: errors.fullName?.[0],
        locale: errors.locale?.[0],
        password: errors.password?.[0],
      });
    }
    fullName = account.data.fullName;
    targetLocale = account.data.locale;
    const { error } = await supabase.auth.updateUser({ password: account.data.password });
    // "Choose another password and try again" was the wall the invitee hit on every retry: the
    // password had been saved by the attempt whose membership step failed, so re-submitting it
    // came back as `same_password`, and the advice was to abandon the one password that worked.
    if (error && !isPasswordAlreadySet(error)) {
      return failure(userMessage("employeeInvitationPasswordRejected"), {
        password: userMessage("employeeInvitationPasswordRejected"),
      });
    }
  }

  // Whether the password step ran or was already satisfied, this account can sign in from here.
  const passwordSaved = !context.account_existed_at_invitation;

  try {
    const { data, error } = await supabase.rpc("accept_employee_invitation", {
      full_name: fullName,
      target_invitation_id: invitationId.data,
      target_locale: targetLocale,
    });
    if (error || !data) throw error ?? new Error("Employee membership was not created");
  } catch (cause) {
    // The RPC is one transaction, so a failure leaves no membership and no acceptance mark: the
    // invitation is still open and pressing accept again is the whole of what is left. Saying
    // "no longer available" claimed the opposite, and left the password it had just saved
    // unmentioned — the two facts that together made the page a dead end.
    console.error("Employee invitation acceptance did not complete", {
      invitationId: invitationId.data,
      passwordSaved,
      reason: cause,
    });
    return failure(userMessage(
      passwordSaved ? "employeeInvitationPasswordSaved" : "employeeInvitationNotCompleted",
    ));
  }

  return enterCompany(targetLocale);
}
