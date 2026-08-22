"use client";

import Image from "next/image";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { switchActiveCompany } from "@/app/actions/active-company";
import { Link } from "@/i18n/navigation";

export type CrmMembershipOption = {
  companyId: string;
  companyName: string;
  role: "owner" | "staff";
};

type CompanySwitcherProps = {
  activeCompanyId: string;
  activeCompanyName: string;
  activeLogoUrl: string | null;
  memberships: CrmMembershipOption[];
};

function CompanyMark({
  companyName,
  logoUrl,
}: {
  companyName: string;
  logoUrl?: string | null;
}) {
  const t = useTranslations("CompanySwitcher");
  return (
    <span className="company-switcher__mark">
      {logoUrl ? (
        <Image
          alt={t("companyLogo", { companyName })}
          fill
          sizes="32px"
          src={logoUrl}
          unoptimized
        />
      ) : (
        <Building2 aria-hidden="true" size={17} strokeWidth={2} />
      )}
    </span>
  );
}

function SwitchButton({
  children,
  descriptionId,
  label,
  pendingLabel,
}: {
  children: React.ReactNode;
  descriptionId: string;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-busy={pending}
      aria-describedby={descriptionId}
      aria-label={label}
      className="company-switcher__company"
      disabled={pending}
      type="submit"
    >
      {children}
      {pending ? (
        <span className="company-switcher__pending" role="status">
          {pendingLabel}
        </span>
      ) : null}
    </button>
  );
}

export function CompanySwitcher({
  activeCompanyId,
  activeCompanyName,
  activeLogoUrl,
  memberships,
}: CompanySwitcherProps) {
  const t = useTranslations("CompanySwitcher");
  const menuRef = useRef<HTMLDetailsElement>(null);
  const previousActiveCompanyId = useRef(activeCompanyId);
  const triggerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu?.open && !event.composedPath().includes(menu)) menu.open = false;
    }

    function closeFromKeyboard(event: KeyboardEvent) {
      const menu = menuRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      event.preventDefault();
      menu.open = false;
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  useEffect(() => {
    if (previousActiveCompanyId.current === activeCompanyId) return;
    previousActiveCompanyId.current = activeCompanyId;
    if (menuRef.current) menuRef.current.open = false;
  }, [activeCompanyId]);

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  function actionableItems() {
    return Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href]",
      ) ?? [],
    );
  }

  function focusFirstAction() {
    actionableItems()[0]?.focus();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    if (menuRef.current) menuRef.current.open = true;
    focusFirstAction();
  }

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = actionableItems();
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <details className="company-switcher" ref={menuRef}>
      <summary
        aria-label={t("currentCompany", { companyName: activeCompanyName })}
        className="company-switcher__trigger"
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        role="button"
      >
        <CompanyMark companyName={activeCompanyName} logoUrl={activeLogoUrl} />
        <span className="company-switcher__trigger-copy">
          <small>{t("label")}</small>
          <span>{activeCompanyName}</span>
        </span>
        <ChevronDown aria-hidden="true" className="company-switcher__chevron" size={17} />
      </summary>
      <div
        aria-label={t("yourCompanies")}
        className="company-switcher__panel"
        onKeyDown={handlePanelKeyDown}
        ref={panelRef}
        role="group"
      >
        <p className="company-switcher__heading">{t("yourCompanies")}</p>
        <div className="company-switcher__companies">
          {memberships.map((membership) => {
            const roleId = `company-switcher-role-${membership.companyId}`;
            const content = (
              <>
                <CompanyMark
                  companyName={membership.companyName}
                  logoUrl={membership.companyId === activeCompanyId ? activeLogoUrl : null}
                />
                <span className="company-switcher__company-copy">
                  <strong>{membership.companyName}</strong>
                  <span id={roleId}>{t(membership.role)}</span>
                </span>
                {membership.companyId === activeCompanyId ? (
                  <Check aria-hidden="true" className="company-switcher__check" size={18} />
                ) : null}
              </>
            );

            if (membership.companyId === activeCompanyId) {
              return (
                <div
                  aria-current="true"
                  className="company-switcher__company company-switcher__company--current"
                  key={membership.companyId}
                >
                  {content}
                </div>
              );
            }

            return (
              <form action={switchActiveCompany} key={membership.companyId}>
                <input name="companyId" type="hidden" value={membership.companyId} />
                <SwitchButton
                  descriptionId={roleId}
                  label={t("switchToCompany", { companyName: membership.companyName })}
                  pendingLabel={t("switching")}
                >
                  {content}
                </SwitchButton>
              </form>
            );
          })}
        </div>
        <div className="company-switcher__footer">
          <Link className="company-switcher__create" href="/companies/new" onClick={closeMenu}>
            <Plus aria-hidden="true" size={18} />
            <span>{t("createNew")}</span>
          </Link>
        </div>
      </div>
    </details>
  );
}
