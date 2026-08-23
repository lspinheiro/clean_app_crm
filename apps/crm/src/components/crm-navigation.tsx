"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

const destinations = [
  ["roster", "/roster"],
  ["jobs", "/jobs"],
  ["clients", "/clients"],
  ["cleaners", "/cleaners"],
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
