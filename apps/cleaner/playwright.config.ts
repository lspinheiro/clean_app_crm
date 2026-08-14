import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3101";
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/acceptance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
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
