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
    // driving a form through userEvent. Several of those sit a little under the default on
    // an idle machine and cross it once 72 files are competing for cores — the suite passes
    // 310/310 with `--no-file-parallelism` and fails on a different test each parallel run,
    // always with "Test timed out in 5000ms". This buys headroom for the slow-but-correct
    // ones without serialising the suite; CI runners have far fewer cores than a dev box.
    testTimeout: 20_000,
    exclude: ["tests/acceptance/**", "node_modules/**", ".next/**"],
    server: {
      deps: {
        inline: ["next-intl"],
      },
    },
  },
});
