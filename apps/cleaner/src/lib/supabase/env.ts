type SupabaseBrowserEnv = {
  publishableKey: string;
  url: string;
};

export function getSupabaseBrowserEnv(): SupabaseBrowserEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Copy apps/cleaner/.env.example to .env.local and set the project values.",
    );
  }

  return { publishableKey, url };
}
