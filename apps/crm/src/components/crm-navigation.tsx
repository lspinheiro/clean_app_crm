"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link, usePathname } from "@/i18n/navigation";

const destinations = [
  ["roster", "/roster"],
  ["jobs", "/jobs"],
  ["clients", "/clients"],
  ["pool", "/pool"],
  ["money", "/money"],
] as const;

export function CrmNavigation() {
  const t = useTranslations("Navigation");
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label={t("primary")} className="primary-navigation">
      {destinations.map(([key, href]) => {
        const isCurrent = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link aria-current={isCurrent ? "page" : undefined} href={href} key={href}>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function CrmSettingsLink({ children }: { children: ReactNode }) {
  const t = useTranslations("Navigation");
  const pathname = usePathname() ?? "";
  const isCurrent = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      aria-label={t("settings")}
      className="icon-button"
      href="/settings"
    >
      {children}
    </Link>
  );
}
