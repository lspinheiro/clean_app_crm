import { z } from "zod";

import { companyIdentitySchema } from "@/features/company-identity/schema";

const companyCreationSchema = z.object({
  companyName: companyIdentitySchema.shape.name,
  abn: companyIdentitySchema.shape.abn,
});

export type CompanyCreationInput = z.input<typeof companyCreationSchema>;
export type CompanyCreation = z.output<typeof companyCreationSchema>;
export type CompanyCreationFieldErrors = Partial<
  Record<keyof CompanyCreationInput, string>
>;

export function parseCompanyCreation(input: CompanyCreationInput) {
  const result = companyCreationSchema.safeParse(input);
  if (result.success) {
    return { data: result.data, fieldErrors: {} } as const;
  }

  const flattened = z.flattenError(result.error).fieldErrors;
  return {
    data: null,
    fieldErrors: {
      abn: flattened.abn?.[0],
      companyName: flattened.companyName?.[0],
    },
  } as const;
}
