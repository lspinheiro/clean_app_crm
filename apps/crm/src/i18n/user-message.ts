import enAu from "../../messages/en-AU.json";
import ptBr from "../../messages/pt-BR.json";

import type { AppLocale } from "./config";

type UserMessageKey = keyof typeof enAu.UserMessages;
type UserMessageCode = `user.${UserMessageKey}`;

const catalogues = {
  "en-AU": enAu.UserMessages,
  "pt-BR": ptBr.UserMessages,
} as const;

export function userMessage(key: UserMessageKey): UserMessageCode {
  return `user.${key}`;
}

export function localiseUserMessage(
  message: string | null | undefined,
  locale: AppLocale,
) {
  if (!message) return message;
  if (!message.startsWith("user.")) return catalogues[locale].generic;
  const key = message.slice(5);
  const catalogue = catalogues[locale] as Record<string, string>;
  return Object.hasOwn(catalogue, key) ? catalogue[key] : catalogue.generic;
}

export function localiseFieldErrors(
  fieldErrors: Record<string, string | undefined>,
  locale: AppLocale,
) {
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, message]) => [
      field,
      localiseUserMessage(message, locale),
    ]),
  );
}

export function localiseMutationResult<
  TResult extends {
    fieldErrors: Record<string, string>;
    formError: string | null;
  },
>(result: TResult, locale: AppLocale) {
  return {
    ...result,
    fieldErrors: localiseFieldErrors(result.fieldErrors, locale),
    formError: localiseUserMessage(result.formError, locale) ?? null,
  };
}
