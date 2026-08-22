self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string") return;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: typeof payload.url === "string" ? payload.url : "/board" },
      tag: `job-${payload.jobId}-${payload.type}`,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const fallbackUrl = new URL("/board", self.location.origin);
  let targetUrl = fallbackUrl;
  try {
    const candidate = new URL(event.notification.data?.url ?? "/board", self.location.origin);
    if (candidate.origin === self.location.origin) targetUrl = candidate;
  } catch {
    // The same-origin board fallback is already selected.
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url === targetUrl.href);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl.href);
    }),
  );
});
