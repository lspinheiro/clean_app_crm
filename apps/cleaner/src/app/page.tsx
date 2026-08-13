"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/board");
  }, [router]);

  return (
    <main className="screen">
      <p className="screen-lead">Loading…</p>
    </main>
  );
}
