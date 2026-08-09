import { describe, expect, it, vi } from "vitest";

import {
  companyLogoCompressionOptions,
  compressCompanyLogo,
} from "./compress-logo";

describe("company logo compression", () => {
  it("converts an allowed image into the bounded WebP upload contract", async () => {
    const source = new File([new Uint8Array(800_000)], "logo.png", { type: "image/png" });
    const compressed = new File([new Uint8Array(120_000)], "compressed.webp", {
      type: "image/webp",
    });
    const compressor = vi.fn().mockResolvedValue(compressed);

    const result = await compressCompanyLogo(source, compressor);

    expect(compressor).toHaveBeenCalledWith(source, companyLogoCompressionOptions);
    expect(result.name).toBe("logo.webp");
    expect(result.type).toBe("image/webp");
    expect(result.size).toBe(120_000);
  });

  it("rejects SVG and other active-content formats before compression", async () => {
    const source = new File(["<svg />"], "logo.svg", { type: "image/svg+xml" });
    const compressor = vi.fn();

    await expect(compressCompanyLogo(source, compressor)).rejects.toThrow(
      "Choose a PNG, JPEG, or WebP image.",
    );
    expect(compressor).not.toHaveBeenCalled();
  });
});
