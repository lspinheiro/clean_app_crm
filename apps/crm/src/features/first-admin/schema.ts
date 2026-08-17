import { z } from "zod";

import { locales } from "@/i18n/config";
import { userMessage } from "@/i18n/user-message";

export const firstAdminAcceptanceSchema = z
  .object({
    abn: z
      .string()
      .transform((value) => value.replace(/\s/g, ""))
      .pipe(z.string().regex(/^\d{11}$/, userMessage("digits11"))),
    companyName: z
      .string()
      .trim()
      .min(1, userMessage("enterCompanyName"))
      .max(120, userMessage("max120")),
    confirmPassword: z.string().min(1, userMessage("confirmPasswordRequired")),
    fullName: z
      .string()
      .trim()
      .min(1, userMessage("fullNameRequired"))
      .max(120, userMessage("max120")),
    locale: z
      .string()
      .pipe(z.enum(locales, { error: userMessage("supportedLanguageRequired") })),
    password: z
      .string()
      .min(8, userMessage("passwordMin8"))
      .max(72, userMessage("passwordMax72")),
    phone: z
      .string()
      .trim()
      .min(1, userMessage("contactPhoneRequired"))
      .max(40, userMessage("max40")),
  })
  .superRefine((value, context) => {
    if (value.password === value.confirmPassword) return;
    context.addIssue({
      code: "custom",
      message: userMessage("passwordsMustMatch"),
      path: ["confirmPassword"],
    });
  });

export type FirstAdminAcceptanceInput = z.input<typeof firstAdminAcceptanceSchema>;
export type FirstAdminAcceptance = z.output<typeof firstAdminAcceptanceSchema>;
export type FirstAdminAcceptanceFieldErrors = Partial<
  Record<keyof FirstAdminAcceptanceInput, string>
>;

export function parseFirstAdminAcceptance(input: FirstAdminAcceptanceInput) {
  const result = firstAdminAcceptanceSchema.safeParse(input);
  if (result.success) return { data: result.data, fieldErrors: {} } as const;

  const flattened = z.flattenError(result.error).fieldErrors;
  return {
    data: null,
    fieldErrors: {
      abn: flattened.abn?.[0],
      companyName: flattened.companyName?.[0],
      confirmPassword: flattened.confirmPassword?.[0],
      fullName: flattened.fullName?.[0],
      locale: flattened.locale?.[0],
      password: flattened.password?.[0],
      phone: flattened.phone?.[0],
    },
  } as const;
}
