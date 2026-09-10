import type { SupabaseClient } from "@supabase/supabase-js";

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  // Backed by a concrete ArrayBuffer so it satisfies BufferSource.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  return "Browser";
}

export type PushState =
  | "unsupported"
  | "needs-install"
  | "denied"
  | "granted"
  | "default";

/**
 * iOS only exposes PushManager to a home-screen-installed web app. In a plain
 * Safari tab the API is simply absent, so the settings screen must offer
 * install instructions rather than a button that cannot work.
 */
export function pushState(standalone: boolean): PushState {
  if (typeof window === "undefined") return "unsupported";

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const hasApi = "serviceWorker" in navigator && "PushManager" in window;

  if (isIOS && !standalone) return "needs-install";
  if (!hasApi) return "unsupported";
  // Without a VAPID public key there is nothing to subscribe against, and
  // PushManager.subscribe would throw on an undefined applicationServerKey.
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "granted";
  return "default";
}

/**
 * Must be called from a user gesture — browsers ignore permission requests
 * that aren't, and iOS is strict about it.
 */
export async function enablePush(
  sb: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "Push is not supported on this device." };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { ok: false, reason: "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." };
  }

  const registration = await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "Subscription is missing encryption keys." };
  }

  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device_label: deviceLabel(),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePush(
  sb: SupabaseClient,
  userId: string,
): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await sb
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint);

  await subscription.unsubscribe();
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}
