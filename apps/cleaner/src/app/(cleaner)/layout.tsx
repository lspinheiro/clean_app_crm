"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCleaner } from "@/lib/auth/use-cleaner";

const tabs = [
  { href: "/board", label: "Board" },
  { href: "/my-jobs", label: "My jobs" },
] as const;

export default function CleanerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const cleaner = useCleaner();

  useEffect(() => {
    if (cleaner.status === "denied") router.replace("/login?error=not-authorised");
  }, [cleaner.status, router]);

  if (cleaner.status !== "allowed") {
    return (
      <main className="screen">
        <p className="screen-lead">Loading…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {children}
      <nav aria-label="Sections" className="tab-bar">
        {tabs.map((tab) => (
          <Link
            aria-current={pathname === tab.href ? "page" : undefined}
            className="tab-bar__tab"
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
