import { getSupabaseClient } from "@/lib/supabase/client";

export const PUSH_PROMPT_STATE = {
  accepted: "accepted",
  declined: "declined",
  pending: "pending",
} as const;

const pushPromptStorageKey = "cleaner.push-opt-in";

type PushPromptState = (typeof PUSH_PROMPT_STATE)[keyof typeof PUSH_PROMPT_STATE];

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.serviceWorker !== undefined &&
    "PushManager" in window
  );
}

function vapidApplicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function subscribeToPush(): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!isPushSupported() || typeof Notification === "undefined" || !publicKey) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.register("/sw.js");
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidApplicationServerKey(publicKey),
      }));
    const serialised = subscription.toJSON();
    const endpoint = serialised.endpoint ?? subscription.endpoint;
    const p256dh = serialised.keys?.p256dh;
    const auth = serialised.keys?.auth;
    if (!endpoint || !p256dh || !auth) return false;

    const { error } = await getSupabaseClient().rpc("save_push_subscription", {
      endpoint,
      p256dh,
      auth,
    });
    if (error) throw error;
    return true;
  } catch {
    // Push is an optional upgrade. Permission, registration, or persistence failure must
    // never interrupt the board flow that offered it.
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    try {
      const { error } = await getSupabaseClient().rpc("delete_push_subscription", {
        target_endpoint: subscription.endpoint,
      });
      if (error) throw error;
    } finally {
      await subscription.unsubscribe();
    }
  } catch {
    // Unsubscribe remains best-effort for the same reason as registration: push cannot gate use.
  }
}

export type PushSubscriptionState = "subscribed" | "unsubscribed" | "unsupported";

export async function getPushSubscriptionState(): Promise<PushSubscriptionState> {
  if (!isPushSupported()) return "unsupported";

  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) return "unsubscribed";
    return (await registration.pushManager.getSubscription())
      ? "subscribed"
      : "unsubscribed";
  } catch {
    return "unsubscribed";
  }
}

function writePushPromptState(state: PushPromptState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(pushPromptStorageKey, state);
  } catch {
    // Storage-disabled browsers still reach and keep using the board.
  }
}

export function markPushPromptAfterJoin(): void {
  writePushPromptState(PUSH_PROMPT_STATE.pending);
}

export function finishPushPrompt(
  state: typeof PUSH_PROMPT_STATE.accepted | typeof PUSH_PROMPT_STATE.declined,
): void {
  writePushPromptState(state);
}

export function getPushPromptState(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(pushPromptStorageKey);
  } catch {
    return null;
  }
}
