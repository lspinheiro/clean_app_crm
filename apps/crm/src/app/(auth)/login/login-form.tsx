"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { signInAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const t = useTranslations("Auth");
  const [state, action, pending] = useActionState(signInAction, initialState);

  return (
    <form action={action} className="auth-form form-stack" noValidate>
      <div className="field">
        <label htmlFor="email">{t("email")}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">{t("password")}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
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
