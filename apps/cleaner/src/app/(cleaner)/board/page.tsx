"use client";

import { useRouter } from "next/navigation";

import { useCleaner } from "@/lib/auth/use-cleaner";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function BoardPage() {
  const router = useRouter();
  const cleaner = useCleaner();

  // The layout holds the gate; this only renders once it has allowed the cleaner through.
  if (cleaner.status !== "allowed") return null;

  const { profile } = cleaner;

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="screen">
      <div>
        <h1 className="screen-title">Open jobs</h1>
        <p className="screen-lead">
          {profile.suburb ? `${profile.full_name} · ${profile.suburb}` : profile.full_name}
        </p>
      </div>
      <div className="empty-state">
        <p>No open jobs yet.</p>
        <p>When a company you work with posts a job, it appears here.</p>
      </div>
      <div className="screen-footer">
        <button
          className="button button--secondary button--small"
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
