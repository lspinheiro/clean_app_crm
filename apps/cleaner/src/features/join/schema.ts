import { z } from "zod";

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
  | "validationSuburb"
  | "validationNote";

const joinValidationKeys: readonly JoinValidationKey[] = [
  "validationEmail",
  "validationFullName",
  "validationPassword",
  "validationPhone",
  "validationPhoneDigits",
  "validationSuburb",
  "validationNote",
];

export function isJoinValidationKey(value: string | undefined): value is JoinValidationKey {
  return joinValidationKeys.some((key) => key === value);
}

type ValidationMessages = Record<JoinValidationKey, JoinValidationKey>;

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

const validationKeys: ValidationMessages = {
  validationEmail: "validationEmail",
  validationFullName: "validationFullName",
  validationPassword: "validationPassword",
  validationPhone: "validationPhone",
  validationPhoneDigits: "validationPhoneDigits",
  validationSuburb: "validationSuburb",
  validationNote: "validationNote",
};

export const cleanerDetailsKeySchema = cleanerDetailsSchemaWith(validationKeys);
const noteSchema = z.string().trim().max(1000, validationKeys.validationNote).default("");

export const applicationKeySchema = cleanerDetailsKeySchema.extend({ note: noteSchema });
export const registrationKeySchema = applicationKeySchema.extend({
  email: z.email(validationKeys.validationEmail),
  password: z.string().min(8, validationKeys.validationPassword),
});

export type Registration = z.infer<typeof registrationKeySchema>;
