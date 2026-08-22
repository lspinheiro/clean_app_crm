import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "./push";

const vapidPublicKey = "BEl62iUYgUivxIkv69yViEuiBIa40HI80cpc93kWvOOUm8eKgd6fChA9U3bQjKKBTHQ1GhLkM1qJfQJ0xg";

function installPushBrowser(subscription: PushSubscription | null) {
  const subscribe = vi.fn();
  const getSubscription = vi.fn().mockResolvedValue(subscription);
  const register = vi.fn().mockResolvedValue({ pushManager: { getSubscription, subscribe } });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class PushManager {},
  });
  return { getSubscription, register, subscribe };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapidPublicKey);
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  mocks.rpc.mockResolvedValue({ error: null });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
  Reflect.deleteProperty(window, "PushManager");
});

describe("CLE-25 push subscription", () => {
  it("registers the service worker, subscribes with VAPID, and persists browser keys", async () => {
    const browserSubscription = {
      endpoint: "https://push.example.test/device-a",
      toJSON: () => ({
        endpoint: "https://push.example.test/device-a",
        keys: { p256dh: "device-public-key", auth: "device-auth-key" },
      }),
      unsubscribe: vi.fn(),
    } as unknown as PushSubscription;
    const browser = installPushBrowser(null);
    browser.subscribe.mockResolvedValue(browserSubscription);

    await expect(subscribeToPush()).resolves.toBe(true);

    expect(Notification.requestPermission).toHaveBeenCalledOnce();
    expect(browser.register).toHaveBeenCalledWith("/sw.js");
    expect(browser.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(ArrayBuffer),
    });
    expect(mocks.rpc).toHaveBeenCalledWith("save_push_subscription", {
      endpoint: "https://push.example.test/device-a",
      p256dh: "device-public-key",
      auth: "device-auth-key",
    });
  });

  it("deletes the saved endpoint and unsubscribes the browser", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const browserSubscription = {
      endpoint: "https://push.example.test/device-a",
      toJSON: vi.fn(),
      unsubscribe,
    } as unknown as PushSubscription;
    installPushBrowser(browserSubscription);

    await unsubscribeFromPush();

    expect(mocks.rpc).toHaveBeenCalledWith("delete_push_subscription", {
      target_endpoint: "https://push.example.test/device-a",
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("no-ops without service-worker and PushManager support", async () => {
    expect(isPushSupported()).toBe(false);

    await expect(subscribeToPush()).resolves.toBe(false);
    await unsubscribeFromPush();

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns false when the Notification API is unavailable", async () => {
    installPushBrowser(null);
    vi.stubGlobal("Notification", undefined);

    await expect(subscribeToPush()).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["denied", "default"] as const)(
    "returns false for %s permission without registering or persisting",
    async (permission) => {
      const requestPermission = vi.fn().mockResolvedValue(permission);
      vi.stubGlobal("Notification", { requestPermission });
      const browser = installPushBrowser(null);

      await expect(subscribeToPush()).resolves.toBe(false);

      expect(requestPermission).toHaveBeenCalledOnce();
      expect(browser.register).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("returns false when subscription persistence fails", async () => {
    const browserSubscription = {
      endpoint: "https://push.example.test/device-a",
      toJSON: () => ({
        endpoint: "https://push.example.test/device-a",
        keys: { p256dh: "device-public-key", auth: "device-auth-key" },
      }),
    } as unknown as PushSubscription;
    installPushBrowser(browserSubscription);
    mocks.rpc.mockRejectedValue(new Error("database unavailable"));

    await expect(subscribeToPush()).resolves.toBe(false);
  });

  it("returns false for registration failures so push never gates the board", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn().mockRejectedValue(new Error("registration denied")) },
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: class PushManager {},
    });

    await expect(subscribeToPush()).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
