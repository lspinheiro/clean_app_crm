import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import "@testing-library/jest-dom/vitest";

// This project runs vitest without `globals`, so testing-library never registers its own
// auto-cleanup. Without this the DOM accumulates across tests in a file and queries start
// matching elements left behind by the previous case.
afterEach(() => {
  cleanup();
  document.documentElement.lang = "en-AU";
});
