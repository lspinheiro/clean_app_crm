import { z } from "zod";

import type { AppLocale } from "@/i18n/config";
import { cleanerTranslator } from "@/i18n/messages";

function requiredText(message: string) {
  return z.string().trim().min(1, message);
}

function countDigits(value: string) {
  return (value.match(/\d/g) ?? []).length;
}

export type JoinValidationKey =
  | "validationEmail"
  | "validationFullName"
  | "validationPassword"
  | "validationPhone"
  | "validationPhoneDigits"
  | "validationSuburb";

type ValidationMessages = Record<JoinValidationKey, string>;

function cleanerDetailsSchemaWith(messages: ValidationMessages) {
  return z.object({
    fullName: requiredText(messages.validationFullName),
    // People write phone numbers with spaces, brackets, and country codes. Count digits
    // instead of imposing a format they would have to fight.
    phone: requiredText(messages.validationPhone).refine(
      (value) => countDigits(value) >= 8,
      messages.validationPhoneDigits,
    ),
    suburb: requiredText(messages.validationSuburb),
  });
}

function validationMessages(locale: AppLocale): ValidationMessages {
  const t = cleanerTranslator(locale);
  return {
    validationEmail: t("Join.validationEmail"),
    validationFullName: t("Join.validationFullName"),
    validationPassword: t("Join.validationPassword"),
    validationPhone: t("Join.validationPhone"),
    validationPhoneDigits: t("Join.validationPhoneDigits"),
    validationSuburb: t("Join.validationSuburb"),
  };
}

const validationKeys: ValidationMessages = {
  validationEmail: "validationEmail",
  validationFullName: "validationFullName",
  validationPassword: "validationPassword",
  validationPhone: "validationPhone",
  validationPhoneDigits: "validationPhoneDigits",
  validationSuburb: "validationSuburb",
};

export function createCleanerDetailsSchema(locale: AppLocale = "en-AU") {
  return cleanerDetailsSchemaWith(validationMessages(locale));
}

export function createRegistrationSchema(locale: AppLocale = "en-AU") {
  const messages = validationMessages(locale);
  return cleanerDetailsSchemaWith(messages).extend({
    email: z.email(messages.validationEmail),
    password: z.string().min(8, messages.validationPassword),
  });
}

export const cleanerDetailsKeySchema = cleanerDetailsSchemaWith(validationKeys);
export const registrationKeySchema = cleanerDetailsKeySchema.extend({
  email: z.email(validationKeys.validationEmail),
  password: z.string().min(8, validationKeys.validationPassword),
});

export const cleanerDetailsSchema = createCleanerDetailsSchema();
export const registrationSchema = createRegistrationSchema();

export type Registration = z.infer<typeof registrationSchema>;
