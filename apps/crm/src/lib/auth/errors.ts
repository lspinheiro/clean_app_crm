import {
  isAuthApiError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";

const deadSessionCodes = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_expired",
  "session_not_found",
  "user_not_found",
  "bad_jwt",
]);

export function isRecoverableAuthSessionError(error: unknown): boolean {
  return (
    isAuthSessionMissingError(error) ||
    (isAuthApiError(error) &&
      error.code !== undefined &&
      deadSessionCodes.has(error.code))
  );
}
