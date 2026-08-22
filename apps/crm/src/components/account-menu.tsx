"use client";

import { CircleUserRound, LogOut, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/actions/auth";
import { Link, usePathname } from "@/i18n/navigation";

type AccountMenuProps = {
  profileEmail?: string;
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

export function AccountMenu({
  profileEmail,
  profileName,
}: AccountMenuProps) {
  const t = useTranslations("Navigation");
  const pathname = usePathname() ?? "";
  const menuRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const settingsCurrent = pathname === "/settings" || pathname.startsWith("/settings/");

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

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }

  return (
    <details className="account-menu" ref={menuRef}>
      <summary
        aria-label={t("accountMenu")}
        className="icon-button account-menu__trigger"
        ref={triggerRef}
        role="button"
      >
        <CircleUserRound aria-hidden="true" size={22} strokeWidth={2.15} />
      </summary>
      <div className="account-menu__panel">
        <div className="account-menu__identity">
          <strong>{profileName}</strong>
          {profileEmail ? <span>{profileEmail}</span> : null}
        </div>
        <div className="account-menu__actions">
          <Link
            aria-current={settingsCurrent ? "page" : undefined}
            className="account-menu__settings-link"
            href="/settings"
            onClick={closeMenu}
          >
            <Settings aria-hidden="true" size={17} />
            <span>{t("settings")}</span>
          </Link>
        </div>
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
