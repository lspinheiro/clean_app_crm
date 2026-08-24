import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ subscribeToPush: vi.fn() }));

vi.mock("@/lib/push", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/push")>();
  return { ...original, subscribeToPush: mocks.subscribeToPush };
});

import { PushOptInPrompt } from "./push-opt-in-prompt";
import {
  getPushPromptState,
  markPushPromptAfterJoin,
  PUSH_PROMPT_STATE,
} from "@/lib/push";
import { renderWithCleanerIntl as render } from "@/test/render";

beforeEach(() => {
  localStorage.clear();
  mocks.subscribeToPush.mockResolvedValue(true);
});

describe("CLE-25 post-join push opt-in", () => {
  it("renders only when a successful join marked the prompt pending", () => {
    const first = render(<PushOptInPrompt />);
    expect(screen.queryByRole("heading", { name: "Get job updates" })).not.toBeInTheDocument();

    first.unmount();
    markPushPromptAfterJoin();
    render(<PushOptInPrompt />);

    expect(screen.getByRole("heading", { name: "Get job updates" })).toBeVisible();
    expect(screen.getByText(/companies can tell you/i)).toBeVisible();
  });

  it("renders the Brazilian Portuguese prompt from the message catalogue", () => {
    markPushPromptAfterJoin();
    render(<PushOptInPrompt />, { locale: "pt-BR" });

    expect(screen.getByRole("heading", { name: "Receba atualizações dos serviços" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ativar notificações" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeVisible();
  });

  it("skip leaves the board content usable and prevents a repeat prompt", async () => {
    const user = userEvent.setup();
    markPushPromptAfterJoin();
    const first = render(
      <>
        <p>Open jobs are ready</p>
        <PushOptInPrompt />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(screen.getByText("Open jobs are ready")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Get job updates" })).not.toBeInTheDocument();
    expect(getPushPromptState()).toBe(PUSH_PROMPT_STATE.declined);
    first.unmount();
    render(<PushOptInPrompt />);
    expect(screen.queryByRole("heading", { name: "Get job updates" })).not.toBeInTheDocument();
  });

  it("accept subscribes and closes the prompt without gating the board", async () => {
    const user = userEvent.setup();
    markPushPromptAfterJoin();
    render(<PushOptInPrompt />);

    await user.click(screen.getByRole("button", { name: "Turn on notifications" }));

    expect(mocks.subscribeToPush).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Get job updates" })).not.toBeInTheDocument();
    expect(getPushPromptState()).toBe(PUSH_PROMPT_STATE.accepted);
  });

  it("keeps the prompt available and does not persist acceptance when opt-in fails", async () => {
    const user = userEvent.setup();
    mocks.subscribeToPush.mockResolvedValue(false);
    markPushPromptAfterJoin();
    render(
      <>
        <p>Open jobs are ready</p>
        <PushOptInPrompt />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Turn on notifications" }));

    expect(screen.getByText("Open jobs are ready")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Get job updates" })).toBeVisible();
    expect(screen.getByText(/could not turn on notifications/i)).toBeVisible();
    expect(getPushPromptState()).toBe(PUSH_PROMPT_STATE.pending);
  });
});
