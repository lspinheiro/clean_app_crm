"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCleaner } from "@/lib/auth/use-cleaner";

export default function CleanerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
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

  return children;
}
