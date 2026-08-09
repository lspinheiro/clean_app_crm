import { redirect } from "next/navigation";

import { evaluateCrmAccess } from "./access";
import { createClient } from "@/lib/supabase/server";

export async function getCompanyAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError && userError.name !== "AuthSessionMissingError") throw userError;
  if (!user) {
    return {
      decision: evaluateCrmAccess({ userId: null, profile: null }),
      supabase,
      user: null,
      profile: null,
      company: null,
    } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const decision = evaluateCrmAccess({ userId: user.id, profile });
  if (decision.kind === "denied") {
    return { decision, supabase, user, profile, company: null } as const;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;

  if (!membership) {
    return {
      decision: { kind: "denied", reason: "missing_profile" } as const,
      supabase,
      user,
      profile,
      company: null,
    } as const;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, logo_path, status, timezone")
    .eq("id", membership.company_id)
    .eq("status", "approved")
    .single();
  if (companyError) throw companyError;

  return { decision, supabase, user, profile, company } as const;
}

export async function requireCompanyAdmin() {
  const context = await getCompanyAdminContext();
  if (context.decision.kind === "denied" || !context.company || !context.profile) {
    redirect("/login?error=not-authorised");
  }
  return context;
}
