import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/clients", () => ({
  createClient: vi.fn(),
  createSite: vi.fn(),
}));

import { ClientsWorkspace } from "./clients-workspace";

describe("CLE-71 clients entry point", () => {
  it("offers a real link to the bulk import workflow", () => {
    render(<ClientsWorkspace clients={[]} />);

    expect(screen.getByRole("link", { name: "Import CSV" })).toHaveAttribute(
      "href",
      "/clients/import",
    );
  });
});
