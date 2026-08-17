import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  setPreferredLocale: vi.fn(),
}));

vi.mock("@/app/actions/locale", () => ({
  setPreferredLocaleAction: mocks.setPreferredLocale,
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=identity"),
}));

import { LanguageSwitcher } from "./language-switcher";

describe("LanguageSwitcher", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.setPreferredLocale.mockReset();
    document.documentElement.lang = "en-AU";
    document.cookie = "CLEAN_CREW_EXPLICIT_LOCALE=; Max-Age=0; Path=/";
  });

  it("preserves the current path and query when the language changes", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher currentLocale="en-AU" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    expect(mocks.setPreferredLocale).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("CLEAN_CREW_EXPLICIT_LOCALE=pt-BR");
    expect(document.documentElement).toHaveAttribute("lang", "pt-BR");
    expect(mocks.replace).toHaveBeenCalledWith("/settings?tab=identity", {
      locale: "pt-BR",
    });
  });

  it("restores controlled text and the selected radio after a locale remount", async () => {
    function ControlledDraft() {
      const [name, setName] = useState("");
      const [entity, setEntity] = useState("clients");
      const [, rerender] = useState(0);
      return (
        <>
          <input
            aria-label="Client name"
            name="name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <label>
            Clients
            <input
              checked={entity === "clients"}
              name="import-entity"
              onChange={() => setEntity("clients")}
              type="radio"
              value="clients"
            />
          </label>
          <label>
            Sites
            <input
              checked={entity === "sites"}
              name="import-entity"
              onChange={() => setEntity("sites")}
              type="radio"
              value="sites"
            />
          </label>
          <button onClick={() => rerender((value) => value + 1)} type="button">
            Rerender
          </button>
        </>
      );
    }

    const user = userEvent.setup();
    const firstRender = render(
      <>
        <ControlledDraft />
        <LanguageSwitcher currentLocale="en-AU" />
      </>,
    );
    await user.type(screen.getByRole("textbox", { name: "Client name" }), "Acme");
    await user.click(screen.getByRole("radio", { name: "Sites" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    firstRender.unmount();
    render(
      <>
        <ControlledDraft />
        <LanguageSwitcher currentLocale="pt-BR" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Rerender" }));
    expect(screen.getByRole("textbox", { name: "Client name" })).toHaveValue("Acme");
    expect(screen.getByRole("radio", { name: "Sites" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Clients" })).not.toBeChecked();
  });

  it("resynchronises the document language when the active locale changes", async () => {
    const view = render(<LanguageSwitcher currentLocale="en-AU" />);

    view.rerender(<LanguageSwitcher currentLocale="pt-BR" />);

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("lang", "pt-BR");
    });
  });

  it("restores entered form values after the locale route remounts", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <>
        <input aria-label="Email" name="email" />
        <input aria-label="Password" name="password" type="password" />
        <LanguageSwitcher currentLocale="en-AU" />
      </>,
    );
    await user.type(screen.getByRole("textbox", { name: "Email" }), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "temporary-secret");
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    firstRender.unmount();
    render(
      <>
        <input aria-label="Email" name="email" />
        <input aria-label="Password" name="password" type="password" />
        <LanguageSwitcher currentLocale="pt-BR" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue(
        "admin@example.com",
      );
      expect(screen.getByLabelText("Password")).toHaveValue("temporary-secret");
    });
  });

  it("persists an authenticated choice before navigating", async () => {
    mocks.setPreferredLocale.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LanguageSwitcher authenticated currentLocale="en-AU" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    await waitFor(() => {
      expect(mocks.setPreferredLocale).toHaveBeenCalledWith("pt-BR");
    });
    expect(mocks.replace).toHaveBeenCalledWith("/settings?tab=identity", {
      locale: "pt-BR",
    });
  });

  it("rolls the control back when persistence fails", async () => {
    mocks.setPreferredLocale.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<LanguageSwitcher authenticated currentLocale="en-AU" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "pt-BR");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The language preference could not be saved.",
    );
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en-AU");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
