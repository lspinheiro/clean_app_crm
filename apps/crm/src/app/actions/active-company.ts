"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { defaultLocale, isAppLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export async function switchActiveCompany(formData: FormData) {
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  const parsed = z.uuid().safeParse(formData.get("companyId"));
  if (!parsed.success) return redirect({ href: "/roster", locale });

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_company", {
    target_company_id: parsed.data,
  });
  if (error) throw error;

  revalidatePath("/", "layout");
  return redirect({ href: "/roster", locale });
}
