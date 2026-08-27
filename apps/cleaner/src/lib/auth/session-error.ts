type SupabaseAuthError = { name?: string; message?: string } | null | undefined;

/** The visitor is simply not signed in. Expected on every anonymous request. */
export function isMissingSessionError(error: SupabaseAuthError): boolean {
  return error?.name === "AuthSessionMissingError";
}

/**
 * The cookie carries a refresh token the server no longer accepts — a rebuilt local
 * database, or a session revoked server-side. The visitor is anonymous, not broken, so the
 * app clears the cookie instead of failing the request.
 */
export function isStaleSessionError(error: SupabaseAuthError): boolean {
  if (!error || isMissingSessionError(error)) return false;
  return /refresh token/i.test(error.message ?? "");
}

/** Auth and PostgREST use different error objects for the same expired browser session. */
export function isSessionError(error: SupabaseAuthError): boolean {
  if (isMissingSessionError(error) || isStaleSessionError(error)) return true;
  return /(?:jwt.*(?:expired|invalid)|invalid.*jwt)/i.test(error?.message ?? "");
}
