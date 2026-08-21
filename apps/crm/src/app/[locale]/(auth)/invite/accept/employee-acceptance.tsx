"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { acceptEmployeeInvitationAction } from "@/app/actions/employee-invitations";
import { initialEmployeeInvitationState } from "@/features/employee-invitations/state";
import type { AppLocale } from "@/i18n/config";
import { localiseUserMessage } from "@/i18n/user-message";

type EmployeeAcceptanceProps = {
  accountExisted: boolean;
  companyName: string;
  defaultLocale: AppLocale;
  invitationId: string;
  inviteeEmail: string;
  role: "owner" | "staff";
};

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? <p className="field-error" id={id}>{message}</p> : null;
}

export function EmployeeAcceptance({
  accountExisted,
  companyName,
  defaultLocale,
  invitationId,
  inviteeEmail,
  role,
}: EmployeeAcceptanceProps) {
  const t = useTranslations("EmployeeInvitationAcceptance");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    acceptEmployeeInvitationAction,
    initialEmployeeInvitationState,
  );
  const errors = state.ok === false ? {
    confirmPassword: localiseUserMessage(state.fieldErrors.confirmPassword, locale) ?? undefined,
    fullName: localiseUserMessage(state.fieldErrors.fullName, locale) ?? undefined,
    password: localiseUserMessage(state.fieldErrors.password, locale) ?? undefined,
  } : {};
  const formError = state.ok === false
    ? localiseUserMessage(state.formError, locale)
    : null;

  return (
    <>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title", { companyName })}</h1>
      <p className="auth-panel__intro">{t("intro", { role: t(role) })}</p>
      <dl className="employee-invitation-summary">
        <div><dt>{t("email")}</dt><dd>{inviteeEmail}</dd></div>
        <div><dt>{t("role")}</dt><dd>{t(role)}</dd></div>
      </dl>
      <form action={action} className="auth-form form-stack" noValidate>
        <input name="invitationId" type="hidden" value={invitationId} />
        {!accountExisted ? (
          <>
            <div className="field">
              <label htmlFor="employee-full-name">{t("fullName")}</label>
              <input
                aria-describedby={errors.fullName ? "employee-full-name-error" : undefined}
                aria-invalid={Boolean(errors.fullName)}
                autoComplete="name"
                id="employee-full-name"
                name="fullName"
                required
                type="text"
              />
              <FieldError id="employee-full-name-error" message={errors.fullName} />
            </div>
            <div className="field">
              <label htmlFor="employee-locale">{t("language")}</label>
              <select defaultValue={defaultLocale} id="employee-locale" name="locale">
                <option value="en-AU">English (Australia)</option>
                <option value="pt-BR">Português (Brasil)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="employee-password">{t("password")}</label>
              <input
                aria-describedby={errors.password ? "employee-password-error" : "employee-password-hint"}
                aria-invalid={Boolean(errors.password)}
                autoComplete="new-password"
                id="employee-password"
                name="password"
                required
                type="password"
              />
              <p className="field-hint" id="employee-password-hint">{t("passwordHint")}</p>
              <FieldError id="employee-password-error" message={errors.password} />
            </div>
            <div className="field">
              <label htmlFor="employee-confirm-password">{t("confirmPassword")}</label>
              <input
                aria-describedby={errors.confirmPassword ? "employee-confirm-password-error" : undefined}
                aria-invalid={Boolean(errors.confirmPassword)}
                autoComplete="new-password"
                id="employee-confirm-password"
                name="confirmPassword"
                required
                type="password"
              />
              <FieldError id="employee-confirm-password-error" message={errors.confirmPassword} />
            </div>
          </>
        ) : null}
        {formError ? (
          <p className="form-error" role="alert">{formError}</p>
        ) : null}
        <button className="button" disabled={pending} type="submit">
          {pending ? t("accepting") : t("accept")}
        </button>
      </form>
    </>
  );
}
