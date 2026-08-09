type CompanyLogoStorageClient = {
  storage: {
    from(bucket: "company-logos"): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{
        data: { signedUrl: string } | null;
        error: unknown;
      }>;
    };
  };
};

export async function getCompanyLogoUrl(
  supabase: CompanyLogoStorageClient,
  logoPath: string | null,
) {
  if (!logoPath) return null;

  try {
    const { data, error } = await supabase.storage
      .from("company-logos")
      .createSignedUrl(logoPath, 60 * 60);
    if (error || !data) {
      console.error("Company logo URL resolution failed.");
      return null;
    }
    return data.signedUrl;
  } catch {
    console.error("Company logo URL resolution failed.");
    return null;
  }
}
