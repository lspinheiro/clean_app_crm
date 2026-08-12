import type { Metadata } from "next";

import { signOutAction } from "@/app/actions/auth";
import { requireCleaner } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Open jobs" };

export default async function BoardPage() {
  const { profile } = await requireCleaner();

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
      <form action={signOutAction} className="screen-footer">
        <button className="button button--secondary button--small" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
