import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOneOffJob: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/app/actions/jobs", () => ({
  createOneOffJob: mocks.createOneOffJob,
}));

import { NewJobForm } from "./new-job-form";

const clients = [
  {
    id: "10000000-0000-4000-8000-000000000301",
    name: "Oceanview Property Group",
    sites: [
      {
        id: "10000000-0000-4000-8000-000000000401",
        name: "Broadbeach Towers",
        suburb: "Broadbeach",
        defaultServiceId: "30000000-0000-4000-8000-000000000002",
        defaultDurationMinutes: 120,
        defaultRateCents: 15000,
      },
      {
        id: "10000000-0000-4000-8000-000000000402",
        name: "Southport Office",
        suburb: "Southport",
        defaultServiceId: "30000000-0000-4000-8000-000000000001",
        defaultDurationMinutes: 90,
        defaultRateCents: 12500,
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000302",
    name: "Palm Grove Dental",
    sites: [
      {
        id: "10000000-0000-4000-8000-000000000404",
        name: "Palm Grove Practice",
        suburb: "Robina",
        defaultServiceId: null,
        defaultDurationMinutes: null,
        defaultRateCents: null,
      },
    ],
  },
];

const services = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Office clean" },
  { id: "30000000-0000-4000-8000-000000000002", name: "Standard clean" },
  { id: "30000000-0000-4000-8000-000000000003", name: "Deep clean" },
];

describe("CLE-23 new job form", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createOneOffJob.mockResolvedValue({
      ok: true,
      fieldErrors: {},
      formError: null,
      jobId: "23000000-0000-4000-8000-000000000501",
    });
  });

  it("filters sites, prefills their defaults, and submits the admin's edits", async () => {
    const user = userEvent.setup();
    render(<NewJobForm clients={clients} services={services} />);

    await user.selectOptions(screen.getByLabelText("Client"), clients[0].id);
    expect(screen.getByRole("option", { name: "Palm Grove Practice — Robina" })).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("Site"),
      clients[0].sites[1].id,
    );

    expect(screen.getByLabelText("Service")).toHaveValue(
      "30000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByLabelText("Duration (hours)")).toHaveValue(1.5);
    expect(screen.getByLabelText("Cleaner pay per slot (AUD)")).toHaveValue(125);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Defaults loaded from Southport Office",
    );

    await user.selectOptions(
      screen.getByLabelText("Service"),
      "30000000-0000-4000-8000-000000000003",
    );
    await user.clear(screen.getByLabelText("Duration (hours)"));
    await user.type(screen.getByLabelText("Duration (hours)"), "2.5");
    await user.clear(screen.getByLabelText("Cleaner pay per slot (AUD)"));
    await user.type(screen.getByLabelText("Cleaner pay per slot (AUD)"), "175.50");
    await user.type(screen.getByLabelText("Client charge (AUD, admin only)"), "480");
    await user.type(screen.getByLabelText("Internal notes (admin only)"), "Kitchen detail");
    await user.click(screen.getByRole("button", { name: "Post to pool" }));

    await waitFor(() => expect(mocks.createOneOffJob).toHaveBeenCalledOnce());
    const submitted = Object.fromEntries(
      (mocks.createOneOffJob.mock.calls[0]?.[0] as FormData).entries(),
    );
    expect(submitted).toMatchObject({
      clientId: clients[0].id,
      siteId: clients[0].sites[1].id,
      serviceId: "30000000-0000-4000-8000-000000000003",
      durationHours: "2.5",
      cleanerPayAud: "175.5",
      clientChargeAud: "480",
      notes: "Kitchen detail",
      mode: "post",
    });
    expect(mocks.push).toHaveBeenCalledWith(
      "/jobs/23000000-0000-4000-8000-000000000501",
    );
  });

  it("puts a missing-selection error on Client while Site remains disabled", async () => {
    mocks.createOneOffJob.mockResolvedValue({
      ok: false,
      fieldErrors: { clientId: "user.chooseClient" },
      formError: null,
      jobId: null,
    });
    const user = userEvent.setup();
    render(<NewJobForm clients={clients} services={services} />);

    expect(
      screen.getByRole("heading", { name: "Choose the site" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const client = screen.getByLabelText("Client");
    const site = screen.getByLabelText("Site");
    expect(await screen.findByText("Choose a client.")).toBeInTheDocument();
    expect(client).toHaveAttribute("aria-invalid", "true");
    expect(client).toHaveAttribute(
      "aria-describedby",
      "new-job-clientId-error",
    );
    expect(site).toBeDisabled();
    expect(site).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Choose a site.")).not.toBeInTheDocument();
  });

  it("leaves missing defaults empty and renders field-level recovery guidance", async () => {
    mocks.createOneOffJob.mockResolvedValue({
      ok: false,
      fieldErrors: {
        serviceId: "user.chooseService",
        durationHours: "Enter a duration greater than zero.",
        cleanerPayAud: "user.cleanerPayPositive",
      },
      formError: null,
      jobId: null,
    });
    const user = userEvent.setup();
    render(<NewJobForm clients={clients} services={services} />);

    await user.selectOptions(screen.getByLabelText("Client"), clients[1].id);
    await user.selectOptions(screen.getByLabelText("Site"), clients[1].sites[0].id);

    expect(screen.getByLabelText("Service")).toHaveValue("");
    expect(screen.getByLabelText("Duration (hours)")).toHaveValue(null);
    expect(screen.getByLabelText("Cleaner pay per slot (AUD)")).toHaveValue(null);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No defaults are set for Palm Grove Practice",
    );

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Choose a service.")).toBeInTheDocument();
    expect(screen.getByLabelText("Service")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("submits Save draft with an explicit draft mode", async () => {
    const user = userEvent.setup();
    render(<NewJobForm clients={clients} services={services} />);

    await user.selectOptions(screen.getByLabelText("Client"), clients[0].id);
    await user.selectOptions(screen.getByLabelText("Site"), clients[0].sites[0].id);
    await user.type(screen.getByLabelText("Job date"), "2026-08-19");
    await user.type(screen.getByLabelText("Start time"), "08:30");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.createOneOffJob).toHaveBeenCalledOnce());
    const submitted = mocks.createOneOffJob.mock.calls[0]?.[0] as FormData;
    expect(submitted.get("mode")).toBe("draft");
  });
});
