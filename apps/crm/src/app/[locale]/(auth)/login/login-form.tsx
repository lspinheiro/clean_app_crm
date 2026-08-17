"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { signInAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = { error: null, fieldErrors: {} };

export function LoginForm() {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState(signInAction, initialState);

  return (
    <form action={action} className="auth-form form-stack" noValidate>
      <div className="field">
        <label htmlFor="email">{t("email")}</label>
        <input
          aria-describedby={state.fieldErrors.email ? "email-error" : undefined}
          aria-invalid={state.fieldErrors.email ? true : undefined}
          autoComplete="email"
          id="email"
          name="email"
          required
          type="email"
        />
        {state.fieldErrors.email ? (
          <p className="field-error" id="email-error">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="password">{t("password")}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-describedby={state.fieldErrors.password ? "password-error" : undefined}
          aria-invalid={state.fieldErrors.password ? true : undefined}
          required
        />
        {state.fieldErrors.password ? (
          <p className="field-error" id="password-error">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
