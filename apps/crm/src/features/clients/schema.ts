import { z } from "zod";

const optionalText = (maximum: number, message: string) =>
  z
    .string()
    .trim()
    .max(maximum, message)
    .transform((value) => value || null);

export const createClientSchema = z.object({
  name: z.string().trim().min(1, "Enter a client name.").max(120, "Use 120 characters or fewer."),
  contactName: optionalText(120, "Use 120 characters or fewer."),
  phone: optionalText(40, "Use 40 characters or fewer."),
  notes: optionalText(2_000, "Use 2,000 characters or fewer."),
});

export const createSiteSchema = z.object({
  clientId: z.string().uuid("Choose a valid client."),
  name: z.string().trim().min(1, "Enter a site name.").max(120, "Use 120 characters or fewer."),
  address: z.string().trim().min(1, "Enter a street address.").max(240, "Use 240 characters or fewer."),
  suburb: z.string().trim().min(1, "Enter a suburb.").max(120, "Use 120 characters or fewer."),
  accessNotes: optionalText(2_000, "Use 2,000 characters or fewer."),
});

export function firstFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}
