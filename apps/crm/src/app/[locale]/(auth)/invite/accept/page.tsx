import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { BrandBubbles } from "@/components/brand-bubbles";
import { FirstAdminAcceptanceForm } from "./accept-form";
import { ContinueConfirmation } from "./continue-confirmation";
import { EmployeeAcceptance } from "./employee-acceptance";
import { RequestNewLink } from "./request-new-link";
import { UseAnotherAccount } from "./use-another-account";
import { employeeInvitationIdSchema } from "@/features/employee-invitations/schema";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { Link, redirect } from "@/i18n/navigation";
import {
  decodePendingConfirmation,
  pendingConfirmationCookieName,
} from "@/lib/auth/pending-confirmation";
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

  // The confirmation link parks its token instead of spending it, so an unspent one means the
  // invitee has arrived and nothing has happened yet. Its presence is what separates "you got
  // here first" from "something opened this before you did".
  const cookieStore = await cookies();
  const pendingConfirmation = decodePendingConfirmation(
    cookieStore.get(pendingConfirmationCookieName)?.value,
  );

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
    // A newer invitation took this one's place, which is the one fact that tells this holder
    // what to do: read the most recent e-mail. It used to arrive as "withdrawn" here and as
    // "Expired" on the owner's list; one word now covers both.
    if (preview.state === "replaced") {
      return notice(employeeT("replacedTitle"), employeeT("replacedDescription"));
    }
    if (preview.state !== "pending") {
      return notice(employeeT("unknownTitle"), employeeT("unknownDescription"));
    }

    // Bound outside the closure: narrowing from `employeeInvitation.success` does not reach
    // into a hoisted function declaration.
    const invitationId = employeeInvitation.data;

    function continueNotice() {
      return notice(
        employeeT("continueTitle"),
        employeeT("continueDescription", { companyName: preview.company_name ?? "" }),
        <ContinueConfirmation
          failedLabel={employeeT("continueFailed")}
          fallback={
            <RequestNewLink invitationId={invitationId} inviteeHint={preview.invitee_hint} />
          }
          label={employeeT("continue")}
          workingLabel={employeeT("continuing")}
        />,
      );
    }

    if (pendingConfirmation && (userError || !user?.email)) return continueNotice();

    if (userError || !user?.email) {
      // One continuation for everybody. Branching on whether the address already had an
      // account would let anyone holding this link test that — the id is held by the admin
      // too and travels in a forwardable e-mail. The server decides whether to re-invite or
      // send a recovery e-mail and never reflects which.
      const returnTo = `/invite/accept?employeeInvitation=${employeeInvitation.data}`;
      return notice(
        employeeT("linkUsedTitle"),
        employeeT("linkUsedDescription", {
          companyName: preview.company_name ?? "",
        }),
        <>
          <RequestNewLink
            invitationId={employeeInvitation.data}
            inviteeHint={preview.invitee_hint}
          />
          {/* Shown to everybody, so it discloses nothing. Offering it only to addresses that
              already had an account was the leak; withholding it from everyone would strand
              somebody who knows their password behind a recovery e-mail they do not need. */}
          <Link
            className="button button--secondary"
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {employeeT("signIn")}
          </Link>
        </>,
      );
    }

    let employeeContext: EmployeeInvitationContext | null = null;
    const { data, error } = await supabase.rpc("get_employee_invitation_context", {
      target_invitation_id: employeeInvitation.data,
    });
    if (!error && data?.[0]) employeeContext = data[0];

    if (!employeeContext) {
      // Both reasons the context RPC refuses — a different account, and an address that is not
      // confirmed — are what exchanging the token fixes: it replaces the session with the
      // invitee's and confirms the address on the way. Offering the button beats asking for a
      // sign-out, and beats telling somebody to open a link they are already looking at.
      if (pendingConfirmation) return continueNotice();

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
    // The founder invitation shares the confirmation route, so it inherits the fix. With no
    // session there is no company to name, but pressing Continue is still the whole of it.
    if (pendingConfirmation) {
      return (
        <AuthShell>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("continueTitle")}</h1>
          <p className="auth-panel__intro">{t("continueDescription")}</p>
          <ContinueConfirmation
            failedLabel={t("continueFailed")}
            label={t("continue")}
            workingLabel={t("continuing")}
          />
        </AuthShell>
      );
    }

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
