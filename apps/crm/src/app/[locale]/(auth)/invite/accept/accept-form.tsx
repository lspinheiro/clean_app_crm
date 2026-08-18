"use client";

import {
  useActionState,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";

import {
  acceptFirstAdminAction,
} from "@/app/actions/first-admin";
import {
  initialFirstAdminState,
  type FirstAdminState,
} from "@/features/first-admin/state";
import type { AppLocale } from "@/i18n/config";

type FirstAdminAcceptanceFormProps = {
  defaultLocale: AppLocale;
  inviteeEmail: string;
};

type FieldErrorProps = {
  id: string;
  message: string | undefined;
};

type AcceptanceFormValues = {
  abn: string;
  companyName: string;
  confirmPassword: string;
  fullName: string;
  locale: string;
  password: string;
  phone: string;
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
  const [state, action, actionPending] = useActionState<FirstAdminState, FormData>(
    acceptFirstAdminAction,
    initialFirstAdminState,
  );
  const [transitionPending, startTransition] = useTransition();
  const [values, setValues] = useState<AcceptanceFormValues>({
    abn: "",
    companyName: "",
    confirmPassword: "",
    fullName: "",
    locale: defaultLocale,
    password: "",
    phone: "",
  });

  function updateValue(
    field: keyof AcceptanceFormValues,
  ) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setValues((current) => ({ ...current, [field]: value }));
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form
      className="auth-form form-stack"
      noValidate
      onSubmit={submit}
    >
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
          onChange={updateValue("fullName")}
          required
          type="text"
          value={values.fullName}
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
          onChange={updateValue("companyName")}
          required
          type="text"
          value={values.companyName}
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
          onChange={updateValue("abn")}
          required
          type="text"
          value={values.abn}
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
          onChange={updateValue("phone")}
          required
          type="tel"
          value={values.phone}
        />
        <FieldError id="first-admin-phone-error" message={state.fieldErrors.phone} />
      </div>

      <div className="field">
        <label htmlFor="first-admin-locale">{t("language")}</label>
        <select
          aria-describedby={state.fieldErrors.locale ? "first-admin-locale-error" : undefined}
          aria-invalid={state.fieldErrors.locale ? true : undefined}
          id="first-admin-locale"
          name="locale"
          onChange={updateValue("locale")}
          value={values.locale}
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
          onChange={updateValue("password")}
          required
          type="password"
          value={values.password}
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
          onChange={updateValue("confirmPassword")}
          required
          type="password"
          value={values.confirmPassword}
        />
        <FieldError
          id="first-admin-confirm-password-error"
          message={state.fieldErrors.confirmPassword}
        />
      </div>

      {state.formError ? <p className="form-error" role="alert">{state.formError}</p> : null}

      <button className="button" disabled={actionPending || transitionPending} type="submit">
        {actionPending || transitionPending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
