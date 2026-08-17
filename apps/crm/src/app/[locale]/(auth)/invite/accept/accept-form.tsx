"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  acceptFirstAdminAction,
  initialFirstAdminState,
  type FirstAdminState,
} from "@/app/actions/first-admin";
import type { AppLocale } from "@/i18n/config";

type FirstAdminAcceptanceFormProps = {
  defaultLocale: AppLocale;
  inviteeEmail: string;
};

type FieldErrorProps = {
  id: string;
  message: string | undefined;
};

function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return <p className="field-error" id={id}>{message}</p>;
}

export function FirstAdminAcceptanceForm({
  defaultLocale,
  inviteeEmail,
}: FirstAdminAcceptanceFormProps) {
  const t = useTranslations("FirstAdminInvitation");
  const [state, action, pending] = useActionState<FirstAdminState, FormData>(
    acceptFirstAdminAction,
    initialFirstAdminState,
  );

  return (
    <form action={action} className="auth-form form-stack" noValidate>
      <div className="field">
        <span className="field-label">{t("invitedEmail")}</span>
        <p className="invited-email">{inviteeEmail}</p>
      </div>

      <div className="field">
        <label htmlFor="first-admin-full-name">{t("fullName")}</label>
        <input
          aria-describedby={state.fieldErrors.fullName ? "first-admin-full-name-error" : undefined}
          aria-invalid={state.fieldErrors.fullName ? true : undefined}
          autoComplete="name"
          id="first-admin-full-name"
          name="fullName"
          required
          type="text"
        />
        <FieldError id="first-admin-full-name-error" message={state.fieldErrors.fullName} />
      </div>

      <div className="field">
        <label htmlFor="first-admin-company-name">{t("companyName")}</label>
        <input
          aria-describedby={state.fieldErrors.companyName ? "first-admin-company-name-error" : undefined}
          aria-invalid={state.fieldErrors.companyName ? true : undefined}
          autoComplete="organization"
          id="first-admin-company-name"
          name="companyName"
          required
          type="text"
        />
        <FieldError id="first-admin-company-name-error" message={state.fieldErrors.companyName} />
      </div>

      <div className="field">
        <label htmlFor="first-admin-abn">{t("abn")}</label>
        <input
          aria-describedby={state.fieldErrors.abn ? "first-admin-abn-error" : "first-admin-abn-hint"}
          aria-invalid={state.fieldErrors.abn ? true : undefined}
          id="first-admin-abn"
          inputMode="numeric"
          name="abn"
          required
          type="text"
        />
        <p className="field-hint" id="first-admin-abn-hint">{t("abnHint")}</p>
        <FieldError id="first-admin-abn-error" message={state.fieldErrors.abn} />
      </div>

      <div className="field">
        <label htmlFor="first-admin-phone">{t("phone")}</label>
        <input
          aria-describedby={state.fieldErrors.phone ? "first-admin-phone-error" : undefined}
          aria-invalid={state.fieldErrors.phone ? true : undefined}
          autoComplete="tel"
          id="first-admin-phone"
          name="phone"
          required
          type="tel"
        />
        <FieldError id="first-admin-phone-error" message={state.fieldErrors.phone} />
      </div>

      <div className="field">
        <label htmlFor="first-admin-locale">{t("language")}</label>
        <select
          aria-describedby={state.fieldErrors.locale ? "first-admin-locale-error" : undefined}
          aria-invalid={state.fieldErrors.locale ? true : undefined}
          defaultValue={defaultLocale}
          id="first-admin-locale"
          name="locale"
        >
          <option value="en-AU">{t("english")}</option>
          <option value="pt-BR">{t("portuguese")}</option>
        </select>
        <FieldError id="first-admin-locale-error" message={state.fieldErrors.locale} />
      </div>

      <div className="field">
        <label htmlFor="first-admin-password">{t("password")}</label>
        <input
          aria-describedby={state.fieldErrors.password ? "first-admin-password-error" : "first-admin-password-hint"}
          aria-invalid={state.fieldErrors.password ? true : undefined}
          autoComplete="new-password"
          id="first-admin-password"
          name="password"
          required
          type="password"
        />
        <p className="field-hint" id="first-admin-password-hint">{t("passwordHint")}</p>
        <FieldError id="first-admin-password-error" message={state.fieldErrors.password} />
      </div>

      <div className="field">
        <label htmlFor="first-admin-confirm-password">{t("confirmPassword")}</label>
        <input
          aria-describedby={state.fieldErrors.confirmPassword ? "first-admin-confirm-password-error" : undefined}
          aria-invalid={state.fieldErrors.confirmPassword ? true : undefined}
          autoComplete="new-password"
          id="first-admin-confirm-password"
          name="confirmPassword"
          required
          type="password"
        />
        <FieldError
          id="first-admin-confirm-password-error"
          message={state.fieldErrors.confirmPassword}
        />
      </div>

      {state.formError ? <p className="form-error" role="alert">{state.formError}</p> : null}

      <button className="button" disabled={pending} type="submit">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
