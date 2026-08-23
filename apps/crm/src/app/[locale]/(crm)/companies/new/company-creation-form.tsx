"use client";

import { AlertCircle, ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { createCompanyAction } from "@/app/actions/company-creation";
import { initialCompanyCreationState } from "@/features/company-creation/state";
import { Link } from "@/i18n/navigation";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="field-error" id={id} role="alert">
      {message}
    </p>
  ) : null;
}

export function CompanyCreationForm({
  activeCompanyName,
}: {
  activeCompanyName: string;
}) {
  const t = useTranslations("CompanyCreation");
  const [state, action, pending] = useActionState(
    createCompanyAction,
    initialCompanyCreationState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const firstInvalidField = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    const formError = formRef.current?.querySelector<HTMLElement>(
      ".company-creation-form__error",
    );
    (firstInvalidField ?? formError)?.focus();
  }, [state]);

  return (
    <>
      <Link className="back-link" href="/roster">
        <ArrowLeft aria-hidden="true" size={18} />
        {t("backToCompany", { companyName: activeCompanyName })}
      </Link>
      <header className="company-creation-header">
        <h1 className="page-heading">{t("title")}</h1>
        <p className="page-description">{t("description")}</p>
      </header>
      <form action={action} className="company-creation-form" noValidate ref={formRef}>
        <div className="company-creation-form__fields">
          <div className="field">
            <label htmlFor="company-creation-name">{t("companyName")}</label>
            <input
              aria-describedby={
                state.fieldErrors.companyName ? "company-creation-name-error" : undefined
              }
              aria-invalid={Boolean(state.fieldErrors.companyName)}
              autoComplete="organization"
              defaultValue={state.values.companyName}
              id="company-creation-name"
              maxLength={120}
              name="companyName"
              placeholder={t("companyNamePlaceholder")}
              required
              type="text"
            />
            <FieldError
              id="company-creation-name-error"
              message={state.fieldErrors.companyName}
            />
          </div>
          <div className="field">
            <label htmlFor="company-creation-abn">{t("abn")}</label>
            <input
              aria-describedby={
                state.fieldErrors.abn
                  ? "company-creation-abn-hint company-creation-abn-error"
                  : "company-creation-abn-hint"
              }
              aria-invalid={Boolean(state.fieldErrors.abn)}
              autoComplete="off"
              defaultValue={state.values.abn}
              id="company-creation-abn"
              inputMode="numeric"
              name="abn"
              required
              type="text"
            />
            <p className="field-hint" id="company-creation-abn-hint">
              {t("abnHint")}
            </p>
            <FieldError id="company-creation-abn-error" message={state.fieldErrors.abn} />
          </div>
        </div>

        <section aria-labelledby="company-creation-owner-title" className="company-creation-owner">
          <span className="company-creation-owner__icon">
            <ShieldCheck aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 id="company-creation-owner-title">{t("ownerTitle")}</h2>
            <p>{t("ownerDescription")}</p>
          </div>
        </section>

        <p className="company-creation-form__later">
          <Building2 aria-hidden="true" size={18} />
          <span>{t("logoLater")}</span>
        </p>

        {state.formError ? (
          <p
            className="form-error company-creation-form__error"
            role="alert"
            tabIndex={-1}
          >
            <AlertCircle aria-hidden="true" size={18} />
            <span>{state.formError}</span>
          </p>
        ) : null}

        <div className="company-creation-form__actions">
          <Link className="button button--secondary" href="/roster">
            {t("cancel")}
          </Link>
          <button className="button" disabled={pending} type="submit">
            {pending ? t("creating") : t("create")}
          </button>
        </div>
      </form>
    </>
  );
}
