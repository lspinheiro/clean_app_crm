"use client";

import { useTranslations } from "next-intl";

import { locales, type AppLocale } from "@/i18n/config";
import { useCleanerLocale } from "@/i18n/provider";

type LanguageSwitcherProps = {
  authenticated?: boolean;
  compact?: boolean;
  disabled?: boolean;
};

export function LanguageSwitcher({
  authenticated = false,
  compact = false,
  disabled = false,
}: LanguageSwitcherProps) {
  const t = useTranslations("LocaleSwitcher");
  const { locale, pending, error, changeLocale } = useCleanerLocale();

  return (
    <div className={compact ? "language-control language-control--compact" : "language-control"}>
      <label htmlFor={`cleaner-language-${authenticated ? "account" : "public"}`}>
        {t("label")}
      </label>
      <select
        aria-describedby={error ? "cleaner-language-error" : undefined}
        disabled={pending || disabled}
        id={`cleaner-language-${authenticated ? "account" : "public"}`}
        onChange={(event) => void changeLocale(event.target.value as AppLocale, authenticated)}
        value={locale}
      >
        {locales.map((option) => (
          <option key={option} value={option}>
            {t(option)}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="visually-hidden" role="status">
          {t("updating")}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id="cleaner-language-error" role="alert">
          {t("error")}
        </span>
      ) : null}
    </div>
  );
}
