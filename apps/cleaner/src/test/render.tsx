import { render, type RenderOptions } from "@testing-library/react";

import enAu from "../../messages/en-AU.json";
import ptBr from "../../messages/pt-BR.json";

import type { AppLocale } from "@/i18n/config";
import { CleanerIntlProvider } from "@/i18n/provider";

export const cleanerTestMessages = { "en-AU": enAu, "pt-BR": ptBr } as const;

export function renderWithCleanerIntl(
  ui: React.ReactNode,
  options: RenderOptions & { locale?: AppLocale } = {},
) {
  const { locale = "en-AU", ...renderOptions } = options;
  document.documentElement.lang = locale;
  return render(
    <CleanerIntlProvider
      initialLocale={locale}
      initialMessages={cleanerTestMessages[locale]}
    >
      {ui}
    </CleanerIntlProvider>,
    renderOptions,
  );
}
