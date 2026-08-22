import { createTranslator } from "next-intl";

import enAu from "../../messages/en-AU.json";
import ptBr from "../../messages/pt-BR.json";

import type { AppLocale } from "./config";

export const messagesByLocale = {
  "en-AU": enAu,
  "pt-BR": ptBr,
} as const;

export function cleanerTranslator(locale: AppLocale) {
  return createTranslator({ locale, messages: messagesByLocale[locale] });
}
