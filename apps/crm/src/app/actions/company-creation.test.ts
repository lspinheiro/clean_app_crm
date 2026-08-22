import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  createCompanyAction,
} from "./company-creation";
import { initialCompanyCreationState } from "@/features/company-creation/state";

function formData(name: string, abn: string) {
  const payload = new FormData();
  payload.set("companyName", name);
  payload.set("abn", abn);
  return payload;
}

describe("createCompanyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCompanyAdmin.mockResolvedValue({
      supabase: { rpc: mocks.rpc },
    });
  });

  it("validates before opening the authenticated mutation boundary", async () => {
    const result = await createCompanyAction(
      initialCompanyCreationState,
      formData("", "123"),
    );

    expect(mocks.requireCompanyAdmin).not.toHaveBeenCalled();
    expect(result.fieldErrors).toEqual({
      abn: "Enter exactly 11 digits.",
      companyName: "Enter a company name.",
    });
    expect(result.values).toEqual({ abn: "123", companyName: "" });
  });

  it("calls the atomic RPC with only canonical company identity and redirects", async () => {
    mocks.rpc.mockResolvedValue({
      data: "35000000-0000-4000-8000-000000000010",
      error: null,
    });

    await expect(createCompanyAction(
      initialCompanyCreationState,
      formData("  Harbour Services  ", "53 004 085 616"),
    )).rejects.toThrow("NEXT_REDIRECT:/en-AU/onboarding");

    expect(mocks.rpc).toHaveBeenCalledWith("create_company", {
      company_abn: "53004085616",
      company_name: "Harbour Services",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("maps a duplicate ABN to invitation guidance and preserves the form", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "companies_abn_key" },
    });

    const result = await createCompanyAction(
      initialCompanyCreationState,
      formData("Harbour Services", "53004085616"),
    );

    expect(result.fieldErrors.abn).toMatch(/already belongs to a company/i);
    expect(result.fieldErrors.abn).toMatch(/ask an owner for an invitation/i);
    expect(result.values).toEqual({
      abn: "53004085616",
      companyName: "Harbour Services",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe retry error for an unconfirmed database result", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "raw database detail" },
    });

    const result = await createCompanyAction(
      initialCompanyCreationState,
      formData("Harbour Services", "53004085616"),
    );

    expect(result.formError).toBe("The company could not be created. Try again.");
    expect(JSON.stringify(result)).not.toContain("raw database detail");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
