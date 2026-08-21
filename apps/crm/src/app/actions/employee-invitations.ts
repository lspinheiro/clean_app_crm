"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  employeeInvitationIdSchema,
  employeeInvitationInputSchema,
  newEmployeeAccountSchema,
} from "@/features/employee-invitations/schema";
import type { EmployeeInvitationActionResult } from "@/features/employee-invitations/state";
import { normaliseCleanerAppUrl } from "@/features/pool/invite";
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
  account_existed: z.boolean(),
  invitation_expires_at: z.iso.datetime({ offset: true }),
  invitation_id: z.uuid(),
});

const invitationContextSchema = z.object({
  account_existed_at_invitation: z.boolean(),
  invitation_status: z.literal("pending"),
  locale: z.enum(["en-AU", "pt-BR"]),
  profile_full_name: z.string(),
  profile_locale: z.enum(["en-AU", "pt-BR"]).nullable(),
});

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

function confirmationUrl(appUrl: string, locale: "en-AU" | "pt-BR", invitationId: string) {
  const url = new URL(`/${locale}/auth/confirm`, normaliseCleanerAppUrl(appUrl));
  url.searchParams.set("employeeInvitation", invitationId);
  return url.toString();
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
      if (outcomes[0]?.status !== "accepted") throw new Error("Delivery rejected");
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
      if (error || !data.user) throw new Error("Delivery rejected");
    }
  } catch {
    await revokeFailedDelivery(supabase, company.id, prepared.invitation_id);
    return failure(userMessage("employeeInvitationDeliveryFailed"));
  }

  revalidateLocalizedPath("/settings");
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
    if (error) return failure(userMessage("employeeInvitationPasswordRejected"), {
      password: userMessage("employeeInvitationPasswordRejected"),
    });
  }

  try {
    const { data, error } = await supabase.rpc("accept_employee_invitation", {
      full_name: fullName,
      target_invitation_id: invitationId.data,
      target_locale: targetLocale,
    });
    if (error || !data) return failure(userMessage("employeeInvitationUnavailable"));
  } catch {
    return failure(userMessage("employeeInvitationUnavailable"));
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, targetLocale, {
    maxAge: localeCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
  });
  return redirect({ href: "/roster", locale: targetLocale });
}
