import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCompanyAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({
  requireCompanyAdmin: mocks.requireCompanyAdmin,
}));

import { updateCompanyIdentity } from "./company";

const companyId = "10000000-0000-4000-8000-000000000010";
const previousLogoPath = `${companyId}/logo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
type ReservationArgs = {
  target_company_id: string;
  requested_object_name: string;
};

function validFormData() {
  const formData = new FormData();
  formData.set("name", "Coastal Demo Cleaning");
  formData.set("abn", "51824753556");
  formData.set(
    "logo",
    new File([new Uint8Array(128)], "logo.webp", { type: "image/webp" }),
  );
  return formData;
}

function arrangeSupabase(
  identityResult: {
    data: Array<{ previous_logo_path: string | null }> | null;
    error: { message: string } | null;
  },
) {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upload, remove });
  const reserveLogo = vi.fn(
    async (args: ReservationArgs) => ({
      data: args.requested_object_name,
      error: null,
    }),
  );
  const updateIdentity = vi.fn().mockResolvedValue(identityResult);
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    if (name === "reserve_company_logo_upload") {
      if (
        typeof args.target_company_id !== "string" ||
        typeof args.requested_object_name !== "string"
      ) {
        throw new Error("Invalid reservation arguments");
      }
      return reserveLogo({
        target_company_id: args.target_company_id,
        requested_object_name: args.requested_object_name,
      });
    }
    if (name === "update_company_identity") return updateIdentity(args);
    throw new Error(`Unexpected RPC: ${name}`);
  });
  mocks.requireCompanyAdmin.mockResolvedValue({
    company: { id: companyId, logo_path: previousLogoPath },
    supabase: { storage: { from }, rpc },
  });
  return { from, upload, remove, reserveLogo, rpc, updateIdentity };
}

describe("CLE-6 company identity transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a unique candidate instead of overwriting the active logo before the RPC", async () => {
    const { upload, remove } = arrangeSupabase({
      data: null,
      error: { message: "database unavailable" },
    });

    const result = await updateCompanyIdentity(validFormData());
    const uploadedPath = upload.mock.calls[0]?.[0];

    expect(result.ok).toBe(false);
    expect(uploadedPath).toMatch(
      new RegExp(`^${companyId}/logo-[0-9a-f-]{36}\\.webp$`),
    );
    expect(uploadedPath).not.toBe(previousLogoPath);
    expect(remove).not.toHaveBeenCalledWith([previousLogoPath]);
  });

  it("commits the exact uploaded path before removing the previous logo", async () => {
    const { upload, remove, reserveLogo, updateIdentity } = arrangeSupabase({
      data: [{ previous_logo_path: previousLogoPath }],
      error: null,
    });

    const result = await updateCompanyIdentity(validFormData());
    const uploadedPath = upload.mock.calls[0]?.[0];

    expect(result.ok).toBe(true);
    expect(reserveLogo).toHaveBeenCalledWith({
      target_company_id: companyId,
      requested_object_name: uploadedPath,
    });
    expect(updateIdentity).toHaveBeenCalledWith({
      target_company_id: companyId,
      company_name: "Coastal Demo Cleaning",
      company_abn: "51824753556",
      company_logo_path: uploadedPath,
    });
    expect(remove).toHaveBeenCalledWith([previousLogoPath]);
    expect(reserveLogo.mock.invocationCallOrder[0]).toBeLessThan(
      upload.mock.invocationCallOrder[0],
    );
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(
      updateIdentity.mock.invocationCallOrder[0],
    );
    expect(updateIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0],
    );
  });

  it("reports an indeterminate RPC response without deleting the previous logo", async () => {
    const { remove, updateIdentity, upload } = arrangeSupabase({
      data: null,
      error: null,
    });
    updateIdentity.mockRejectedValueOnce(new Error("response lost"));

    const result = await updateCompanyIdentity(validFormData());

    expect(result).toMatchObject({
      ok: false,
      formError: expect.stringContaining("could not be confirmed"),
    });
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalledWith([previousLogoPath]);
  });

  it("cleans a bounded stale candidate before reserving and uploading a new one", async () => {
    const { remove, reserveLogo, upload } = arrangeSupabase({ data: [], error: null });
    const staleCandidate = `${companyId}/logo-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
    reserveLogo
      .mockResolvedValueOnce({ data: staleCandidate, error: null })
      .mockImplementationOnce(async (args: ReservationArgs) => ({
        data: args.requested_object_name,
        error: null,
      }));

    const result = await updateCompanyIdentity(validFormData());
    const uploadedPath = upload.mock.calls[0]?.[0];

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenNthCalledWith(1, [staleCandidate]);
    expect(reserveLogo).toHaveBeenCalledTimes(2);
    expect(reserveLogo).toHaveBeenLastCalledWith({
      target_company_id: companyId,
      requested_object_name: uploadedPath,
    });
    expect(remove).toHaveBeenNthCalledWith(2, [previousLogoPath]);
  });

  it("keeps a committed save successful when old-object cleanup fails", async () => {
    const { remove } = arrangeSupabase({
      data: [{ previous_logo_path: previousLogoPath }],
      error: null,
    });
    remove.mockRejectedValueOnce(new Error("storage unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(updateCompanyIdentity(validFormData())).resolves.toMatchObject({
      ok: true,
      formError: null,
    });
    expect(consoleError).toHaveBeenCalledWith("Previous company logo cleanup failed.");
  });
});
