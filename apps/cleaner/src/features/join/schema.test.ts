import { describe, expect, it } from "vitest";

import { createRegistrationSchema, registrationSchema } from "./schema";

const valid = {
  fullName: "Ana Silva",
  email: "ana@example.test",
  password: "a-long-enough-password",
  phone: "0400 000 111",
  suburb: "Southport",
};

function firstError(input: Record<string, unknown>) {
  const result = registrationSchema.safeParse(input);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? null;
}

describe("CLE-19 registration form", () => {
  it("accepts a complete registration", () => {
    const result = registrationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("trims the values it stores", () => {
    const result = registrationSchema.safeParse({
      ...valid,
      fullName: "  Ana Silva  ",
      suburb: " Southport ",
    });
    expect(result.success && result.data.fullName).toBe("Ana Silva");
    expect(result.success && result.data.suburb).toBe("Southport");
  });

  it("asks for a full name in plain English", () => {
    expect(firstError({ ...valid, fullName: " " })).toBe("Enter your full name.");
  });

  it("asks for a valid email", () => {
    expect(firstError({ ...valid, email: "not-an-email" })).toBe(
      "Enter a valid email address.",
    );
  });

  it("asks for a password long enough for Supabase to accept", () => {
    expect(firstError({ ...valid, password: "short" })).toBe(
      "Use a password with at least 8 characters.",
    );
  });

  it("asks for a phone number", () => {
    expect(firstError({ ...valid, phone: " " })).toBe("Enter your phone number.");
  });

  it("accepts phone numbers written the way people write them", () => {
    for (const phone of ["0400 000 111", "+61 400 000 111", "(07) 5555 1234"]) {
      expect(registrationSchema.safeParse({ ...valid, phone }).success).toBe(true);
    }
  });

  it("rejects a phone number with too few digits", () => {
    expect(firstError({ ...valid, phone: "12345" })).toBe(
      "Enter a phone number with at least 8 digits.",
    );
  });

  it("asks for a suburb", () => {
    expect(firstError({ ...valid, suburb: " " })).toBe("Enter the suburb you work from.");
  });

  it("returns Brazilian Portuguese validation copy at the same trust boundary", () => {
    const result = createRegistrationSchema("pt-BR").safeParse({
      ...valid,
      email: "not-an-email",
    });

    expect(result.success ? null : result.error.issues[0]?.message).toBe(
      "Digite um endereço de e-mail válido.",
    );
  });
});
