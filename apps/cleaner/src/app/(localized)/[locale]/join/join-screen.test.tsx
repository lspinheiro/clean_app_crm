import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CleanerIntlProvider } from "@/i18n/provider";
import { getPushPromptState, PUSH_PROMPT_STATE } from "@/lib/push";
import { cleanerTestMessages } from "@/test/render";

const coastalCompanyId = "10000000-0000-4000-8000-000000000001";
const harbourCompanyId = "20000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  membershipRows: [] as Array<{
    company_id: string;
    company_name: string;
    status: "active" | "removed";
  }>,
  profile: {
    data: {
      full_name: "Ana Souza",
      phone: "0400000000",
      preferred_locale: "pt-BR",
      suburb: "Robina",
    },
    error: null,
  },
  replace: vi.fn(),
  relationshipFilters: [] as Array<{ column: string; table: string; value: string }>,
  relationshipSelects: [] as Array<{ columns: string; table: string }>,
  requestRows: [] as Array<{
    company_id: string;
    company_name: string;
    join_request_state: "waiting" | "admitted" | "rejected";
  }>,
  rpc: vi.fn(),
  searchParams: new URLSearchParams("code=CLEAN1"),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithOAuth: mocks.signInWithOAuth,
      signOut: mocks.signOut,
      signUp: mocks.signUp,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

import { JoinScreen } from "./join-screen";

function postingRow(
  overrides: Partial<{
    cleaner_pay_cents: number | null;
    closing_reason: string | null;
    company_name: string | null;
    duration_minutes: number | null;
    frequency: "weekly" | "fortnightly" | null;
    intent: "expression_of_interest" | "one_time" | "regular" | null;
    local_start_time: string | null;
    public_description: string | null;
    scheduled_start: string | null;
    service_name: string | null;
    service_slug: string | null;
    state: string;
    suburb: string | null;
    weekday: number | null;
  }> = {},
) {
  return {
    cleaner_pay_cents: null,
    closing_reason: null,
    company_name: "Coastal Demo Cleaning",
    duration_minutes: null,
    frequency: null,
    intent: "expression_of_interest" as const,
    local_start_time: null,
    public_description: "Tell us where you like to clean and when you are available.",
    scheduled_start: null,
    service_name: null,
    service_slug: null,
    state: "active",
    suburb: null,
    weekday: null,
    // A compromised or widened response must not turn these into page content.
    address: "14 Ocean Avenue, Southport",
    access_notes: "Gate code 2468",
    client_phone: "07 5555 1234",
    client_charge_cents: 22000,
    internal_notes: "Do not show candidates",
    ...overrides,
  };
}

