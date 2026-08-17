import { describe, expect, it } from "vitest";

import { parseFirstAdminAcceptance } from "./schema";

describe("first-admin acceptance schema", () => {
  it("normalises the company identity and preserves a human-readable contact phone", () => {
    expect(
      parseFirstAdminAcceptance({
        abn: "53 004 085 616",
        companyName: "  New Coast Cleaning  ",
        confirmPassword: "safe-local-password",
        fullName: "  Ana Admin  ",
        locale: "pt-BR",
        password: "safe-local-password",
        phone: "  0412 345 678  ",
      }),
    ).toEqual({
      data: {
        abn: "53004085616",
        companyName: "New Coast Cleaning",
        confirmPassword: "safe-local-password",
        fullName: "Ana Admin",
        locale: "pt-BR",
        password: "safe-local-password",
        phone: "0412 345 678",
      },
      fieldErrors: {},
    });
  });

  it("returns field errors for every required value", () => {
    const result = parseFirstAdminAcceptance({
      abn: "123",
      companyName: "",
      confirmPassword: "",
      fullName: "",
      locale: "fr-FR",
      password: "short",
      phone: "",
    });

    expect(result.data).toBeNull();
    expect(result.fieldErrors).toMatchObject({
      abn: expect.any(String),
      companyName: expect.any(String),
      confirmPassword: expect.any(String),
      fullName: expect.any(String),
      locale: expect.any(String),
      password: expect.any(String),
      phone: expect.any(String),
    });
  });

  it("associates a password mismatch with the confirmation field", () => {
    const result = parseFirstAdminAcceptance({
      abn: "53004085616",
      companyName: "New Coast Cleaning",
      confirmPassword: "another-safe-password",
      fullName: "Ana Admin",
      locale: "en-AU",
      password: "safe-local-password",
      phone: "0412 345 678",
    });

    expect(result.data).toBeNull();
    expect(result.fieldErrors.confirmPassword).toBe("user.passwordsMustMatch");
  });
});
