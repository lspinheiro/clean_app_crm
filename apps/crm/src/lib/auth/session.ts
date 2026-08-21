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
      memberships: [],
      company: null,
    } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, preferred_locale, last_active_company")
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
      memberships: [],
      company: null,
    } as const;
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("employee_memberships")
    .select("company_id, profile_id, role, status, joined_at")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (membershipError) throw membershipError;

  if (!membershipRows.length) {
    return {
      decision: evaluateCrmAccess({ userId: user.id, profile, membership: null }),
      supabase,
      user,
      profile,
      membership: null,
      memberships: [],
      company: null,
    } as const;
  }

  const { data: companyRows, error: companyError } = await supabase
    .from("companies")
    .select("id, name, abn, logo_path, status, timezone, updated_at")
    .in("id", membershipRows.map((membership) => membership.company_id))
    .eq("status", "approved")
    .order("name");
  if (companyError) throw companyError;

  const companiesById = new Map(companyRows.map((company) => [company.id, company]));
  const memberships = membershipRows.flatMap((membership) => {
    const company = companiesById.get(membership.company_id);
    return company
      ? [{
          companyId: company.id,
          companyName: company.name,
          role: membership.role,
        }]
      : [];
  });
  const membership = membershipRows.find(
    (candidate) =>
      candidate.company_id === profile.last_active_company
      && companiesById.has(candidate.company_id),
  ) ?? membershipRows.find((candidate) => companiesById.has(candidate.company_id)) ?? null;
  const company = membership ? companiesById.get(membership.company_id) ?? null : null;

  if (!membership || !company) {
    return {
      decision: {
        kind: "denied",
        reason: "company_not_approved",
      } as const,
      supabase,
      user,
      profile,
      membership: null,
      memberships,
      company: null,
    } as const;
  }

  let resolvedProfile = profile;
  if (profile.last_active_company !== company.id) {
    const { data: persistedCompanyId, error: persistenceError } = await supabase.rpc(
      "set_active_company",
      { target_company_id: company.id },
    );
    if (persistenceError) throw persistenceError;
    if (persistedCompanyId !== company.id) {
      return {
        decision: evaluateCrmAccess({ userId: user.id, profile, membership: null }),
        supabase,
        user,
        profile,
        membership: null,
        memberships: [],
        company: null,
      } as const;
    }
    resolvedProfile = { ...profile, last_active_company: persistedCompanyId };
  }

  const companyDecision = evaluateCrmAccess({
    userId: user.id,
    profile: resolvedProfile,
    membership,
    companyStatus: company.status,
  });
  if (companyDecision.kind === "denied") {
    return {
      decision: companyDecision,
      supabase,
      user,
      profile: resolvedProfile,
      membership,
      memberships,
      company: null,
    } as const;
  }

  return {
    decision: companyDecision,
    supabase,
    user,
    profile: resolvedProfile,
    membership,
    memberships,
    company,
  } as const;
}

export const getCompanyAdminContext = cache(loadCompanyAdminContext);

export async function requireCompanyAdmin() {
  const context = await getCompanyAdminContext();
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  if (context.decision.kind === "denied") {
    if (
      context.decision.reason === "missing_membership"
      || context.decision.reason === "inactive_membership"
      || context.decision.reason === "company_not_approved"
    ) {
      return redirect({ href: "/no-company-access", locale });
    }
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
