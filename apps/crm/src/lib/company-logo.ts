import type { Database } from "@clean-app/db";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCompanyLogoUrl(
  supabase: SupabaseClient<Database>,
  logoPath: string | null,
) {
  if (!logoPath) return null;

  const { data, error } = await supabase.storage
    .from("company-logos")
    .createSignedUrl(logoPath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
