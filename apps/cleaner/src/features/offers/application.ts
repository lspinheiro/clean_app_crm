import { isSessionError } from "@/lib/auth/session-error";

type DatabaseError = { message?: string } | null | undefined;

const offerRpcErrors = [
  "Offered cleaner access required",
  "Offer is no longer pending",
  "Series is no longer available",
  "No open slot is available",
  "Cleaner is unavailable for this time",
] as const;

export type OfferRpcError = (typeof offerRpcErrors)[number];
export type OfferFailure =
  | { kind: "session" }
  | { kind: "rpc"; message: OfferRpcError }
  | { kind: "unknown" };

function isOfferRpcError(message: string): message is OfferRpcError {
  return offerRpcErrors.some((candidate) => candidate === message);
}

export function describeOfferFailure(error: DatabaseError): OfferFailure {
  if (isSessionError(error)) return { kind: "session" };

  const message = error?.message ?? "";
  return isOfferRpcError(message)
    ? { kind: "rpc", message }
    : { kind: "unknown" };
}
