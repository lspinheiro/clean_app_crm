import { describe, expect, it } from "vitest";

import OnboardingHandoffPage from "./page";

describe("CLE-47 onboarding handoff", () => {
  it("keeps a stable guarded route and forwards to the current CRM entry until CLE-47 lands", async () => {
    await expect(OnboardingHandoffPage()).rejects.toThrow("NEXT_REDIRECT:/en-AU/roster");
  });
});
