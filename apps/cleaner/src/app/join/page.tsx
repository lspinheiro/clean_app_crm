import type { Metadata } from "next";

import {
  describeInviteProblem,
  describePoolSize,
  isInviteState,
  normaliseInviteCode,
  type InvitePreview,
} from "@/features/join/invite";
import { createClient } from "@/lib/supabase/server";

import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join a cleaner pool" };

const unknownInvite: InvitePreview = {
  state: "unknown",
  companyName: null,
  poolSize: 0,
};

async function loadInvite(code: string): Promise<InvitePreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cleaner_invite_preview", { invite_code: code });
  if (error) throw error;

  const row = data?.[0];
  if (!row || !isInviteState(row.state)) return unknownInvite;

  return {
    state: row.state,
    companyName: row.company_name ?? null,
    poolSize: row.pool_size,
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="screen">
      <span className="brand-lockup">
        <span aria-hidden="true" className="brand-mark">
          CA
        </span>
        Clean App
      </span>
      {children}
    </main>
  );
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: rawCode } = await searchParams;
  const code = normaliseInviteCode(rawCode ?? "");

  if (!code) {
    return (
      <Shell>
        <h1 className="screen-title">We cannot open this invite</h1>
        <div className="invite-problem" role="alert">
          <p>This invite link is missing its code. Ask the company to send the link again.</p>
        </div>
      </Shell>
    );
  }

  const invite = await loadInvite(code);

  if (invite.state !== "active") {
    return (
      <Shell>
        <h1 className="screen-title">We cannot open this invite</h1>
        <div className="invite-problem" role="alert">
          <p>{describeInviteProblem(invite)}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div>
        <h1 className="screen-title">Join the cleaner pool</h1>
        <p className="screen-lead">It takes about a minute. Then you can see their open jobs.</p>
      </div>
      <div className="invite-card">
        <span className="invite-card__company">{invite.companyName}</span>
        <span className="invite-card__pool">{describePoolSize(invite.poolSize)}</span>
      </div>
      <JoinForm code={code} />
    </Shell>
  );
}
