import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { setPreferredLocaleAction } from "./locale";

describe("setPreferredLocaleAction", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.rpc.mockReset();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("rejects unsupported locales before opening a database client", async () => {
    await expect(setPreferredLocaleAction("fr-FR")).resolves.toEqual({ ok: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each(["en-AU", "pt-BR"])("persists supported locale %s through the self RPC", async (locale) => {
    mocks.rpc.mockResolvedValue({ error: null });

    await expect(setPreferredLocaleAction(locale)).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_locale", {
      target_locale: locale,
    });
  });
});
