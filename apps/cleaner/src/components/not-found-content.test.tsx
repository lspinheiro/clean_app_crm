import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { NotFoundContent } from "./not-found-content";

beforeEach(() => {
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  document.documentElement.lang = "en-AU";
  window.history.replaceState({}, "", "/pt-BR/rota-inexistente?origem=teste");
});

describe("Cleaner missing routes", () => {
  it("uses the canonical path locale and lets the user switch without losing the URL", async () => {
    const user = userEvent.setup();
    render(<NotFoundContent />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeVisible(),
    );
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(document.title).toBe("Página não encontrada · The Clean Crew");

    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma" }), "en-AU");

    expect(window.location.pathname).toBe("/en-AU/rota-inexistente");
    expect(window.location.search).toBe("?origem=teste");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  it("uses the explicit cookie for an unprefixed missing route", async () => {
    document.cookie = "NEXT_LOCALE=pt-BR; path=/";
    window.history.replaceState({}, "", "/rota-inexistente");
    render(<NotFoundContent />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeVisible(),
    );
  });
});
