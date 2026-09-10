/**
 * Registers the app's service worker (public/sw.js).
 *
 * A failed registration must never break the app, so every failure path
 * is caught and logged, resolving to `null` instead of rejecting.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    return registration;
  } catch (error) {
    console.error("Service worker registration failed:", error);
    return null;
  }
}

/**
 * True when the app is running as an installed PWA (standalone display mode).
 *
 * Checks both the standard `display-mode: standalone` media query and the
 * legacy `navigator.standalone` flag, because older iOS Safari versions only
 * set the latter. This matters: iOS only permits web push from an app that
 * has been added to the home screen, so this is the load-bearing check the
 * settings UI uses to decide between showing an "enable notifications"
 * button or install instructions.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const matchesDisplayMode =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  const iosStandalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  return matchesDisplayMode || iosStandalone;
}