function renderJoin() {
  return render(
    <CleanerIntlProvider initialLocale="en-AU" initialMessages={cleanerTestMessages["en-AU"]}>
      <JoinScreen />
    </CleanerIntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  document.documentElement.lang = "en-AU";
  window.history.replaceState({}, "", "/en-AU/join?code=CLEAN1");
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 Safari/605.1.15",
  });
  mocks.searchParams = new URLSearchParams("code=CLEAN1");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "cleaner-1", email: "ana@example.test" } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.membershipRows = [];
  mocks.requestRows = [];
  mocks.relationshipFilters = [];
  mocks.relationshipSelects = [];
  mocks.from.mockImplementation((table: string) => {
    if (table === "cleaner_join_request_state" || table === "cleaner_pool_memberships") {
      const data = table === "cleaner_join_request_state"
        ? mocks.requestRows
        : mocks.membershipRows;
      const response = Promise.resolve({ data, error: null });
      const query = {
        eq: vi.fn((column: string, value: string) => {
          mocks.relationshipFilters.push({ column, table, value });
          return response;
        }),
        then: response.then.bind(response),
      };
      return {
        select: vi.fn((columns: string) => {
          mocks.relationshipSelects.push({ columns, table });
          return query;
        }),
      };
    }
    const query = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue(mocks.profile),
      select: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    return query;
  });
  mocks.rpc.mockImplementation((name: string) => {
    if (name === "posting_preview") {
      return Promise.resolve({
        data: [postingRow()],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe("Cleaner join language behavior", () => {
  it("uses localized application validation on both join forms", async () => {
    const { container } = renderJoin();

    await screen.findByRole("button", { name: "Send request" });
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
  });

  it("persists the language explicitly selected for an existing account", async () => {
    const user = userEvent.setup();
    renderJoin();

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Language" }),
      "pt-BR",
    );
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Idioma" }),
      "en-AU",
    );
    await user.click(await screen.findByRole("button", { name: "Send request" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Request sent"));
    expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
      target_locale: "en-AU",
    });
    expect(getPushPromptState()).toBe(PUSH_PROMPT_STATE.pending);
  });

  it("finishes joining when saving the selected locale fails", async () => {
    const user = userEvent.setup();
    document.cookie = "NEXT_LOCALE=en-AU; path=/";
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") {
        return Promise.resolve({
          data: [postingRow()],
          error: null,
        });
      }
      if (name === "set_preferred_locale") {
        return Promise.resolve({ data: null, error: new Error("preference unavailable") });
      }
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin();

    await user.click(await screen.findByRole("button", { name: "Send request" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Request sent"));
  });

  it("persists an authenticated language choice while the invite is still loading", async () => {
    const user = userEvent.setup();
    const preview = new Promise(() => undefined);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") return preview;
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin();
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
        target_locale: "pt-BR",
      }),
    );
  });
});

describe("CLE-61 public posting page", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("uses posting language when the URL has no code", () => {
    mocks.searchParams = new URLSearchParams();

    renderJoin();

    expect(screen.getByRole("heading", { name: "We cannot open this posting" })).toBeVisible();
    expect(screen.getByText(/posting link is missing its code/i)).toBeVisible();
  });

  it("uses posting language for an unknown code", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") {
        return Promise.resolve({
          data: [{ closing_reason: "unknown", state: "dead" }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderJoin();

    expect(await screen.findByRole("heading", { name: "We cannot open this posting" })).toBeVisible();
    expect(screen.getByText(/do not know this posting link/i)).toBeVisible();
  });

  it("renders an expression-of-interest posting before registration", async () => {
    mocks.rpc.mockImplementation((name: string, args: unknown) => {
      if (name === "posting_preview") {
        expect(args).toEqual({ posting_code: "CLEAN1" });
        return Promise.resolve({ data: [postingRow()], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderJoin();

    expect(await screen.findByRole("heading", { name: "Join Coastal Demo Cleaning" })).toBeVisible();
    expect(screen.getByText("Tell us where you like to clean and when you are available.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send request" })).toBeVisible();
    expect(screen.queryByText("14 Ocean Avenue, Southport")).not.toBeInTheDocument();
    expect(screen.queryByText("Gate code 2468")).not.toBeInTheDocument();
    expect(screen.queryByText("07 5555 1234")).not.toBeInTheDocument();
    expect(screen.queryByText("$220")).not.toBeInTheDocument();
    expect(screen.queryByText("Do not show candidates")).not.toBeInTheDocument();
  });

  it("renders a one-time posting from its public work fields before registration", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") {
        return Promise.resolve({
          data: [postingRow({
            cleaner_pay_cents: 14000,
            duration_minutes: 120,
            intent: "one_time",
            public_description: "A one-off office clean with an established crew.",
            scheduled_start: "2026-09-07T23:30:00.000Z",
            service_name: "Office cleaning",
            service_slug: "office-cleaning",
            suburb: "Southport",
          })],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderJoin();

    expect(await screen.findByRole("heading", { name: "One-time cleaning opportunity" })).toBeVisible();
    expect(screen.getByText("Office cleaning")).toBeVisible();
    expect(screen.getByText("Southport")).toBeVisible();
    expect(screen.getByText("$140")).toBeVisible();
    expect(screen.getByText(/Tue, 8 Sept.*9:30 am.*2 h/)).toBeVisible();
    expect(screen.getByText("A one-off office clean with an established crew.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply for this job" })).toBeVisible();
    expect(screen.queryByText("14 Ocean Avenue, Southport")).not.toBeInTheDocument();
    expect(screen.queryByText("Gate code 2468")).not.toBeInTheDocument();
  });

  it("renders a regular posting from its public recurring fields before registration", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") {
        return Promise.resolve({
          data: [postingRow({
            cleaner_pay_cents: 13000,
            duration_minutes: 90,
            frequency: "fortnightly",
            intent: "regular",
            local_start_time: "09:30:00",
            public_description: "An ongoing place with a friendly weekday crew.",
            service_name: "Commercial cleaning",
            service_slug: "commercial-cleaning",
            suburb: "Robina",
            weekday: 2,
          })],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderJoin();

    expect(await screen.findByRole("heading", { name: "Regular cleaning opportunity" })).toBeVisible();
    expect(screen.getByText("Commercial cleaning")).toBeVisible();
    expect(screen.getByText("Robina")).toBeVisible();
    expect(screen.getByText("$130")).toBeVisible();
    expect(screen.getByText(/Every fortnight.*Tuesday.*9:30 am.*1 h 30 min/)).toBeVisible();
    expect(screen.getByText("An ongoing place with a friendly weekday crew.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply for this job" })).toBeVisible();
  });

  it.each(["expired", "revoked", "cap_reached", "filled", "start_passed", "work_unavailable"])(
    "shows the same inactive state without a form when a posting is %s",
    async (closingReason) => {
      mocks.rpc.mockImplementation((name: string) => {
        if (name === "posting_preview") {
          return Promise.resolve({
            data: [postingRow({
              closing_reason: closingReason,
              company_name: null,
              intent: "one_time",
              public_description: null,
              state: "dead",
            })],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      renderJoin();

      expect(await screen.findByRole("heading", { name: "Invite no longer active" })).toBeVisible();
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
      expect(screen.queryByText(closingReason)).not.toBeInTheDocument();
    },
  );
});

describe("CLE-61 registration and repeat visitors", () => {
  function useOneTimePosting() {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") {
        return Promise.resolve({
          data: [postingRow({
            cleaner_pay_cents: 14000,
            duration_minutes: 120,
            intent: "one_time",
            public_description: "A one-off office clean with an established crew.",
            scheduled_start: "2026-09-07T23:30:00.000Z",
            service_name: "Office cleaning",
            service_slug: "office-cleaning",
            suburb: "Southport",
          })],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  }

  function useRegularPosting(applicationError?: string) {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") {
        return Promise.resolve({
          data: [postingRow({
            cleaner_pay_cents: 13000,
            duration_minutes: 90,
            frequency: "weekly",
            intent: "regular",
            local_start_time: "09:30:00",
            public_description: "An ongoing place with a friendly weekday crew.",
            service_name: "Commercial cleaning",
            service_slug: "commercial-cleaning",
            suburb: "Robina",
            weekday: 2,
          })],
          error: null,
        });
      }
      if (name === "apply_to_posting" && applicationError) {
        return Promise.resolve({ data: null, error: { message: applicationError } });
      }
      return Promise.resolve({ data: null, error: null });
    });
  }

  async function fillCleanerDetails(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText("Full name"), "New Cleaner");
    await user.type(screen.getByLabelText("Phone"), "0400 555 010");
    await user.type(screen.getByLabelText("Suburb"), "Miami");
  }

  it("registers before applying to a job-bound posting and sends the optional request note", async () => {
    const user = userEvent.setup();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.signUp.mockResolvedValue({
      data: { session: { access_token: "session" }, user: { id: "new-cleaner" } },
      error: null,
    });
    useOneTimePosting();
    renderJoin();

    await user.type(await screen.findByLabelText("Email"), "new.cleaner@example.test");
    await user.type(screen.getByLabelText("Password"), "local-demo-only");
    await fillCleanerDetails(user);
    await user.type(screen.getByLabelText("Note to the cleaning company (optional)"), "I can start next week.");
    await user.click(screen.getByRole("button", { name: "Apply for this job" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Application sent"));
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "new.cleaner@example.test",
      password: "local-demo-only",
      options: { data: { full_name: "New Cleaner", preferred_locale: "en-AU" } },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("apply_to_posting", {
      full_name: "New Cleaner",
      note: "I can start next week.",
      phone: "0400 555 010",
      posting_code: "CLEAN1",
      suburb: "Miami",
    });
    expect(mocks.signUp.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder.find((_, index) =>
        mocks.rpc.mock.calls[index]?.[0] === "apply_to_posting") ?? Number.POSITIVE_INFINITY,
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith("join_company_pool", expect.anything());
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("lets an existing staff cleaner create a plain application without a join request form", async () => {
    const user = userEvent.setup();
    mocks.membershipRows = [{
      company_id: coastalCompanyId,
      company_name: "Coastal Demo Cleaning",
      status: "active",
    }];
    useOneTimePosting();
    renderJoin();

    expect(await screen.findByText("You are already on this cleaning company’s staff.")).toBeVisible();
    expect(screen.queryByLabelText("Note to the cleaning company (optional)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply for this job" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Application sent"));
    expect(mocks.rpc).toHaveBeenCalledWith("apply_to_posting", {
      full_name: "Ana Souza",
      phone: "0400000000",
      posting_code: "CLEAN1",
      suburb: "Robina",
    });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("does not offer an impossible regular-posting application to existing staff", async () => {
    mocks.membershipRows = [{
      company_id: coastalCompanyId,
      company_name: "Coastal Demo Cleaning",
      status: "active",
    }];
    useRegularPosting();
    renderJoin();

    expect(await screen.findByText("You are already on this cleaning company’s staff.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Apply for this job" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("shows truthful copy if staff status races a regular-posting application", async () => {
    const user = userEvent.setup();
    useRegularPosting("Regular posting applications are not available to existing cleaner staff");
    renderJoin();

    await user.click(await screen.findByRole("button", { name: "Apply for this job" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are already on this cleaning company’s staff.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Please try again");
  });

  it("keeps the form and note when a shared company name spans multiple company ids", async () => {
    mocks.requestRows = [{
      company_id: coastalCompanyId,
      company_name: "Coastal Demo Cleaning",
      join_request_state: "rejected",
    }];
    mocks.membershipRows = [{
      company_id: harbourCompanyId,
      company_name: "Coastal Demo Cleaning",
      status: "active",
    }];
    renderJoin();

    expect(await screen.findByRole("button", { name: "Send request" })).toBeVisible();
    expect(screen.getByLabelText("Note to the cleaning company (optional)")).toBeVisible();
    expect(screen.queryByText("This cleaning company closed your request.")).not.toBeInTheDocument();
    expect(screen.queryByText("You are already on this cleaning company’s staff.")).not.toBeInTheDocument();
  });

  it("lets a person with a waiting request add a job application without registering again", async () => {
    const user = userEvent.setup();
    mocks.requestRows = [{
      company_id: coastalCompanyId,
      company_name: "Coastal Demo Cleaning",
      join_request_state: "waiting",
    }];
    useOneTimePosting();
    renderJoin();

    expect(await screen.findByText("Your request to join is waiting for the cleaning company.")).toBeVisible();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Note to the cleaning company (optional)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply for this job" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Application sent"));
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("apply_to_posting", expect.objectContaining({
      posting_code: "CLEAN1",
    }));
  });

  it("shows a rejected person the posting but no way to apply", async () => {
    mocks.requestRows = [{
      company_id: coastalCompanyId,
      company_name: "Coastal Demo Cleaning",
      join_request_state: "rejected",
    }];
    useOneTimePosting();
    renderJoin();

    expect(await screen.findByText("A one-off office clean with an established crew.")).toBeVisible();
    expect(await screen.findByText("This cleaning company closed your request.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Apply for this job" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("shows the request state instead of a form on a repeat expression-of-interest visit", async () => {
    mocks.requestRows = [{
      company_id: coastalCompanyId,
      company_name: "Coastal Demo Cleaning",
      join_request_state: "waiting",
    }];
    renderJoin();

    expect(await screen.findByRole("heading", { name: "Request waiting" })).toBeVisible();
    expect(screen.getByText("Your request to join is waiting for the cleaning company.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send request" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("selects relationship company ids and filters both cleaner views by company name", async () => {
    useOneTimePosting();
    renderJoin();

    await screen.findByRole("button", { name: "Apply for this job" });
    expect(mocks.relationshipSelects).toEqual([
      {
        columns: "company_id, company_name, join_request_state",
        table: "cleaner_join_request_state",
      },
      {
        columns: "company_id, company_name, status",
        table: "cleaner_pool_memberships",
      },
    ]);
    expect(mocks.relationshipFilters).toEqual([
      {
        column: "company_name",
        table: "cleaner_join_request_state",
        value: "Coastal Demo Cleaning",
      },
      {
        column: "company_name",
        table: "cleaner_pool_memberships",
        value: "Coastal Demo Cleaning",
      },
    ]);
  });

  it("removes the form when the posting closes between preview and apply", async () => {
    const user = userEvent.setup();
    useOneTimePosting();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "posting_preview") {
        return Promise.resolve({
          data: [postingRow({
            cleaner_pay_cents: 14000,
            duration_minutes: 120,
            intent: "one_time",
            scheduled_start: "2026-09-07T23:30:00.000Z",
            service_name: "Office cleaning",
            suburb: "Southport",
          })],
          error: null,
        });
      }
      if (name === "apply_to_posting") {
        return Promise.resolve({ data: null, error: { message: "Posting is no longer active" } });
      }
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin();

    await user.click(await screen.findByRole("button", { name: "Apply for this job" }));

    expect(await screen.findByRole("heading", { name: "Invite no longer active" })).toBeVisible();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });
});

describe("CLE-61 Google registration steering", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: null }, error: null });
  });

  it("starts Google authentication with a callback that preserves the posting code", async () => {
    const user = userEvent.setup();
    renderJoin();

    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: expect.stringMatching(
          /\/en-AU\/callback\?next=%2Fen-AU%2Fjoin%3Fcode%3DCLEAN1$/,
        ),
      },
    });
  });

  it("steers an in-app-browser visitor to email registration without offering blocked Google OAuth", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 WhatsApp/2.26.4 iPhone",
    });
    renderJoin();

    expect(await screen.findByText("Google sign-in does not work inside WhatsApp.")).toBeVisible();
    expect(screen.getByText("Open this link in Safari or Chrome, or create an account with email below.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeVisible();
  });
});
