"use server";

import { revalidatePath } from "next/cache";

import {
  createClientSchema,
  createSiteSchema,
  firstFieldErrors,
} from "@/features/clients/schema";
import {
  updateClientSchema,
  updateSiteSchema,
} from "@/features/site-defaults/schema";
import { preferredCleanerOrderSchema } from "@/features/preferred-cleaners/schema";
import { requireCompanyAdmin } from "@/lib/auth/session";

export type RecordMutationResult = {
  ok: boolean;
  fieldErrors: Record<string, string>;
  formError: string | null;
};

export async function createClient(formData: FormData): Promise<RecordMutationResult> {
  const parsed = createClientSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstFieldErrors(parsed.error), formError: null };
  }

  const { company, supabase } = await requireCompanyAdmin();
  const { error } = await supabase.rpc("create_client", {
    target_company_id: company.id,
    client_name: parsed.data.name,
    client_contact_name: parsed.data.contactName,
    client_phone: parsed.data.phone,
    client_notes: parsed.data.notes,
  });
  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "The client could not be created. Please try again.",
    };
  }

  revalidatePath("/clients");
  return { ok: true, fieldErrors: {}, formError: null };
}

export async function createSite(formData: FormData): Promise<RecordMutationResult> {
  const parsed = createSiteSchema.safeParse({
    clientId: String(formData.get("clientId") ?? ""),
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    suburb: String(formData.get("suburb") ?? ""),
    accessNotes: String(formData.get("accessNotes") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstFieldErrors(parsed.error), formError: null };
  }

  const { supabase } = await requireCompanyAdmin();
  const { error } = await supabase.rpc("create_site", {
    target_client_id: parsed.data.clientId,
    site_name: parsed.data.name,
    site_address: parsed.data.address,
    site_suburb: parsed.data.suburb,
    site_access_notes: parsed.data.accessNotes,
  });
  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "The site could not be created. Please try again.",
    };
  }

  revalidatePath("/clients");
  return { ok: true, fieldErrors: {}, formError: null };
}

export async function updateClient(formData: FormData): Promise<RecordMutationResult> {
  const parsed = updateClientSchema.safeParse({
    clientId: String(formData.get("clientId") ?? ""),
    name: String(formData.get("name") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstFieldErrors(parsed.error), formError: null };
  }

  const { supabase } = await requireCompanyAdmin();
  const { error } = await supabase.rpc("update_client", {
    target_client_id: parsed.data.clientId,
    client_name: parsed.data.name,
    client_contact_name: parsed.data.contactName,
    client_phone: parsed.data.phone,
    client_notes: parsed.data.notes,
  });
  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "The client could not be saved. Please try again.",
    };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, fieldErrors: {}, formError: null };
}

export async function updateSite(formData: FormData): Promise<RecordMutationResult> {
  const parsed = updateSiteSchema.safeParse({
    clientId: String(formData.get("clientId") ?? ""),
    siteId: String(formData.get("siteId") ?? ""),
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    suburb: String(formData.get("suburb") ?? ""),
    accessNotes: String(formData.get("accessNotes") ?? ""),
    defaultServiceId: String(formData.get("defaultServiceId") ?? ""),
    durationHours: String(formData.get("durationHours") ?? ""),
    rateAud: String(formData.get("rateAud") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: firstFieldErrors(parsed.error), formError: null };
  }

  const { supabase } = await requireCompanyAdmin();
  const { error } = await supabase.rpc("update_site", {
    target_site_id: parsed.data.siteId,
    site_name: parsed.data.name,
    site_address: parsed.data.address,
    site_suburb: parsed.data.suburb,
    site_access_notes: parsed.data.accessNotes,
    site_default_service_id: parsed.data.defaultServiceId,
    site_default_duration_minutes: parsed.data.durationMinutes,
    site_default_rate_cents: parsed.data.rateCents,
  });
  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "The site could not be saved. Please try again.",
    };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, fieldErrors: {}, formError: null };
}

export async function savePreferredCleanerOrder(
  input: unknown,
): Promise<RecordMutationResult> {
  const parsed = preferredCleanerOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: {},
      formError: parsed.error.issues[0]?.message ?? "The cleaner order is invalid.",
    };
  }

  const { supabase } = await requireCompanyAdmin();
  const { error } = await supabase.rpc("set_site_preferred_cleaners", {
    target_site_id: parsed.data.siteId,
    cleaner_ids: parsed.data.cleanerIds,
  });
  if (error) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "The preferred cleaner order could not be saved. Please try again.",
    };
  }

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, fieldErrors: {}, formError: null };
}
