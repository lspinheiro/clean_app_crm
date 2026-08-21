"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

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
  employees: EmployeeListItem[];
};

type Result =
  | { kind: "error"; message: string }
  | { kind: "success"; message: string }
  | null;

export function EmployeeManagement({ employees }: EmployeeManagementProps) {
  const locale = useLocale();
  const t = useTranslations("EmployeeManagement");
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<{
    kind: "remove" | "role";
    membershipId: string;
  } | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, "owner" | "staff">>(() =>
    Object.fromEntries(employees.map((employee) => [employee.membershipId, employee.role])),
  );
  const [result, setResult] = useState<Result>(null);
  const [pending, startTransition] = useTransition();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Brisbane",
    year: "numeric",
  });

  function changeRole(employee: EmployeeListItem) {
    const role = draftRoles[employee.membershipId] ?? employee.role;
    setBusyAction({ kind: "role", membershipId: employee.membershipId });
    setResult(null);
    startTransition(async () => {
      const nextResult = await changeEmployeeRoleAction({
        membershipId: employee.membershipId,
        role,
      });
      setBusyAction(null);
      if (!nextResult.ok) {
        setDraftRoles((current) => ({
          ...current,
          [employee.membershipId]: employee.role,
        }));
        setResult({
          kind: "error",
          message: localiseUserMessage(nextResult.formError, locale) ?? t("failed"),
        });
        return;
      }
      setResult({ kind: "success", message: t("roleUpdated") });
      router.refresh();
    });
  }

  function remove(employee: EmployeeListItem) {
    setBusyAction({ kind: "remove", membershipId: employee.membershipId });
    setResult(null);
    startTransition(async () => {
      const nextResult = await removeEmployeeAction({
        membershipId: employee.membershipId,
      });
      setBusyAction(null);
      if (!nextResult.ok) {
        setResult({
          kind: "error",
          message: localiseUserMessage(nextResult.formError, locale) ?? t("failed"),
        });
        return;
      }
      setResult({ kind: "success", message: t("removed") });
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="employee-management-heading"
      className="settings-card employee-management"
    >
      <div className="employee-management__heading">
        <div>
          <h2 id="employee-management-heading">{t("title")}</h2>
          <p>{t("description")}</p>
        </div>
        <span className="employee-management__count">{t("count", { count: employees.length })}</span>
      </div>

      {result ? (
        <p
          className={result.kind === "error" ? "form-error" : "save-status"}
          role={result.kind === "error" ? "alert" : "status"}
        >
          {result.message}
        </p>
      ) : null}

      <div aria-label={t("listLabel")} className="employee-management__list">
        {employees.map((employee) => {
          const selectId = `employee-role-${employee.membershipId}`;
          const isBusy = pending && busyAction?.membershipId === employee.membershipId;
          return (
            <div
              aria-label={employee.fullName}
              className="employee-management__row"
              key={employee.membershipId}
              role="group"
            >
              <div className="employee-management__identity">
                <strong>{employee.fullName}</strong>
                <a href={`mailto:${employee.email}`}>{employee.email}</a>
                <span>{t("joined", { date: dateFormatter.format(new Date(employee.joinedAt)) })}</span>
              </div>
              <div className="employee-management__role">
                <label className="visually-hidden" htmlFor={selectId}>
                  {t("roleFor", { name: employee.fullName })}
                </label>
                <select
                  disabled={pending}
                  id={selectId}
                  onChange={(event) => {
                    const role = employeeRoleSchema.safeParse(event.target.value);
                    if (!role.success) return;
                    setDraftRoles((current) => ({
                      ...current,
                      [employee.membershipId]: role.data,
                    }));
                  }}
                  value={draftRoles[employee.membershipId] ?? employee.role}
                >
                  <option value="owner">{t("owner")}</option>
                  <option value="staff">{t("staff")}</option>
                </select>
                <button
                  aria-label={t("saveRoleFor", { name: employee.fullName })}
                  className="button button--secondary button--small"
                  disabled={pending || (draftRoles[employee.membershipId] ?? employee.role) === employee.role}
                  onClick={() => changeRole(employee)}
                  type="button"
                >
                  {isBusy && busyAction?.kind === "role" ? t("saving") : t("saveRole")}
                </button>
              </div>
              <button
                aria-label={t("removeFor", { name: employee.fullName })}
                className="button button--danger button--small employee-management__remove"
                disabled={pending}
                onClick={() => remove(employee)}
                type="button"
              >
                {isBusy && busyAction?.kind === "remove" ? t("removing") : t("remove")}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
