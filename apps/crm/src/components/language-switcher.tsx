"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { setPreferredLocaleAction } from "@/app/actions/locale";
import {
  isAppLocale,
  explicitLocaleCookieName,
  languageSelectionEnabled,
  localeCookieMaxAgeSeconds,
  locales,
  type AppLocale,
} from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";

import { DocumentLocale } from "./document-locale";

type LanguageSwitcherProps = {
  authenticated?: boolean;
  currentLocale: AppLocale;
};

type PreservedField = {
  checked?: boolean;
  name: string;
  value: string;
};

let pendingFields: PreservedField[] | null = null;

function preserveEnteredFields() {
  pendingFields = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input[name], select[name], textarea[name]",
    ),
  ).flatMap((field) => {
    if (field instanceof HTMLInputElement && field.type === "file") return [];
    return [{
      checked:
        field instanceof HTMLInputElement &&
        (field.type === "checkbox" || field.type === "radio")
          ? field.checked
          : undefined,
      name: field.name,
      value: field.value,
    }];
  });
}

function restoreEnteredFields() {
  const fields = pendingFields;
  pendingFields = null;
  if (!fields) return;

  for (const preserved of fields) {
    const candidates = document.getElementsByName(preserved.name);
    const field = Array.from(candidates).find(
      (candidate): candidate is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
        candidate instanceof HTMLInputElement ||
        candidate instanceof HTMLSelectElement ||
        candidate instanceof HTMLTextAreaElement,
    );
    if (!field) continue;
    field.value = preserved.value;
    if (field instanceof HTMLInputElement && preserved.checked !== undefined) {
      field.checked = preserved.checked;
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export function LanguageSwitcher({
  authenticated = false,
  currentLocale,
}: LanguageSwitcherProps) {
  const t = useTranslations("LocaleSwitcher");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedLocale, setSelectedLocale] = useState(currentLocale);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    restoreEnteredFields();
  }, []);

  if (!languageSelectionEnabled) return null;

  function changeLocale(nextValue: string) {
    if (!isAppLocale(nextValue) || nextValue === selectedLocale) return;
    const previousLocale = selectedLocale;
    setSelectedLocale(nextValue);
    setError(false);

    startTransition(async () => {
      if (authenticated) {
        const result = await setPreferredLocaleAction(nextValue);
        if (!result.ok) {
          setSelectedLocale(previousLocale);
          setError(true);
          return;
        }
      } else {
        document.cookie = `${explicitLocaleCookieName}=${nextValue}; Path=/; Max-Age=${localeCookieMaxAgeSeconds}; SameSite=Lax`;
      }

      const query = searchParams.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      preserveEnteredFields();
      document.documentElement.lang = nextValue;
      router.replace(href, { locale: nextValue });
    });
  }

  return (
    <>
      <DocumentLocale locale={currentLocale} />
      <div className="language-control">
        <label htmlFor={`language-${authenticated ? "settings" : "login"}`}>{t("label")}</label>
        <select
          aria-describedby={error ? "language-error" : undefined}
          disabled={pending}
          id={`language-${authenticated ? "settings" : "login"}`}
          onChange={(event) => changeLocale(event.target.value)}
          value={selectedLocale}
        >
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {t(locale)}
            </option>
          ))}
        </select>
        {pending ? <span className="field-hint">{t("updating")}</span> : null}
        {error ? (
          <span className="field-error" id="language-error" role="alert">
            {t("error")}
          </span>
        ) : null}
      </div>
    </>
  );
}
