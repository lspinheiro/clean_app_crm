import { expect, test } from "@playwright/test";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";

test.describe("@F15 bilingual CRM", () => {
  test("localises validation and missing-route errors", async ({ page }) => {
    await page.goto("/pt-BR/login");
    await page.getByLabel("E-mail").fill("not-an-email");
    await page.getByLabel("Senha").fill("local-demo-only");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator(".auth-form").getByRole("alert")).toHaveText(
      "Informe um endereço de e-mail válido.",
    );

    await page.goto("/pt-BR/rota-inexistente");
    await expect(
      page.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });

  test("switches before sign-in, preserves entered data, and translates every CRM route", async ({
    context,
    page,
  }) => {
    await page.goto("/en-AU/login?return=roster");
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByLabel("Password").fill(demoPassword);

    await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");
    await expect(page).toHaveURL(/\/pt-BR\/login\?return=roster$/);
    await expect(page.getByLabel("E-mail")).toHaveValue(adminEmail);
    await expect(page.getByLabel("Senha")).toHaveValue(demoPassword);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    const preAuthCookies = await context.cookies();
    expect(preAuthCookies.find(({ name }) => name === "CLEAN_CREW_EXPLICIT_LOCALE")?.value)
      .toBe("pt-BR");
    expect(preAuthCookies.find(({ name }) => name === "NEXT_LOCALE")?.expires)
      .toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 60 * 60);

    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/roster$/);
    await expect.poll(async () => (
      (await context.cookies()).some(
        ({ name }) => name === "CLEAN_CREW_EXPLICIT_LOCALE",
      )
    )).toBe(false);

    const routeChecks = [
      ["/pt-BR/roster", "Escala"],
      ["/pt-BR/jobs", "Serviços"],
      ["/pt-BR/jobs/new", "Criar serviço"],
      ["/pt-BR/clients", "Clientes e locais"],
      ["/pt-BR/clients/import", "Importar clientes e locais"],
      ["/pt-BR/pool", "Banco de profissionais"],
      ["/pt-BR/money", "Financeiro"],
      ["/pt-BR/settings", "Configurações da empresa"],
    ] as const;

    for (const [route, heading] of routeChecks) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await expect(page.locator("body")).toContainText("The Clean Crew");
    }

    await page.goto(
      "/pt-BR/jobs/10000000-0000-4000-8000-000000000801",
    );
    await expect(page.getByRole("heading", { name: "Broadbeach Towers", level: 1 })).toBeVisible();
    await expect(page.getByText("Visão geral", { exact: true })).toBeVisible();

    await page.goto(
      "/pt-BR/clients/10000000-0000-4000-8000-000000000301",
    );
    await expect(
      page.getByRole("heading", { name: "Oceanview Property Group", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Profissionais preferenciais", { exact: true }).first()).toBeVisible();

    await page.goto("/pt-BR/settings");
    await page.getByRole("combobox", { name: "Idioma" }).selectOption("en-AU");
    await expect(page).toHaveURL(/\/en-AU\/settings$/);
    await expect(
      page.getByRole("heading", { name: "Company settings", level: 1 }),
    ).toBeVisible();
  });
});
