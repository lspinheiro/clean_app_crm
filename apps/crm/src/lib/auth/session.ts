import { getLocale } from "next-intl/server";
import { cache } from "react";

import { evaluateCrmAccess } from "./access";
import { isRecoverableAuthSessionError } from "./errors";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

async function loadCompanyAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError && !isRecoverableAuthSessionError(userError)) throw userError;
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
    .select("id, role, full_name, preferred_locale")
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
    .select("id, name, abn, logo_path, status, timezone, updated_at")
    .eq("id", membership.company_id)
    .eq("status", "approved")
    .maybeSingle();
  if (companyError) throw companyError;

  if (!company) {
    return {
      decision: {
        kind: "denied",
        reason: "company_not_approved",
      } as const,
      supabase,
      user,
      profile,
      company: null,
    } as const;
  }

  const companyDecision = evaluateCrmAccess({
    userId: user.id,
    profile,
    companyStatus: company.status,
  });
  if (companyDecision.kind === "denied") {
    return {
      decision: companyDecision,
      supabase,
      user,
      profile,
      company: null,
    } as const;
  }

  return { decision: companyDecision, supabase, user, profile, company } as const;
}

export const getCompanyAdminContext = cache(loadCompanyAdminContext);

export async function requireCompanyAdmin() {
  const context = await getCompanyAdminContext();
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  if (context.decision.kind === "denied") {
    return redirect({ href: "/login?error=not-authorised", locale });
  }
  if (!context.company || !context.profile) {
    return redirect({ href: "/login?error=not-authorised", locale });
  }
  return {
    ...context,
    company: context.company,
    profile: context.profile,
  };
}
