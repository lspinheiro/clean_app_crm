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
      membership: null,
      company: null,
    } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, preferred_locale")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (!profile) {
    return {
      decision: evaluateCrmAccess({ userId: user.id, profile, membership: null }),
      supabase,
      user,
      profile,
      membership: null,
      company: null,
    } as const;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("employee_memberships")
    .select("company_id, profile_id, role, status")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;

  if (!membership) {
    return {
      decision: evaluateCrmAccess({ userId: user.id, profile, membership: null }),
      supabase,
      user,
      profile,
      membership: null,
      company: null,
    } as const;
  }

  const decision = evaluateCrmAccess({ userId: user.id, profile, membership });
  if (decision.kind === "denied") {
    return {
      decision,
      supabase,
      user,
      profile,
      membership,
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
      membership,
      company: null,
    } as const;
  }

  const companyDecision = evaluateCrmAccess({
    userId: user.id,
    profile,
    membership,
    companyStatus: company.status,
  });
  if (companyDecision.kind === "denied") {
    return {
      decision: companyDecision,
      supabase,
      user,
      profile,
      membership,
      company: null,
    } as const;
  }

  return { decision: companyDecision, supabase, user, profile, membership, company } as const;
}

export const getCompanyAdminContext = cache(loadCompanyAdminContext);

export async function requireCompanyAdmin() {
  const context = await getCompanyAdminContext();
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  if (context.decision.kind === "denied") {
    return redirect({ href: "/login?error=not-authorised", locale });
  }
  if (!context.company || !context.profile || !context.membership) {
    return redirect({ href: "/login?error=not-authorised", locale });
  }
  return {
    ...context,
    company: context.company,
    membership: context.membership,
    profile: context.profile,
  };
}

export async function requireCompanyOwner() {
  const context = await requireCompanyAdmin();
  if (context.membership.role !== "owner") {
    const requestLocale = await getLocale();
    const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
    return redirect({ href: "/login?error=not-authorised", locale });
  }
  return context;
}
