import { describe, expect, it } from "vitest";

import { describeOfferFailure } from "./application";

describe("CLE-57 offer RPC errors", () => {
  it.each([
    "Offered cleaner access required",
    "Offer is no longer pending",
    "Series is no longer available",
    "No open slot is available",
    "Cleaner is unavailable for this time",
  ])("preserves the delivered message verbatim: %s", (message) => {
    expect(describeOfferFailure({ message })).toEqual({ kind: "rpc", message });
  });

  it("routes session failures separately from offer copy", () => {
    expect(describeOfferFailure({ message: "JWT expired" })).toEqual({ kind: "session" });
  });

  it("does not expose an unknown Postgres error", () => {
    expect(describeOfferFailure({ message: "deadlock detected" })).toEqual({ kind: "unknown" });
  });
});
