import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  dismissInstallOffer,
  getInstallStatus,
  promptInstall,
  shouldOfferInstall,
  subscribeToInstallStatus,
} from "./install";

describe("CLE-26 install prompt", () => {
  beforeEach(() => {
    window.localStorage.removeItem("cleaner.install-offer");
  });

  it("keeps the browser prompt available to the profile after the board offer is skipped", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeToInstallStatus((status) => seen.push(status));
    const browserPrompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: browserPrompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });

    window.dispatchEvent(event);
    expect(shouldOfferInstall()).toBe(true);

    dismissInstallOffer();
    expect(shouldOfferInstall()).toBe(false);
    expect(getInstallStatus()).toBe("available");

    expect(await promptInstall()).toBe("accepted");
    expect(browserPrompt).toHaveBeenCalledOnce();
    expect(seen).toContain("available");
    unsubscribe();
  });

  it("distinguishes a dismissed browser prompt from an unavailable prompt", async () => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);

    expect(await promptInstall()).toBe("dismissed");
    expect(await promptInstall()).toBe("unavailable");
  });
});
