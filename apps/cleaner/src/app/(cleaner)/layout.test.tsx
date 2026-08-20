import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useCleaner: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("@/lib/auth/use-cleaner", () => ({ useCleaner: mocks.useCleaner }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: mocks.usePathname,
}));

import CleanerLayout from "./layout";

beforeEach(() => {
  mocks.useCleaner.mockReturnValue({
    status: "allowed",
    profile: { id: "cleaner-1", full_name: "Ana Souza", suburb: "Robina" },
  });
  mocks.usePathname.mockReturnValue("/board");
});

describe("CLE-24 the cleaner app has two places to be", () => {
  it("offers both tabs to a signed-in cleaner", () => {
    render(<CleanerLayout>{null}</CleanerLayout>);

    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("href", "/board");
    expect(screen.getByRole("link", { name: "My jobs" })).toHaveAttribute("href", "/my-jobs");
  });

  it("marks the tab she is on so she can tell where she is", () => {
    mocks.usePathname.mockReturnValue("/my-jobs");
    render(<CleanerLayout>{null}</CleanerLayout>);

    expect(screen.getByRole("link", { name: "My jobs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Board" })).not.toHaveAttribute("aria-current");
  });

  it("shows no tabs at all while the gate is still deciding", () => {
    mocks.useCleaner.mockReturnValue({ status: "checking" });
    render(<CleanerLayout>{null}</CleanerLayout>);

    expect(screen.queryByRole("link", { name: "Board" })).not.toBeInTheDocument();
  });
});
