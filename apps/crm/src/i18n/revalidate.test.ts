import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { revalidateLocalizedPath } from "./revalidate";

describe("localized cache invalidation", () => {
  beforeEach(() => mocks.revalidatePath.mockReset());

  it("invalidates only the canonical localized page paths", () => {
    revalidateLocalizedPath("/jobs");

    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/en-AU/jobs"],
      ["/pt-BR/jobs"],
    ]);
  });

  it("does not multiply a root layout invalidation", () => {
    revalidateLocalizedPath("/", "layout");

    expect(mocks.revalidatePath.mock.calls).toEqual([["/", "layout"]]);
  });
});
