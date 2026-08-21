"use client";

import { ChevronsUpDown, CircleUserRound, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useFormStatus } from "react-dom";

import { switchActiveCompany } from "@/app/actions/active-company";
import { signOutAction } from "@/app/actions/auth";

export type CrmMembershipOption = {
  companyId: string;
  companyName: string;
  role: "owner" | "staff";
};

type AccountMenuProps = {
  activeCompanyId: string;
  memberships: CrmMembershipOption[];
  profileName: string;
};

function MenuSubmitButton({
  children,
  className,
  label,
  onClick,
}: {
  children: React.ReactNode;
  className: string;
  label?: string;
  onClick?: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-label={label}
      className={className}
      disabled={pending}
      onClick={onClick}
      type="submit"
    >
      {children}
    </button>
  );
}

export function AccountMenu({ activeCompanyId, memberships, profileName }: AccountMenuProps) {
  const t = useTranslations("Navigation");
  const menuRef = useRef<HTMLDetailsElement>(null);
  const activeMembership = memberships.find(
    (membership) => membership.companyId === activeCompanyId,
  );
  const switchTargets = memberships.filter(
    (membership) => membership.companyId !== activeCompanyId,
  );

  return (
    <details className="account-menu" ref={menuRef}>
      <summary
        aria-label={t("accountMenu")}
        className="icon-button account-menu__trigger"
        role="button"
      >
        <CircleUserRound aria-hidden="true" size={22} strokeWidth={2.15} />
      </summary>
      <div className="account-menu__panel">
        <div className="account-menu__identity">
          <strong>{profileName}</strong>
          <span>{activeMembership?.companyName}</span>
        </div>
        {memberships.length >= 2 ? (
          <div aria-label={t("switchCompany")} className="account-menu__companies" role="group">
            <p>{t("switchCompany")}</p>
            {switchTargets.map((membership) => (
              <form action={switchActiveCompany} key={membership.companyId}>
                <input name="companyId" type="hidden" value={membership.companyId} />
                <MenuSubmitButton
                  className="account-menu__company-button"
                  label={t("switchToCompany", { companyName: membership.companyName })}
                  onClick={() => {
                    if (menuRef.current) menuRef.current.open = false;
                  }}
                >
                  <ChevronsUpDown aria-hidden="true" size={17} />
                  <span>{membership.companyName}</span>
                </MenuSubmitButton>
              </form>
            ))}
          </div>
        ) : null}
        <form action={signOutAction} className="account-menu__sign-out">
          <MenuSubmitButton className="account-menu__sign-out-button">
            <LogOut aria-hidden="true" size={17} />
            <span>{t("signOut")}</span>
          </MenuSubmitButton>
        </form>
      </div>
    </details>
  );
}
