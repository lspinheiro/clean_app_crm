import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3101";
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/acceptance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  // Matches the CRM config: `next dev` compiles a route on its first visit, and Playwright's
  // 5s default expires on that first navigation under CI's slower CPU. The assertions are
  // unchanged; only the time allowed for them to come true is.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The cleaner app is a phone-first PWA; acceptance runs at its 390px design width.
    ...devices["Pixel 7"],
    channel: "chrome",
  },
  webServer: {
    command: "pnpm exec next dev --webpack -p 3101",
    url: `${baseURL}/login`,
    reuseExistingServer,
    timeout: 120_000,
  },
});
