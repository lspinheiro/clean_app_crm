import { redirect } from "next/navigation";
import { cache } from "react";

import { evaluateCleanerAccess } from "./access";
import { isMissingSessionError, isStaleSessionError } from "./session-error";
import { createClient } from "@/lib/supabase/server";

async function loadCleanerContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError && !isMissingSessionError(userError) && !isStaleSessionError(userError)) {
    throw userError;
  }
  if (!user) {
    return {
      decision: evaluateCleanerAccess({ userId: null, profile: null }),
      supabase,
      user: null,
      profile: null,
    } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name, suburb")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const decision = evaluateCleanerAccess({ userId: user.id, profile });
  return { decision, supabase, user, profile } as const;
}

export const getCleanerContext = cache(loadCleanerContext);

export async function requireCleaner() {
  const context = await getCleanerContext();
  if (context.decision.kind === "denied" || !context.profile) {
    redirect("/login?error=not-authorised");
  }
  return { ...context, profile: context.profile };
}
