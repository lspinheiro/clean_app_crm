import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const adminEmail = "admin@clean-app.example.test";
const demoPassword = "local-demo-only";

async function setSavedLocale(locale: "en-AU" | "pt-BR") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase acceptance environment is not configured.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: demoPassword,
  });
  if (signInError) throw signInError;
  const { error } = await supabase.rpc("set_preferred_locale", { target_locale: locale });
  if (error) throw error;
  await supabase.auth.signOut();
}

test.describe("@F15 bilingual CRM", () => {
  test.beforeAll(() => setSavedLocale("en-AU"));
  test.afterAll(() => setSavedLocale("en-AU"));

  test("localises validation and missing-route errors", async ({ page }) => {
    await page.goto("/pt-BR/login");
    await page.getByLabel("E-mail").fill("not-an-email");
    await page.getByLabel("Senha").fill("local-demo-only");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator("#email-error")).toHaveText(
      "Informe um endereço de e-mail válido.",
    );
    await expect(page.getByLabel("E-mail")).toHaveAttribute(
      "aria-describedby",
      "email-error",
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
    // This test walks every CRM route in pt-BR. Under the repo runner
    // (scripts/run-local-e2e.mjs, workers: 1, alphabetical) it lands last, after roughly
    // twenty specs have already compiled those routes, and it passed comfortably within a 60s
    // ceiling. Run this file on its own against a cold `next dev` and it compiles most of
    // those routes itself, which is the likely reason an isolated run can exhaust the ceiling
    // and surface as a teardown error on whichever assertion the deadline lands in. Run the
    // whole suite before treating that as a defect. The line below restates the 60s default
    // already set in playwright.config.ts.
    test.setTimeout(60_000);
    await page.goto("/en-AU/login?return=roster");
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByLabel("Password").fill(demoPassword);

    await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");
    await expect(page).toHaveURL(/\/pt-BR\/login\?return=roster$/);
    await expect(page.getByLabel("E-mail")).toHaveValue(adminEmail);
    await expect(page.getByLabel("Senha")).toHaveValue(demoPassword);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    const preAuthCookies = await context.cookies();
    expect(preAuthCookies.some(({ name }) => name === "CLEAN_CREW_EXPLICIT_LOCALE"))
      .toBe(false);
    expect(preAuthCookies.find(({ name }) => name === "NEXT_LOCALE")?.expires)
      .toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 60 * 60);

    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/en-AU\/roster$/);

    await page.goto("/en-AU/settings");
    await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");
    await expect(page).toHaveURL(/\/pt-BR\/settings$/);

    const routeChecks = [
      ["/pt-BR/roster", "Escala"],
      ["/pt-BR/jobs", "Serviços"],
      ["/pt-BR/jobs/new", "Criar serviço"],
      ["/pt-BR/clients", "Clientes e locais"],
      ["/pt-BR/clients/import", "Importar clientes e locais"],
      ["/pt-BR/cleaners", "Equipe de limpeza"],
      ["/pt-BR/money", "Financeiro"],
      ["/pt-BR/settings", "Configurações"],
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
    await expect(page.getByRole("heading", { name: "Candidaturas", level: 2 })).toBeVisible();

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
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible();
  });
});
