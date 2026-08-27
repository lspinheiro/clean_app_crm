"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { createClient } from "@/lib/supabase/browser";

/**
 * Signing out in place, keeping the invitation in the address bar, mirrors `switchAccount()`
 * on the cleaner join screen. Landing on the sign-in page instead would drop the invitation
 * the visitor is holding, which is how the previous dead end started.
 *
 * `scope: "local"` ends this browser's session only: an admin who opened an invitee's link by
 * accident keeps their other devices.
 */
export function UseAnotherAccount() {
  const t = useTranslations("EmployeeInvitationAcceptance");
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function switchAccount() {
    setSwitching(true);
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // A refresh re-reads the session either way; a failed sign-out simply lands back here.
    }
    router.refresh();
    setSwitching(false);
  }

  return (
    <button
      className="button button--secondary"
      disabled={switching}
      onClick={() => void switchAccount()}
      type="button"
    >
      {t("useAnotherAccount")}
    </button>
  );
}
