import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@clean-app/db": fileURLToPath(
        new URL("../../packages/db/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    // Vitest defaults to 5s, which suits a fast unit test and not a jsdom component test
    // driving a form through userEvent. The join registration test types 89 characters across
    // six fields: 1.8s on its own, 3.6s once this suite's 37 files share a worker pool, and
    // past the 5s default once `pnpm test` adds the crm suite competing for the same cores.
    // Most of that cost is the suite contending with itself, so isolating it from crm would
    // not buy the margin back. Widening the budget weakens no assertion — every expectation
    // still has to come true — and matches apps/crm, which reached the same number after the
    // same fight.
    testTimeout: 20_000,
    exclude: ["tests/acceptance/**", "node_modules/**", ".next/**"],
  },
});
