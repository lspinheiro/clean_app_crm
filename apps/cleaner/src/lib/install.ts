export type InstallStatus = "available" | "installed" | "unavailable";

type InstallChoice = { outcome: "accepted" | "dismissed" };
export type InstallPromptResult = InstallChoice["outcome"] | "unavailable";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const installOfferStorageKey = "cleaner.install-offer";
const listeners = new Set<(status: InstallStatus) => void>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listening = false;

function isStandalone() {
  if (typeof window === "undefined") return false;
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || iosNavigator.standalone === true;
}

function notify() {
  const status = currentStatus();
  listeners.forEach((listener) => listener(status));
}

function ensureListener() {
  if (typeof window === "undefined" || listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (rawEvent) => {
    const event = rawEvent as BeforeInstallPromptEvent;
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function currentStatus(): InstallStatus {
  if (isStandalone()) return "installed";
  return deferredPrompt ? "available" : "unavailable";
}

export function getInstallStatus(): InstallStatus {
  ensureListener();
  return currentStatus();
}

export function subscribeToInstallStatus(listener: (status: InstallStatus) => void) {
  ensureListener();
  listeners.add(listener);
  listener(currentStatus());
  return () => {
    listeners.delete(listener);
  };
}

export function shouldOfferInstall(): boolean {
  if (getInstallStatus() !== "available") return false;
  try {
    return window.localStorage.getItem(installOfferStorageKey) !== "declined";
  } catch {
    return true;
  }
}

export function dismissInstallOffer() {
  try {
    window.localStorage.setItem(installOfferStorageKey, "declined");
  } catch {
    // The optional install upgrade cannot gate the board when storage is unavailable.
  }
}

export async function promptInstall(): Promise<InstallPromptResult> {
  const prompt = deferredPrompt;
  if (!prompt) return "unavailable";
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice.outcome;
}
