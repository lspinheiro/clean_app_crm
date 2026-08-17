import { describe, expect, it, vi } from "vitest";

describe("localized Intl formatter caches", () => {
  it("reuses the money amount formatter for the same locale", async () => {
    vi.resetModules();
    const NativeNumberFormat = Intl.NumberFormat;
    const constructor = vi
      .spyOn(Intl, "NumberFormat")
      .mockImplementation(function NumberFormat(locale, options) {
        return new NativeNumberFormat(locale, options);
      });
    const { formatMoneyAmount } = await import("./money/format");

    formatMoneyAmount(12_000, "pt-BR");
    formatMoneyAmount(12_050, "pt-BR");

    expect(constructor).toHaveBeenCalledTimes(1);
    constructor.mockRestore();
  });

  it("reuses the job date formatter for the same locale", async () => {
    vi.resetModules();
    const NativeDateTimeFormat = Intl.DateTimeFormat;
    const constructor = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(function DateTimeFormat(locale, options) {
        return new NativeDateTimeFormat(locale, options);
      });
    const { formatJobDate } = await import("./jobs/format");

    formatJobDate("2026-08-09T22:00:00Z", "en-AU");
    formatJobDate("2026-08-10T22:00:00Z", "en-AU");

    expect(constructor).toHaveBeenCalledTimes(1);
    constructor.mockRestore();
  });
});
