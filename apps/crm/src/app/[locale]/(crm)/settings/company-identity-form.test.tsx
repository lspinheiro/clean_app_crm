import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/company", () => ({
  updateCompanyIdentity: vi.fn(),
}));

import { CompanyIdentityForm } from "./company-identity-form";

describe("company identity settings", () => {
  it("keeps its save action in the identity card and enables it only after an edit", async () => {
    const user = userEvent.setup();
    render(
      <CompanyIdentityForm
        company={{
          abn: "51824753556",
          name: "Coastal Demo Cleaning",
          timezone: "Australia/Brisbane",
        }}
        logoUrl={null}
      />,
    );

    const identity = screen.getByRole("region", { name: "Business identity" });
    const save = within(identity).getByRole("button", { name: "Save business identity" });
    expect(save).toBeDisabled();

    await user.type(within(identity).getByLabelText("Company name"), " Pty Ltd");

    expect(save).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("recognises a logo selected before the client boundary hydrates", async () => {
    const props = {
      company: {
        abn: "51824753556",
        name: "Coastal Demo Cleaning",
        timezone: "Australia/Brisbane",
      },
      logoUrl: null,
    };
    const container = document.createElement("div");
    container.innerHTML = renderToString(<CompanyIdentityForm {...props} />);
    document.body.append(container);
    const fileInput = container.querySelector<HTMLInputElement>("#company-logo");
    if (!fileInput) throw new Error("Expected the company logo input");
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File([new Uint8Array(64)], "logo.png", { type: "image/png" })],
    });

    const root = hydrateRoot(container, <CompanyIdentityForm {...props} />);

    await waitFor(() => {
      expect(within(container).getByRole("button", { name: "Save business identity" }))
        .toBeEnabled();
    });

    await act(async () => root.unmount());
    container.remove();
  });
});
