import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importClientRow: vi.fn(),
  importSiteRow: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/import", () => ({
  importClientRow: mocks.importClientRow,
  importSiteRow: mocks.importSiteRow,
}));

import { ImportWorkspace } from "./import-workspace";

const clients = [
  {
    id: "10000000-0000-4000-8000-000000000301",
    name: "Oceanview Property Group",
    siteNames: ["Broadbeach Towers"],
  },
];

const success = {
  ok: true,
  fieldErrors: {},
  formError: null,
};

describe("CLE-71 import workspace", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.importClientRow.mockResolvedValue(success);
    mocks.importSiteRow.mockResolvedValue(success);
  });

  it("publishes both templates and states every required column", () => {
    render(<ImportWorkspace clients={clients} />);

    expect(screen.getByRole("link", { name: "Download client template" })).toHaveAttribute(
      "href",
      "/templates/clients-import.csv",
    );
    expect(screen.getByRole("link", { name: "Download site template" })).toHaveAttribute(
      "href",
      "/templates/sites-import.csv",
    );
    const clientFormat = screen.getByRole("region", { name: "Client CSV columns" });
    expect(within(clientFormat).getByText("name")).toBeInTheDocument();
    expect(within(clientFormat).getByText("Required")).toBeInTheDocument();
    const siteFormat = screen.getByRole("region", { name: "Site CSV columns" });
    for (const column of ["client_name", "name", "address", "suburb", "access_notes"]) {
      expect(within(siteFormat).getByText(column)).toBeInTheDocument();
    }
  });

  it("previews every row and writes nothing until confirmation", async () => {
    const user = userEvent.setup();
    render(<ImportWorkspace clients={clients} />);

    const fileInput = screen.getByLabelText("Client CSV file") as HTMLInputElement;
    await user.upload(
      fileInput,
      new File(
        [
          "name,contact_name,phone,notes\n",
          "North Offices,Morgan,07 5555 0101,\n",
          ",Missing Name,,\n",
          "Oceanview Property Group,,,\n",
        ],
        "clients.csv",
        { type: "text/csv" },
      ),
    );

    const preview = await screen.findByRole("table", { name: "Client import preview" });
    expect(fileInput.files?.[0]?.name).toBe("clients.csv");
    expect(within(preview).getByText("North Offices").closest("td")).toHaveAttribute(
      "data-label",
      "Client",
    );
    expect(within(preview).getByText("Enter a client name.").closest("td")).toHaveAttribute(
      "data-label",
      "Reason",
    );
    expect(screen.getAllByText("Ready")).toHaveLength(1);
    expect(screen.getAllByText("Failed")).toHaveLength(1);
    expect(screen.getAllByText("Skipped")).toHaveLength(1);
    expect(mocks.importClientRow).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeEnabled();
  });

  it("continues after row failures and exports the failed values for retry", async () => {
    mocks.importClientRow
      .mockResolvedValueOnce({
        ok: false,
        fieldErrors: {},
        formError: "The client could not be created. Please try again.",
      })
      .mockResolvedValueOnce({ ok: true, fieldErrors: {}, formError: null });
    const user = userEvent.setup();
    render(<ImportWorkspace clients={clients} />);

    await user.upload(
      screen.getByLabelText("Client CSV file"),
      new File(
        [
          "name,contact_name,phone,notes\n",
          "\"North, Corp\",Morgan,,\n",
          "Harbour Offices,,,\n",
          ",Missing Name,,\n",
          "Oceanview Property Group,,,\n",
        ],
        "clients.csv",
        { type: "text/csv" },
      ),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm import" }));

    await waitFor(() => expect(mocks.importClientRow).toHaveBeenCalledTimes(2));
    expect(mocks.importClientRow).toHaveBeenNthCalledWith(1, {
      name: "North, Corp",
      contactName: "Morgan",
      phone: "",
      notes: "",
    });
    expect(mocks.importClientRow).toHaveBeenNthCalledWith(2, {
      name: "Harbour Offices",
      contactName: "",
      phone: "",
      notes: "",
    });
    const results = screen.getByRole("region", { name: "Import results" });
    expect(within(results).getByText("1 created")).toBeInTheDocument();
    expect(within(results).getByText("1 skipped")).toBeInTheDocument();
    expect(within(results).getByText("2 failed")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    const failedDownload = within(results).getByRole("link", {
      name: "Download 2 failed rows",
    });
    expect(failedDownload).toHaveAttribute("download", "failed-clients.csv");
    expect(decodeURIComponent(failedDownload.getAttribute("href") ?? "")).toContain(
      "name,contact_name,phone,notes\r\n\"North, Corp\",Morgan,,",
    );
    expect(screen.queryByRole("button", { name: "Confirm import" })).not.toBeInTheDocument();
  });

  it("submits ready rows strictly one at a time and announces progress", async () => {
    let finishFirst: (result: typeof success) => void = () => undefined;
    const firstResult = new Promise<typeof success>((resolve) => {
      finishFirst = resolve;
    });
    mocks.importClientRow
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValueOnce(success);
    const user = userEvent.setup();
    render(<ImportWorkspace clients={clients} />);

    await user.upload(
      screen.getByLabelText("Client CSV file"),
      new File(
        [
          "name,contact_name,phone,notes\n",
          "North Offices,,,\n",
          "Harbour Offices,,,\n",
        ],
        "clients.csv",
        { type: "text/csv" },
      ),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm import" }));

    await waitFor(() => expect(mocks.importClientRow).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Importing 1 of 2");
    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Clients" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Sites" })).toBeDisabled();
    expect(screen.getByLabelText("Client CSV file")).toBeDisabled();
    expect(screen.getByRole("region", { name: "Import preview" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    finishFirst(success);
    await waitFor(() => expect(mocks.importClientRow).toHaveBeenCalledTimes(2));
  });

  it("imports a site through its resolved client without reusing client state", async () => {
    const user = userEvent.setup();
    render(<ImportWorkspace clients={clients} />);

    await user.click(screen.getByRole("radio", { name: "Sites" }));
    await user.upload(
      screen.getByLabelText("Site CSV file"),
      new File(
        [
          "client_name,name,address,suburb,access_notes\n",
          "Oceanview Property Group,Southport Office,20 Marine Parade,Southport,Use rear door\n",
        ],
        "sites.csv",
        { type: "text/csv" },
      ),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm import" }));

    await waitFor(() => {
      expect(mocks.importSiteRow).toHaveBeenCalledWith({
        clientId: "10000000-0000-4000-8000-000000000301",
        name: "Southport Office",
        address: "20 Marine Parade",
        suburb: "Southport",
        accessNotes: "Use rear door",
      });
    });
    expect(mocks.importClientRow).not.toHaveBeenCalled();
  });

  it("exports every original cell from an over-wide failed row", async () => {
    const user = userEvent.setup();
    render(<ImportWorkspace clients={clients} />);

    await user.click(screen.getByRole("radio", { name: "Sites" }));
    await user.upload(
      screen.getByLabelText("Site CSV file"),
      new File(
        [
          "client_name,name,address,suburb,access_notes\n",
          "Oceanview Property Group,Main Office,10 Surf Parade, Broadbeach,Southport,Rear door\n",
          "Oceanview Property Group,Valid Office,20 Marine Parade,Southport,Use rear door\n",
        ],
        "sites.csv",
        { type: "text/csv" },
      ),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm import" }));

    const results = await screen.findByRole("region", { name: "Import results" });
    const failedDownload = within(results).getByRole("link", {
      name: "Download 1 failed row",
    });
    expect(decodeURIComponent(failedDownload.getAttribute("href") ?? "")).toContain(
      "client_name,name,address,suburb,access_notes\r\n" +
        "Oceanview Property Group,Main Office,10 Surf Parade, Broadbeach,Southport,Rear door\r\n",
    );
  });

  it("rejects non-UTF-8 files instead of previewing corrupted values", async () => {
    const user = userEvent.setup();
    render(<ImportWorkspace clients={clients} />);
    const prefix = new TextEncoder().encode(
      "name,contact_name,phone,notes\nCaf",
    );
    const suffix = new TextEncoder().encode(" Nero,,,\n");
    const bytes = new Uint8Array(prefix.length + 1 + suffix.length);
    bytes.set(prefix);
    bytes[prefix.length] = 0xe9;
    bytes.set(suffix, prefix.length + 1);

    await user.upload(
      screen.getByLabelText("Client CSV file"),
      new File([bytes], "clients.csv", { type: "text/csv" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Re-save it as CSV UTF-8 and choose it again.",
    );
    expect(screen.queryByRole("table", { name: "Client import preview" })).not.toBeInTheDocument();
  });

  it("ignores a file read that finishes after the record type changes", async () => {
    let finishText: ((value: string) => void) | undefined;
    let finishBuffer: ((value: ArrayBuffer) => void) | undefined;
    const text = "name,contact_name,phone,notes\nNorth Offices,,,\n";
    const file = new File([text], "clients.csv", { type: "text/csv" });
    Object.defineProperties(file, {
      text: {
        value: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              finishText = resolve;
            }),
        ),
      },
      arrayBuffer: {
        value: vi.fn(
          () =>
            new Promise<ArrayBuffer>((resolve) => {
              finishBuffer = resolve;
            }),
        ),
      },
    });
    const user = userEvent.setup();
    render(<ImportWorkspace clients={clients} />);

    await user.upload(screen.getByLabelText("Client CSV file"), file);
    await waitFor(() => expect(finishText ?? finishBuffer).toBeTypeOf("function"));
    await user.click(screen.getByRole("radio", { name: "Sites" }));
    await act(async () => {
      finishText?.(text);
      finishBuffer?.(new TextEncoder().encode(text).buffer);
    });

    expect(screen.getByRole("radio", { name: "Sites" })).toBeChecked();
    expect(screen.queryByRole("table", { name: "Client import preview" })).not.toBeInTheDocument();
  });
});
