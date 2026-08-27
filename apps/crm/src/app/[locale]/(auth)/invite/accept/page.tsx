import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { BrandBubbles } from "@/components/brand-bubbles";
import { FirstAdminAcceptanceForm } from "./accept-form";
import { EmployeeAcceptance } from "./employee-acceptance";
import { RequestNewLink } from "./request-new-link";
import { UseAnotherAccount } from "./use-another-account";
import { employeeInvitationIdSchema } from "@/features/employee-invitations/schema";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

type FirstAdminAcceptancePageProps = {
  searchParams: Promise<{
    employeeInvitation?: string | string[];
    error?: string | string[];
  }>;
};

/**
 * What `employee_invitation_preview` answers without a session. Everything but `state` is
 * null unless the invitation can still be used.
 */
type EmployeeInvitationPreview = {
  account_existed: boolean | null;
  company_name: string | null;
  invitee_hint: string | null;
  role: "owner" | "staff" | null;
  state: string;
};

/** Matches the masking the preview applies, so the two can be compared. */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
}

type EmployeeInvitationContext = {
  account_existed_at_invitation: boolean;
  company_name: string;
  invitation_id: string;
  invitation_status: string;
  invitee_email: string;
  locale: "en-AU" | "pt-BR";
  role: "owner" | "staff";
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("firstAdminInvitation") };
}

function AuthShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand-lockup">
          <BrandBubbles />
          The Clean Crew
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel__inner">{children}</div>
      </section>
    </main>
  );
}

export default async function FirstAdminAcceptancePage({
  searchParams,
}: FirstAdminAcceptancePageProps) {
  const query = await searchParams;
  const requestLocale = await getLocale();
  const locale = isAppLocale(requestLocale) ? requestLocale : defaultLocale;
  const t = await getTranslations("FirstAdminInvitation");
  const employeeT = await getTranslations("EmployeeInvitationAcceptance");
  const employeeInvitation = employeeInvitationIdSchema.safeParse(
    Array.isArray(query.employeeInvitation)
      ? query.employeeInvitation[0]
      : query.employeeInvitation,
  );
  let context:
    | {
        invitation_status: string;
        invitee_email: string;
        locale: "en-AU" | "pt-BR";
      }
    | null = null;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (employeeInvitation.success) {
    // The preview answers without a session, which is the only reason each state below can
    // name itself. `get_employee_invitation_context` returns zero rows for "not signed in",
    // "signed in as somebody else", "revoked" and "expired" alike.
    const { data: previewRows } = await supabase.rpc("employee_invitation_preview", {
      target_invitation_id: employeeInvitation.data,
    });
    const preview = (previewRows?.[0] ?? { state: "unknown" }) as EmployeeInvitationPreview;

    function notice(title: string, description: string, action?: React.ReactNode) {
      return (
        <AuthShell>
          <p className="eyebrow">{employeeT("eyebrow")}</p>
          <h1>{title}</h1>
          <p className="auth-panel__intro">{description}</p>
          {action ?? (
            <Link className="button button--secondary" href="/login">
              {employeeT("backToLogin")}
            </Link>
          )}
        </AuthShell>
      );
    }

    // Already accepted and signed in means they simply followed an old link; send them on
    // rather than telling them something they cannot act on.
    if (preview.state === "accepted") {
      if (!userError && user?.email) return redirect({ href: "/roster", locale });
      return notice(employeeT("acceptedTitle"), employeeT("acceptedDescription"));
    }

    if (preview.state === "expired") {
      return notice(employeeT("expiredTitle"), employeeT("expiredDescription"));
    }
    if (preview.state === "revoked") {
      return notice(employeeT("revokedTitle"), employeeT("revokedDescription"));
    }
    if (preview.state !== "pending") {
      return notice(employeeT("unknownTitle"), employeeT("unknownDescription"));
    }

    if (userError || !user?.email) {
      // Only an account that already existed has a password to sign in with. Telling a brand
      // new invitee to "use your existing login" is the dead end this replaces.
      if (!preview.account_existed) {
        return notice(
          employeeT("linkUsedTitle"),
          employeeT("linkUsedDescription", {
            companyName: preview.company_name ?? "",
          }),
          <RequestNewLink
            invitationId={employeeInvitation.data}
            inviteeHint={preview.invitee_hint}
          />,
        );
      }

      const returnTo = `/invite/accept?employeeInvitation=${employeeInvitation.data}`;
      return (
        <AuthShell>
          <p className="eyebrow">{employeeT("eyebrow")}</p>
          <h1>{employeeT("signInTitle")}</h1>
          <p className="auth-panel__intro">{employeeT("signInDescription")}</p>
          <Link
            className="button"
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {employeeT("signIn")}
          </Link>
        </AuthShell>
      );
    }

    let employeeContext: EmployeeInvitationContext | null = null;
    const { data, error } = await supabase.rpc("get_employee_invitation_context", {
      target_invitation_id: employeeInvitation.data,
    });
    if (!error && data?.[0]) employeeContext = data[0];

    if (!employeeContext) {
      // The invitation is live and somebody is signed in, so the context RPC refused for one
      // of two reasons: a different account, or an unconfirmed address. Masking collapses
      // distinct addresses, so claim a mismatch only when the hints actually differ.
      if (preview.invitee_hint && preview.invitee_hint !== maskEmail(user.email)) {
        return notice(
          employeeT("wrongAccountTitle"),
          employeeT("wrongAccountDescription", {
            invitee: preview.invitee_hint,
            signedIn: user.email,
          }),
          <UseAnotherAccount />,
        );
      }
      return notice(employeeT("checkAccountTitle"), employeeT("checkAccountDescription"));
    }

    return (
      <AuthShell>
        <EmployeeAcceptance
          accountExisted={employeeContext.account_existed_at_invitation}
          companyName={employeeContext.company_name}
          defaultLocale={employeeContext.locale}
          invitationId={employeeContext.invitation_id}
          inviteeEmail={employeeContext.invitee_email}
          role={employeeContext.role}
        />
      </AuthShell>
    );
  }

  if (!userError && user?.email) {
    const { data, error } = await supabase.rpc("get_first_admin_invitation_context");
    if (!error && data?.[0]) context = data[0];
  }

  if (context?.invitation_status === "accepted") {
    return redirect({ href: "/onboarding", locale });
  }

  if (!context || context.invitation_status !== "pending") {
    return (
      <AuthShell>
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("unavailableTitle")}</h1>
        <p className="auth-panel__intro">{t("unavailableDescription")}</p>
        <Link className="button button--secondary" href="/login">
          {t("backToLogin")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="auth-panel__intro">{t("intro")}</p>
      <FirstAdminAcceptanceForm
        defaultLocale={context.locale}
        inviteeEmail={context.invitee_email}
      />
    </AuthShell>
  );
}
