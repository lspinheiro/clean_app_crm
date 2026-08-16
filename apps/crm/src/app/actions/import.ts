"use server";

import { createClient, createSite } from "@/app/actions/clients";
import {
  createClientSchema,
  createSiteSchema,
  firstFieldErrors,
} from "@/features/clients/schema";

export type ImportRowActionResult = {
  ok: boolean;
  fieldErrors: Record<string, string>;
  formError: string | null;
};

export async function importClientRow(
  input: unknown,
): Promise<ImportRowActionResult> {
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: firstFieldErrors(parsed.error),
      formError: null,
    };
  }

  const formData = new FormData();
  formData.set("name", parsed.data.name);
  formData.set("contactName", parsed.data.contactName ?? "");
  formData.set("phone", parsed.data.phone ?? "");
  formData.set("notes", parsed.data.notes ?? "");
  return createClient(formData);
}

export async function importSiteRow(
  input: unknown,
): Promise<ImportRowActionResult> {
  const parsed = createSiteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: firstFieldErrors(parsed.error),
      formError: null,
    };
  }

  const formData = new FormData();
  formData.set("clientId", parsed.data.clientId);
  formData.set("name", parsed.data.name);
  formData.set("address", parsed.data.address);
  formData.set("suburb", parsed.data.suburb);
  formData.set("accessNotes", parsed.data.accessNotes ?? "");
  return createSite(formData);
}
