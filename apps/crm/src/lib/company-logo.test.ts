import { afterEach, describe, expect, it, vi } from "vitest";

import { getCompanyLogoUrl } from "./company-logo";

function supabaseReturning(result: {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
}) {
  const createSignedUrl = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ createSignedUrl });
  return {
    client: { storage: { from } },
    createSignedUrl,
    from,
  };
}

describe("optional company logo URL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null without contacting Storage when no logo is configured", async () => {
    const { client, from } = supabaseReturning({ data: null, error: null });

    await expect(getCompanyLogoUrl(client, null)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the signed URL when Storage succeeds", async () => {
    const { client } = supabaseReturning({
      data: { signedUrl: "https://storage.example.test/logo" },
      error: null,
    });

    await expect(
      getCompanyLogoUrl(client, "company/logo-version.webp"),
    ).resolves.toBe("https://storage.example.test/logo");
  });

  it("falls back to null instead of taking down the CRM when Storage fails", async () => {
    const { client } = supabaseReturning({
      data: null,
      error: { message: "object not found" },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      getCompanyLogoUrl(client, "company/logo-version.webp"),
    ).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith("Company logo URL resolution failed.");
  });

  it("falls back to null when the Storage request throws", async () => {
    const { client, createSignedUrl } = supabaseReturning({
      data: null,
      error: null,
    });
    createSignedUrl.mockRejectedValueOnce(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      getCompanyLogoUrl(client, "company/logo-version.webp"),
    ).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith("Company logo URL resolution failed.");
  });
});
