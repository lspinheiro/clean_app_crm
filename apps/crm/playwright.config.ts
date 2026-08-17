import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
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
    ...devices["Desktop Chrome"],
    channel: "chrome",
  },
  webServer: {
    command: "pnpm exec next dev --webpack -p 3100",
    url: `${baseURL}/en-AU/login`,
    reuseExistingServer,
    timeout: 120_000,
  },
});
