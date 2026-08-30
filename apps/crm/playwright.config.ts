import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/acceptance",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  // The suite drives `next dev`, which compiles each route on its first visit: a cold
  // /en-AU/roster answers in 2.2s here against 0.4s warm, and CI runs this suite about
  // twice as slowly. Playwright's 5s default therefore expires on the first navigation to
  // a route no earlier test reached, which is a property of the dev server rather than of
  // the behaviour under test. Waiting longer does not soften an assertion — every
  // expectation still has to come true — so the ceiling is raised instead of retrying.
  expect: { timeout: 15_000 },
  timeout: 60_000,
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
    // Read by next.config.ts to drop the dev-tools badge, which floats over the bottom-left
    // corner and can intercept clicks meant for the page. Passed through `env` rather than a
    // `VAR=x` command prefix so the suite still runs on Windows.
    env: { E2E_DISABLE_DEV_INDICATORS: "1" },
  },
});
