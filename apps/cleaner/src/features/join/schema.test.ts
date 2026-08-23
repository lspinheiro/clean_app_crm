import { describe, expect, it } from "vitest";

import { registrationKeySchema } from "./schema";

const valid = {
  fullName: "Ana Silva",
  email: "ana@example.test",
  password: "a-long-enough-password",
  phone: "0400 000 111",
  suburb: "Southport",
};

function firstError(input: Record<string, unknown>) {
  const result = registrationKeySchema.safeParse(input);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? null;
}

describe("CLE-19 registration form", () => {
  it("accepts a complete registration", () => {
    const result = registrationKeySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("trims the values it stores", () => {
    const result = registrationKeySchema.safeParse({
      ...valid,
      fullName: "  Ana Silva  ",
      suburb: " Southport ",
    });
    expect(result.success && result.data.fullName).toBe("Ana Silva");
    expect(result.success && result.data.suburb).toBe("Southport");
  });

  it("asks for a full name in plain English", () => {
    expect(firstError({ ...valid, fullName: " " })).toBe("validationFullName");
  });

  it("asks for a valid email", () => {
    expect(firstError({ ...valid, email: "not-an-email" })).toBe("validationEmail");
  });

  it("asks for a password long enough for Supabase to accept", () => {
    expect(firstError({ ...valid, password: "short" })).toBe("validationPassword");
  });

  it("asks for a phone number", () => {
    expect(firstError({ ...valid, phone: " " })).toBe("validationPhone");
  });

  it("accepts phone numbers written the way people write them", () => {
    for (const phone of ["0400 000 111", "+61 400 000 111", "(07) 5555 1234"]) {
      expect(registrationKeySchema.safeParse({ ...valid, phone }).success).toBe(true);
    }
  });

  it("rejects a phone number with too few digits", () => {
    expect(firstError({ ...valid, phone: "12345" })).toBe("validationPhoneDigits");
  });

  it("asks for a suburb", () => {
    expect(firstError({ ...valid, suburb: " " })).toBe("validationSuburb");
  });
});
