"use client";

import { Ban, CheckCircle2, CircleX, Clock3, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";

import {
  inviteEmployeeAction,
  revokeEmployeeInvitationAction,
} from "@/app/actions/employee-invitations";
import { employeeInvitationRoleSchema } from "@/features/employee-invitations/schema";
import type { EmployeeInvitationActionResult } from "@/features/employee-invitations/state";
import { grantsFullCompanyControl } from "@/features/settings/role-access";
import { useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";

export type EmployeeInvitationListItem = {
  createdAt: string;
  email: string;
  id: string;
  role: "owner" | "staff";
  state: "accepted" | "expired" | "pending" | "replaced" | "revoked";
};

type EmployeeInvitationsProps = {
  invitations: EmployeeInvitationListItem[];
};

/** A send held back at the confirmation, keeping the exact payload the inviter submitted. */
type OwnerConfirmation = {
  email: string;
  form: HTMLFormElement;
  formData: FormData;
};

const initialResult: EmployeeInvitationActionResult = {
  fieldErrors: {},
  formError: null,
  ok: false,
};

function InvitationStateIcon({ state }: { state: EmployeeInvitationListItem["state"] }) {
  const props = { "aria-hidden": true as const, size: 13, strokeWidth: 2.4 };
  if (state === "accepted") return <CheckCircle2 {...props} />;
  if (state === "expired") return <CircleX {...props} />;
  if (state === "replaced") return <RefreshCw {...props} />;
  if (state === "revoked") return <Ban {...props} />;
  return <Clock3 {...props} />;
}

function localiseResult(
  result: EmployeeInvitationActionResult,
  locale: "en-AU" | "pt-BR",
): EmployeeInvitationActionResult {
  if (result.ok) return result;
  return {
    ...result,
    fieldErrors: {
      confirmPassword: localiseUserMessage(result.fieldErrors.confirmPassword, locale) ?? undefined,
      email: localiseUserMessage(result.fieldErrors.email, locale) ?? undefined,
      fullName: localiseUserMessage(result.fieldErrors.fullName, locale) ?? undefined,
      locale: localiseUserMessage(result.fieldErrors.locale, locale) ?? undefined,
      password: localiseUserMessage(result.fieldErrors.password, locale) ?? undefined,
      role: localiseUserMessage(result.fieldErrors.role, locale) ?? undefined,
    },
    formError: localiseUserMessage(result.formError, locale) ?? null,
  };
}

export function EmployeeInvitations({ invitations }: EmployeeInvitationsProps) {
  const locale = useLocale();
  const t = useTranslations("EmployeeInvitations");
  const roleT = useTranslations("RoleAccess");
  const router = useRouter();
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OwnerConfirmation | null>(null);
  const [result, setResult] = useState<EmployeeInvitationActionResult>(initialResult);
  const [pending, startTransition] = useTransition();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Brisbane",
    year: "numeric",
  });

  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
    if (!confirmation && dialog?.open) dialog.close();
  }, [confirmation]);

  function send(form: HTMLFormElement, formData: FormData) {
    setResult(initialResult);
    startTransition(async () => {
      const nextResult = await inviteEmployeeAction(formData);
      setResult(localiseResult(nextResult, locale));
      if (nextResult.ok) form.reset();
      // A rejected send still moves invitation state — withdrawn, or left open for the owner to
      // revoke — and a form error is what the action returns once it has reached the database.
      // A rejected field never got that far, so there is nothing to read back.
      if (nextResult.ok || nextResult.formError) router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const role = employeeInvitationRoleSchema.safeParse(formData.get("role"));
    // Owner access carries the whole company — details, employees and invitations alike — and
    // the e-mail cannot be recalled once it leaves. Ask before the send, not after it.
    if (role.success && grantsFullCompanyControl(role.data)) {
      setResult(initialResult);
      setConfirmation({
        email: String(formData.get("email") ?? ""),
        form,
        formData,
      });
      return;
    }
    send(form, formData);
  }

  function confirmOwnerInvitation() {
    if (!confirmation) return;
    const { form, formData } = confirmation;
    setConfirmation(null);
    send(form, formData);
  }

  function revoke(invitationId: string) {
    setBusyId(invitationId);
    setResult(initialResult);
    startTransition(async () => {
      const nextResult = await revokeEmployeeInvitationAction(invitationId);
      setResult(localiseResult(nextResult, locale));
      setBusyId(null);
      if (nextResult.ok) router.refresh();
    });
  }

  return (
    <>
      <section className="settings-card employee-invitations" aria-labelledby="employee-invitations-heading">
        <div className="employee-invitations__heading">
          <div>
            <h2 id="employee-invitations-heading">{t("title")}</h2>
            <p>{t("description")}</p>
            <p className="employee-invitations__expiry">
              <Clock3 aria-hidden="true" size={15} strokeWidth={2.2} />
              <span>{t("expiry")}</span>
            </p>
          </div>
        </div>

        <form className="employee-invitation-form" noValidate onSubmit={submit}>
          <input name="locale" type="hidden" value={locale} />
          <div className="field employee-invitation-form__email">
            <label htmlFor="employee-invitation-email">{t("email")}</label>
            <input
              aria-describedby={result.ok === false && result.fieldErrors.email
                ? "employee-invitation-email-error"
                : undefined}
              aria-invalid={result.ok === false && Boolean(result.fieldErrors.email)}
              autoComplete="email"
              id="employee-invitation-email"
              name="email"
              placeholder={t("emailPlaceholder")}
              required
              type="email"
            />
            {result.ok === false && result.fieldErrors.email ? (
              <span className="field-error" id="employee-invitation-email-error">
                {result.fieldErrors.email}
              </span>
            ) : null}
          </div>
          <div className="field employee-invitation-form__role">
            <label htmlFor="employee-invitation-role">{t("role")}</label>
            <select
              aria-describedby="employee-invitation-access-help"
              defaultValue="staff"
              id="employee-invitation-role"
              name="role"
            >
              <option value="staff">{t("staff")}</option>
              <option value="owner">{t("owner")}</option>
            </select>
          </div>
          <button className="button" disabled={pending} type="submit">
            {pending && busyId === null ? t("sending") : t("send")}
          </button>
          {/* The choice used to be two words with no consequence attached. Both lines stay on
              screen, because picking between them is the moment they are needed. No aria-label
              here: the select points at this list with aria-describedby, and a name on the list
              would replace the very lines the description is for. */}
          <dl
            className="employee-invitation-form__access-help"
            id="employee-invitation-access-help"
          >
            <div>
              <dt>{t("owner")}</dt>
              <dd>{roleT("ownerAccess")}</dd>
            </div>
            <div>
              <dt>{t("staff")}</dt>
              <dd>{roleT("staffAccess")}</dd>
            </div>
          </dl>
        </form>

        {result.ok === false && result.formError ? (
          <p className="form-error" role="alert">{result.formError}</p>
        ) : null}

        <div className="employee-invitation-list" aria-label={t("listLabel")}>
          {invitations.length === 0 ? (
            <p className="employee-invitation-list__empty">{t("empty")}</p>
          ) : invitations.map((invitation) => (
            <article className="employee-invitation-row" key={invitation.id}>
              <div className="employee-invitation-row__identity">
                <strong>{invitation.email}</strong>
                <span>{t(invitation.role)} · {dateFormatter.format(new Date(invitation.createdAt))}</span>
              </div>
              <span className={`invitation-state invitation-state--${invitation.state}`}>
                <InvitationStateIcon state={invitation.state} />
                {t(invitation.state)}
              </span>
              {invitation.state === "pending" ? (
                <button
                  aria-label={t("revokeFor", { email: invitation.email })}
                  className="button button--secondary employee-invitation-row__action"
                  disabled={pending}
                  onClick={() => revoke(invitation.id)}
                  type="button"
                >
                  {busyId === invitation.id ? t("revoking") : t("revoke")}
                </button>
              ) : <span aria-hidden="true" className="employee-invitation-row__action-placeholder" />}
            </article>
          ))}
        </div>
      </section>

      <dialog
        aria-labelledby="employee-invitation-confirmation-title"
        className="record-dialog employee-access-dialog"
        onClose={() => setConfirmation(null)}
        ref={confirmationDialog}
      >
        {confirmation ? (
          <div className="dialog-form">
            <header className="dialog-header">
              <h2 id="employee-invitation-confirmation-title">
                {t("confirmOwnerTitle", { email: confirmation.email })}
              </h2>
              <p>{t("confirmOwnerDescription")}</p>
            </header>
            <div className="dialog-actions">
              <button
                className="button button--secondary"
                onClick={() => setConfirmation(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button className="button" onClick={confirmOwnerInvitation} type="button">
                {t("confirmOwnerSend")}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
