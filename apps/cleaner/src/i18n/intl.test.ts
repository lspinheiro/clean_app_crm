import { describe, expect, it } from "vitest";

import { collatorFor, dateTimeFormatterFor, numberFormatterFor } from "./intl";

describe("Cleaner locale formatter caches", () => {
  it("reuses one collator per locale", () => {
    expect(collatorFor("en-AU")).toBe(collatorFor("en-AU"));
    expect(collatorFor("pt-BR")).toBe(collatorFor("pt-BR"));
    expect(collatorFor("en-AU")).not.toBe(collatorFor("pt-BR"));
  });

  it("reuses equivalent date and number formatters", () => {
    const dateOptions: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      timeZone: "Australia/Brisbane",
    };
    const numberOptions: Intl.NumberFormatOptions = { currency: "AUD", style: "currency" };

    expect(dateTimeFormatterFor("en-AU", dateOptions)).toBe(
      dateTimeFormatterFor("en-AU", { ...dateOptions }),
    );
    expect(numberFormatterFor("pt-BR", numberOptions)).toBe(
      numberFormatterFor("pt-BR", { ...numberOptions }),
    );
  });
});
