import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithCleanerIntl as render } from "@/test/render";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getInstallStatus: vi.fn(),
  getPushSubscriptionState: vi.fn(),
  promptInstall: vi.fn(),
  replace: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  subscribeToPush: vi.fn(),
  subscribeToInstallStatus: vi.fn(),
  useCleaner: vi.fn(),
}));

vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));
vi.mock("@/lib/install", () => ({
  getInstallStatus: mocks.getInstallStatus,
  promptInstall: mocks.promptInstall,
  subscribeToInstallStatus: mocks.subscribeToInstallStatus,
}));
vi.mock("@/lib/push", () => ({
  getPushSubscriptionState: mocks.getPushSubscriptionState,
  subscribeToPush: mocks.subscribeToPush,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { signOut: mocks.signOut },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import ProfilePage from "./page";

type Profile = { full_name: string; phone: string | null; suburb: string | null };
type CompanyRow = {
  company_id: string | null;
  company_name: string | null;
  status: "active" | "removed" | null;
};

let profile: Profile;
let companies: CompanyRow[];

function profileQuery() {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
    }),
  };
}

function companiesQuery() {
  return {
    select: () => ({
      order: async () => ({ data: companies, error: null }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  profile = { full_name: "Ana Souza", phone: "0400 000 111", suburb: "Robina" };
  companies = [
    {
      company_id: "company-1",
      company_name: "Coastal Demo Cleaning",
      status: "active",
    },
  ];
  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", full_name: profile.full_name, suburb: profile.suburb },
  });
  mocks.from.mockImplementation((table: string) =>
    table === "profiles" ? profileQuery() : companiesQuery(),
  );
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.getInstallStatus.mockReturnValue("available");
  mocks.subscribeToInstallStatus.mockImplementation((listener: (status: string) => void) => {
    listener(mocks.getInstallStatus());
    return () => undefined;
  });
  mocks.getPushSubscriptionState.mockResolvedValue("unsubscribed");
  mocks.promptInstall.mockResolvedValue("accepted");
  mocks.subscribeToPush.mockResolvedValue(true);
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("CLE-26 cleaner profile", () => {
  it.each([
    ["en-AU" as const, "Your profile", "Full name", "Joined companies"],
    ["pt-BR" as const, "Seu perfil", "Nome completo", "Empresas conectadas"],
  ])("renders profile details and companies in %s", async (locale, title, nameLabel, companiesTitle) => {
    render(<ProfilePage />, { locale });

    expect(await screen.findByRole("heading", { name: title, level: 1 })).toBeVisible();
    expect(await screen.findByLabelText(nameLabel)).toHaveValue("Ana Souza");
    expect(screen.getByRole("heading", { name: companiesTitle })).toBeVisible();
    expect(screen.getByText("Coastal Demo Cleaning")).toBeVisible();
  });

  it("validates the same cleaner details as the join screen before saving", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(await screen.findByLabelText("Full name"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter your full name.");
    expect(mocks.rpc).not.toHaveBeenCalledWith("update_cleaner_profile", expect.anything());
  });

  it("saves trimmed profile details through the own-row RPC", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(await screen.findByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "  Ana Profile  ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("update_cleaner_profile", {
        full_name: "Ana Profile",
        phone: "0400 000 111",
        suburb: "Robina",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Profile saved");
  });

  it("reuses the join error vocabulary for a dead invitation code", async () => {
    const user = userEvent.setup();
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Invite code is no longer active" },
    });
    render(<ProfilePage />);

    await user.type(await screen.findByLabelText("Cleaner invitation code"), "OLD-CODE");
    await user.click(screen.getByRole("button", { name: "Join company" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This invite link is no longer in use. Ask the company for a new link.",
    );
  });

  it("joins another company with current details and refreshes the company list", async () => {
    const user = userEvent.setup();
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "join_company_pool") {
        companies = [
          ...companies,
          { company_id: "company-2", company_name: "Harbour Demo Cleaning", status: "active" },
        ];
        return {
          data: [
            { joined_company_id: "company-2", joined_company_name: "Harbour Demo Cleaning" },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    render(<ProfilePage />);

    await user.type(await screen.findByLabelText("Cleaner invitation code"), " harbr2demojoin99 ");
    await user.click(screen.getByRole("button", { name: "Join company" }));

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("join_company_pool", {
        invite_code: "HARBR2DEMOJOIN99",
        full_name: "Ana Souza",
        phone: "0400 000 111",
        suburb: "Robina",
      }),
    );
    expect(await screen.findByText("Harbour Demo Cleaning")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Joined Harbour Demo Cleaning");
  });

  it("reports an existing membership instead of claiming the company was newly joined", async () => {
    const user = userEvent.setup();
    mocks.rpc.mockResolvedValueOnce({
      data: [
        { joined_company_id: "company-1", joined_company_name: "Coastal Demo Cleaning" },
      ],
      error: null,
    });
    render(<ProfilePage />);

    await user.type(await screen.findByLabelText("Cleaner invitation code"), "COASTAL-AGAIN");
    await user.click(screen.getByRole("button", { name: "Join company" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "You already belong to Coastal Demo Cleaning.",
    );
    expect(screen.getAllByText("Coastal Demo Cleaning")).toHaveLength(1);
  });

  it("ignores incomplete rows returned by the nullable generated view type", async () => {
    companies.push({ company_id: null, company_name: null, status: null });

    render(<ProfilePage />);

    expect(await screen.findByText("Coastal Demo Cleaning")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows install and push state and re-offers both upgrades", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    expect(await screen.findByText("Notifications are off")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Install app" }));
    await user.click(screen.getByRole("button", { name: "Turn on notifications" }));

    expect(mocks.promptInstall).toHaveBeenCalledOnce();
    expect(mocks.subscribeToPush).toHaveBeenCalledOnce();
    expect(screen.getByText("Notifications are on")).toBeVisible();
  });

  it("does not report a browser install dismissal as an error", async () => {
    const user = userEvent.setup();
    mocks.promptInstall.mockImplementationOnce(async () => {
      mocks.getInstallStatus.mockReturnValue("unavailable");
      return "dismissed";
    });
    render(<ProfilePage />);

    await user.click(await screen.findByRole("button", { name: "Install app" }));

    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Use your browser menu/)).toBeVisible();
  });

  it("signs out from the profile and returns to the localised login", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/en-AU/login");
  });

  it("recovers when signing out rejects", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValueOnce(new Error("network down"));
    render(<ProfilePage />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not sign you out. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
