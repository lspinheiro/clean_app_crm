import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const cleanerEmail = "cleaner.two@clean-app.example.test";
const demoPassword = "local-demo-only";

async function setSavedLocale(locale: "en-AU" | "pt-BR") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase acceptance environment is not configured.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanerEmail,
    password: demoPassword,
  });
  if (signInError) throw signInError;
  const { error } = await supabase.rpc("set_preferred_locale", { target_locale: locale });
  if (error) throw error;
  await supabase.auth.signOut();
}

test.describe("@F15 bilingual Cleaner app", () => {
  test.beforeAll(() => setSavedLocale("en-AU"));
  test.afterAll(() => setSavedLocale("en-AU"));

  test("switches before sign-in without losing the invite task or entered values", async ({
    page,
  }) => {
    await page.goto("/en-AU/login?code=CLEAN1DEMOJOIN99");
    await page.getByLabel("Email").fill(cleanerEmail);
    await page.getByLabel("Password").fill(demoPassword);

    await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");

    await expect(page).toHaveURL(/\/pt-BR\/login\?code=CLEAN1DEMOJOIN99$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page).toHaveTitle("Entrar · The Clean Crew");
    await expect(page.getByLabel("E-mail")).toHaveValue(cleanerEmail);
    await expect(page.getByLabel("Senha")).toHaveValue(demoPassword);

    await page.getByLabel("E-mail").fill("email-invalido");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator(".form-error")).toHaveText(
      "Digite um endereço de e-mail válido.",
    );

    await page.goto("/pt-BR/rota-inexistente");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });

  test("uses the saved profile language after sign-in and keeps domain data unchanged", async ({
    page,
  }) => {
    await setSavedLocale("pt-BR");
    await page.goto("/en-AU/login");
    await page.getByLabel("Email").fill(cleanerEmail);
    await page.getByLabel("Password").fill(demoPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/pt-BR\/board$/);
    await expect(
      page.getByRole("heading", { name: "Serviços disponíveis", level: 1 }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("Limpeza padrão");
    await expect(page.locator("body")).toContainText("Coastal Demo Cleaning");
    for (const privateValue of ["10 Surf Parade", "Demo access notes", "07 5555 0101"]) {
      await expect(page.locator("body")).not.toContainText(privateValue);
    }

    await page.getByRole("combobox", { name: "Idioma" }).selectOption("en-AU");
    await expect(page).toHaveURL(/\/en-AU\/board$/);
    await expect(page.getByRole("heading", { name: "Open jobs", level: 1 })).toBeVisible();
  });
});
