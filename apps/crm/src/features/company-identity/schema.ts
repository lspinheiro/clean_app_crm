import { z } from "zod";

export const companyIdentitySchema = z.object({
  name: z.string().trim().min(1, "Enter a company name.").max(120, "Use 120 characters or fewer."),
  abn: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{11}$/, "Enter exactly 11 digits.")),
});

export type CompanyIdentityInput = z.input<typeof companyIdentitySchema>;
export type CompanyIdentity = z.output<typeof companyIdentitySchema>;

export type CompanyIdentityFieldErrors = Partial<Record<keyof CompanyIdentityInput | "logo", string>>;

export function parseCompanyIdentity(input: CompanyIdentityInput) {
  const result = companyIdentitySchema.safeParse(input);
  if (result.success) return { data: result.data, fieldErrors: {} } as const;

  const flattened = z.flattenError(result.error).fieldErrors;
  return {
    data: null,
    fieldErrors: {
      name: flattened.name?.[0],
      abn: flattened.abn?.[0],
    },
  } as const;
}
