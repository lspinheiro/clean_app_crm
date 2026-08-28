import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@clean-app/db";

/**
 * What every seeded and fixture account signs in with. Documented as demo-only in
 * `packages/db/supabase/seed.sql`; nothing here may carry a real credential.
 */
export const demoPassword = "local-demo-only";

const localEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

let cachedAdmin: SupabaseClient<Database> | null = null;

/**
 * The service-role client the fixtures are built with. Resolved on first use rather than at
 * import: a spec that only drives the browser should not fail to load because the secret key
 * is absent from the environment.
 */
export function adminClient(): SupabaseClient<Database> {
  if (cachedAdmin) return cachedAdmin;
  const environment = localEnvironmentSchema.parse(process.env);
  cachedAdmin = createClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return cachedAdmin;
}

export async function signIn(page: Page, email: string, password: string = demoPassword) {
  await page.goto("/en-AU/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Returns only once the sign-in has landed, so a caller may assert where it landed without
  // that assertion's own timeout having to cover the sign-in. The first sign-in of a run pays
  // for `next dev` compiling both the action and its destination, which on a cold server
  // outlasts `expect.timeout` — waiting on the navigation puts that compile inside the test's
  // budget instead of failing whichever spec happens to run first.
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

export async function signOut(page: Page) {
  const signOutButton = page.getByRole("button", { name: "Sign out" });
  if (!(await signOutButton.isVisible())) {
    await page.getByRole("button", { name: "Account menu" }).click();
  }
  await signOutButton.click();
}

export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/en-AU\/settings$/);
}

export type AccountFixture = {
  email: string;
  fullName: string;
  /**
   * Omitted means "created by invitation and never finished": Auth holds the address with an
   * empty password, which is the state CLE-94 exists for — confirmed, and unable to sign in.
   * `createUser` cannot produce it, because GoTrue hashes the empty string it is handed; only
   * the invitation endpoint leaves the column empty, so that is the path taken here.
   */
  password?: string;
};

/** Creates each account in order and returns their profile ids in the same order. */
export async function createAccounts(accounts: readonly AccountFixture[]): Promise<string[]> {
  const admin = adminClient();
  const profileIds: string[] = [];
  for (const account of accounts) {
    if (account.password === undefined) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(account.email, {
        data: { full_name: account.fullName },
      });
      if (error) throw error;
      if (!data.user) throw new Error(`Could not invite ${account.email}`);
      // Following an invite link is what confirms the address, and a link scanner following it
      // for the invitee does the same. Confirming here reproduces that without spending a token.
      const { error: confirmError } = await admin.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });
      if (confirmError) throw confirmError;
      profileIds.push(data.user.id);
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      email_confirm: true,
      password: account.password,
      user_metadata: { full_name: account.fullName },
    });
    if (error) throw error;
    if (!data.user) throw new Error(`Could not create ${account.email}`);
    profileIds.push(data.user.id);
  }
  return profileIds;
}

/**
 * Removes fixture accounts by address. Every other fixture row hangs off the company, and
 * `invited_by_profile_id` is `on delete restrict`, so the company has to go first.
 */
export async function removeAccounts(emails: readonly string[]) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });
  if (error) throw error;
  const targets = new Set(emails);
  for (const user of data.users) {
    if (!user.email || !targets.has(user.email)) continue;
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
}

/** Cascades to memberships and invitations, which is why it runs before `removeAccounts`. */
export async function removeCompany(companyId: string) {
  const { error } = await adminClient().from("companies").delete().eq("id", companyId);
  if (error) throw error;
}

type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];
type EmployeeMembershipInsert =
  Database["public"]["Tables"]["employee_memberships"]["Insert"];
type EmployeeInvitationInsert =
  Database["public"]["Tables"]["employee_invitations"]["Insert"];

export async function insertCompany(company: CompanyInsert) {
  const { error } = await adminClient().from("companies").insert(company);
  if (error) throw error;
}

export async function insertMemberships(memberships: readonly EmployeeMembershipInsert[]) {
  const { error } = await adminClient().from("employee_memberships").insert([...memberships]);
  if (error) throw error;
}

export async function insertInvitations(invitations: readonly EmployeeInvitationInsert[]) {
  const { error } = await adminClient().from("employee_invitations").insert([...invitations]);
  if (error) throw error;
}
