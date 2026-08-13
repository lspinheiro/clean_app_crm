"use client";

import { useEffect, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

import { evaluateCleanerAccess, type AppRole } from "./access";
import { isStaleSessionError } from "./session-error";

export type CleanerProfile = {
  id: string;
  role: AppRole;
  full_name: string;
  suburb: string | null;
};

export type CleanerState =
  | { status: "checking" }
  | { status: "allowed"; profile: CleanerProfile }
  | { status: "denied" };

/**
 * Client-side gate. This is UX, not security: the real boundary is RLS plus the
 * `cleaner_*` views and the security-definer RPCs, which hold whatever the browser does.
 */
export function useCleaner(): CleanerState {
  const [state, setState] = useState<CleanerState>({ status: "checking" });

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    async function resolve(): Promise<CleanerState> {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        // A session the server no longer accepts would otherwise retry forever.
        if (isStaleSessionError(error)) await supabase.auth.signOut({ scope: "local" });
        return { status: "denied" };
      }
      if (!data.user) return { status: "denied" };

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, full_name, suburb")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError || !profile) return { status: "denied" };

      const decision = evaluateCleanerAccess({ userId: data.user.id, profile });
      return decision.kind === "allowed"
        ? { status: "allowed", profile }
        : { status: "denied" };
    }

    void resolve().then((next) => {
      if (active) setState(next);
    });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
