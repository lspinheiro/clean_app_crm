"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const destinations = [
  ["Roster", "/roster"],
  ["Jobs", "/jobs"],
  ["Clients", "/clients"],
  ["Pool", "/pool"],
  ["Money", "/money"],
] as const;

export function CrmNavigation() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Primary navigation" className="primary-navigation">
      {destinations.map(([label, href]) => {
        const isCurrent = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link aria-current={isCurrent ? "page" : undefined} href={href} key={href}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function CrmSettingsLink({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isCurrent = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      aria-label="Company settings"
      className="icon-button"
      href="/settings"
    >
      {children}
    </Link>
  );
}
