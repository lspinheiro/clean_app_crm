import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

type ServiceWorkerListener = (event: Record<string, unknown>) => void;

async function loadServiceWorker() {
  const source = await readFile(path.resolve(process.cwd(), "public/sw.js"), "utf8");
  const listeners = new Map<string, ServiceWorkerListener>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const focus = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const workerGlobal = {
    location: { origin: "https://cleaner.example.test" },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn().mockResolvedValue([
        { url: "https://cleaner.example.test/my-jobs", focus },
      ]),
      openWindow,
    },
    addEventListener(type: string, listener: ServiceWorkerListener) {
      listeners.set(type, listener);
    },
  };
  vm.runInNewContext(source, { self: workerGlobal, URL });
  return { focus, listeners, openWindow, showNotification };
}

describe("CLE-25 cleaner service worker", () => {
  it("shows the title, body, and deep link delivered by push-dispatch", async () => {
    const worker = await loadServiceWorker();
    const waits: Promise<unknown>[] = [];
    worker.listeners.get("push")?.({
      data: {
        json: () => ({
          type: "job_posted",
          jobId: "job-1",
          title: "New job available",
          body: "Office clean · Palm Grove Practice, Robina",
          url: "/board",
        }),
      },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    });
    await Promise.all(waits);

    expect(worker.showNotification).toHaveBeenCalledWith("New job available", {
      body: "Office clean · Palm Grove Practice, Robina",
      data: { url: "/board" },
      tag: "job-job-1-job_posted",
    });
  });

  it("focuses an existing deep-link window when the notification is clicked", async () => {
    const worker = await loadServiceWorker();
    const waits: Promise<unknown>[] = [];
    const close = vi.fn();
    worker.listeners.get("notificationclick")?.({
      notification: { close, data: { url: "/my-jobs" } },
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    });
    await Promise.all(waits);

    expect(close).toHaveBeenCalledOnce();
    expect(worker.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("opens the offers route when an offer push is tapped", async () => {
    // push-dispatch does not yet emit offer_received; this covers routing, not end-to-end delivery.
    const worker = await loadServiceWorker();
    const pushWaits: Promise<unknown>[] = [];
    worker.listeners.get("push")?.({
      data: {
        json: () => ({
          type: "offer_received",
          jobId: "job-1",
          title: "New work offer",
          body: "Palm Grove Practice, Robina",
          url: "/offers",
        }),
      },
      waitUntil: (promise: Promise<unknown>) => pushWaits.push(promise),
    });
    await Promise.all(pushWaits);

    const clickWaits: Promise<unknown>[] = [];
    const close = vi.fn();
    worker.listeners.get("notificationclick")?.({
      notification: { close, data: { url: "/offers" } },
      waitUntil: (promise: Promise<unknown>) => clickWaits.push(promise),
    });
    await Promise.all(clickWaits);

    expect(worker.showNotification).toHaveBeenCalledWith(
      "New work offer",
      expect.objectContaining({ data: { url: "/offers" } }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(worker.openWindow).toHaveBeenCalledWith("https://cleaner.example.test/offers");
  });
});
