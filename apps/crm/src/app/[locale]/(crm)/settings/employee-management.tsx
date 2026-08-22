"use client";

import { ShieldAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  changeEmployeeRoleAction,
  removeEmployeeAction,
} from "@/app/actions/employee-management";
import {
  employeeRoleSchema,
  type EmployeeListItem,
} from "@/features/employee-management/schema";
import { useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";

type EmployeeManagementProps = {
  currentProfileId: string;
  employees: EmployeeListItem[];
};

type Result =
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

type Confirmation =
  | { employee: EmployeeListItem; kind: "promote" }
  | { employee: EmployeeListItem; kind: "remove" }
  | null;

export function EmployeeManagement({
  currentProfileId,
  employees,
}: EmployeeManagementProps) {
  const locale = useLocale();
  const t = useTranslations("EmployeeManagement");
  const router = useRouter();
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const [busyActions, setBusyActions] = useState<
    Record<string, "remove" | "role" | undefined>
  >({});
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, "owner" | "staff">>(() =>
    Object.fromEntries(employees.map((employee) => [employee.membershipId, employee.role])),
  );
  const [results, setResults] = useState<Record<string, Result | undefined>>({});
  const [removalResult, setRemovalResult] = useState<string | null>(null);
  const ownerCount = employees.filter((employee) => employee.role === "owner").length;
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

  function setBusy(membershipId: string, kind: "remove" | "role" | undefined) {
    setBusyActions((current) => ({ ...current, [membershipId]: kind }));
  }

  function setResult(membershipId: string, result: Result | undefined) {
    setResults((current) => ({ ...current, [membershipId]: result }));
  }

  async function changeRole(employee: EmployeeListItem) {
    const role = draftRoles[employee.membershipId] ?? employee.role;
    setBusy(employee.membershipId, "role");
    setResult(employee.membershipId, undefined);
    const nextResult = await changeEmployeeRoleAction({
      membershipId: employee.membershipId,
      role,
    });
    setBusy(employee.membershipId, undefined);
    if (!nextResult.ok) {
      setDraftRoles((current) => ({
        ...current,
        [employee.membershipId]: employee.role,
      }));
      setResult(employee.membershipId, {
        kind: "error",
        message: localiseUserMessage(nextResult.formError, locale) ?? t("failed"),
      });
      return;
    }
    setResult(employee.membershipId, {
      kind: "success",
      message: t("accessUpdated", { name: employee.fullName, role: t(role) }),
    });
    router.refresh();
  }

  async function remove(employee: EmployeeListItem) {
    setBusy(employee.membershipId, "remove");
    setResult(employee.membershipId, undefined);
    setRemovalResult(null);
    const nextResult = await removeEmployeeAction({
      membershipId: employee.membershipId,
    });
    setBusy(employee.membershipId, undefined);
    if (!nextResult.ok) {
      setResult(employee.membershipId, {
        kind: "error",
        message: localiseUserMessage(nextResult.formError, locale) ?? t("failed"),
      });
      return;
    }
    setRemovalResult(t("removed", { name: employee.fullName }));
    router.refresh();
  }

  function requestRoleChange(employee: EmployeeListItem) {
    const nextRole = draftRoles[employee.membershipId] ?? employee.role;
    if (employee.role === "staff" && nextRole === "owner") {
      setConfirmation({ employee, kind: "promote" });
      return;
    }
    void changeRole(employee);
  }

  function confirmAction() {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === "promote") void changeRole(action.employee);
    if (action.kind === "remove") void remove(action.employee);
  }

  const confirmationIsSelf = confirmation?.employee.profileId === currentProfileId;
  const confirmationTitle = confirmation?.kind === "promote"
    ? t("promoteTitle", { name: confirmation.employee.fullName })
    : confirmation?.kind === "remove"
      ? confirmationIsSelf
        ? t("removeSelfTitle")
        : t("removeTitle", { name: confirmation.employee.fullName })
      : "";

  return (
    <>
      <section
        aria-labelledby="employee-management-heading"
        className="settings-card employee-management"
      >
        <div className="employee-management__heading">
          <div>
            <h2 id="employee-management-heading">{t("title")}</h2>
            <p>{t("description")}</p>
          </div>
          <span className="employee-management__count">
            {t("count", { count: employees.length })}
          </span>
        </div>

        <div aria-label={t("listLabel")} className="employee-management__list">
          {employees.map((employee) => {
            const selectId = `employee-role-${employee.membershipId}`;
            const descriptionId = `${selectId}-description`;
            const protectionId = `${selectId}-protection`;
            const draftRole = draftRoles[employee.membershipId] ?? employee.role;
            const isBusy = Boolean(busyActions[employee.membershipId]);
            const isCurrentUser = employee.profileId === currentProfileId;
            const isLastOwner = employee.role === "owner" && ownerCount === 1;
            const isLastOwnerDemotion = isLastOwner && draftRole === "staff";
            const result = results[employee.membershipId];
            return (
              <div
                aria-label={employee.fullName}
                className="employee-management__row"
                key={employee.membershipId}
                role="group"
              >
                <div className="employee-management__identity">
                  <div className="employee-management__name">
                    <strong>{employee.fullName}</strong>
                    {isCurrentUser ? (
                      <span className="employee-management__you">{t("you")}</span>
                    ) : null}
                  </div>
                  <a href={`mailto:${employee.email}`}>{employee.email}</a>
                  <span>{t("joined", { date: dateFormatter.format(new Date(employee.joinedAt)) })}</span>
                </div>
                <div className="employee-management__access">
                  <label htmlFor={selectId}>{t("accessLabel")}</label>
                  <div className="employee-management__controls">
                    <select
                      aria-label={t("accessFor", { name: employee.fullName })}
                      aria-describedby={`${descriptionId}${isLastOwner ? ` ${protectionId}` : ""}`}
                      disabled={isBusy}
                      id={selectId}
                      onChange={(event) => {
                        const role = employeeRoleSchema.safeParse(event.target.value);
                        if (!role.success) return;
                        setDraftRoles((current) => ({
                          ...current,
                          [employee.membershipId]: role.data,
                        }));
                        setResult(employee.membershipId, undefined);
                      }}
                      value={draftRole}
                    >
                      <option value="owner">{t("owner")}</option>
                      <option value="staff">{t("staff")}</option>
                    </select>
                    <button
                      aria-label={t("saveAccessFor", { name: employee.fullName })}
                      className="button button--secondary button--small"
                      disabled={isBusy || draftRole === employee.role || isLastOwnerDemotion}
                      onClick={() => requestRoleChange(employee)}
                      type="button"
                    >
                      {busyActions[employee.membershipId] === "role" ? t("saving") : t("saveAccess")}
                    </button>
                    <button
                      aria-describedby={isLastOwner ? protectionId : undefined}
                      aria-label={t("removeFor", { name: employee.fullName })}
                      className="button button--danger button--small employee-management__remove"
                      disabled={isBusy || isLastOwner}
                      onClick={() => setConfirmation({ employee, kind: "remove" })}
                      type="button"
                    >
                      {busyActions[employee.membershipId] === "remove" ? t("removing") : t("remove")}
                    </button>
                  </div>
                  <p className="employee-management__access-description" id={descriptionId}>
                    {draftRole === "owner" ? t("ownerDescription") : t("staffDescription")}
                  </p>
                  {isLastOwner ? (
                    <p className="employee-management__protection" id={protectionId}>
                      <ShieldAlert aria-hidden="true" size={15} strokeWidth={2.2} />
                      <span>{t("lastOwnerProtection")}</span>
                    </p>
                  ) : null}
                  {result ? (
                    <p
                      className={result.kind === "error"
                        ? "form-error employee-management__row-result"
                        : "save-status employee-management__row-result"}
                      role={result.kind === "error" ? "alert" : "status"}
                    >
                      {result.message}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {removalResult ? (
          <p className="save-status employee-management__card-result" role="status">
            {removalResult}
          </p>
        ) : null}
      </section>

      <dialog
        aria-labelledby="employee-access-confirmation-title"
        className="record-dialog employee-access-dialog"
        onClose={() => setConfirmation(null)}
        ref={confirmationDialog}
      >
        {confirmation ? (
          <div className="dialog-form">
            <header className="dialog-header">
              <h2 id="employee-access-confirmation-title">{confirmationTitle}</h2>
              <p>
                {confirmation.kind === "promote"
                  ? t("promoteDescription")
                  : confirmationIsSelf
                    ? t("removeSelfDescription")
                    : t("removeDescription")}
              </p>
            </header>
            <div className="dialog-actions">
              <button
                className="button button--secondary"
                onClick={() => setConfirmation(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button
                className={confirmation.kind === "remove"
                  ? "button button--danger-solid"
                  : "button"}
                onClick={confirmAction}
                type="button"
              >
                {confirmation.kind === "promote"
                  ? t("confirmPromotion")
                  : confirmationIsSelf
                    ? t("confirmRemoveSelf")
                    : t("confirmRemove")}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
