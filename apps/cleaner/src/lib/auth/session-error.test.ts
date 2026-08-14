import { describe, expect, it } from "vitest";

import { isMissingSessionError, isStaleSessionError } from "./session-error";

const missing = { name: "AuthSessionMissingError", message: "Auth session missing!" };
const staleNotFound = {
  name: "AuthApiError",
  message: "Invalid Refresh Token: Refresh Token Not Found",
};
const staleRevoked = {
  name: "AuthApiError",
  message: "Invalid Refresh Token: Already Used",
};
const fatal = { name: "AuthApiError", message: "Database error querying schema" };

describe("CLE-19 session error classification", () => {
  it("treats no error as no problem", () => {
    expect(isMissingSessionError(null)).toBe(false);
    expect(isStaleSessionError(undefined)).toBe(false);
  });

  it("recognises a visitor who simply is not signed in", () => {
    expect(isMissingSessionError(missing)).toBe(true);
    expect(isStaleSessionError(missing)).toBe(false);
  });

  it("recognises a cookie whose refresh token no longer exists", () => {
    // A cookie left over from a rebuilt database, or a session revoked server-side.
    expect(isStaleSessionError(staleNotFound)).toBe(true);
    expect(isStaleSessionError(staleRevoked)).toBe(true);
    expect(isMissingSessionError(staleNotFound)).toBe(false);
  });

  it("does not swallow a real backend failure", () => {
    expect(isMissingSessionError(fatal)).toBe(false);
    expect(isStaleSessionError(fatal)).toBe(false);
  });
});
