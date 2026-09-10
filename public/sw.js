// Dashboard service worker
// Hand-written, no build-plugin dependency (Workbox/Serwist deliberately avoided).
//
// Bump this constant to invalidate old caches on deploy.
const CACHE = "dashboard-v1";

const APP_SHELL = [
  "/",
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

const OFFLINE_URL = "/offline";

// ---------------------------------------------------------------------------
// install / activate
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll fails fast if any single request 404s; fall back to best-effort
      // per-URL caching so one missing asset doesn't block install entirely.
      try {
        await cache.addAll(APP_SHELL);
      } catch (err) {
        await Promise.all(
          APP_SHELL.map(async (url) => {
            try {
              const res = await fetch(url);
              if (res && res.ok) {
                await cache.put(url, res);
              }
            } catch (_e) {
              // ignore individual failures during precache
            }
          })
        );
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

function isSupabaseHost(url) {
  return url.hostname.endsWith(".supabase.co");
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(?:woff2?|ttf|otf|eot)$/i.test(url.pathname)
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // No cache, no network — nothing we can do for a static asset.
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never cache non-GET requests — just let them pass through.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Supabase API traffic: network-only, never touches the Cache API.
  // Auth tokens and user data must not be persisted here.
  if (isSupabaseHost(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigations: network-first, falling back to cache, then to /offline.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Same-origin static assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Same-origin, everything else not covered above: just pass through.
  if (url.origin === self.location.origin) {
    return;
  }

  // Any other cross-origin request: pass through, no caching.
  event.respondWith(fetch(request));
});

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};

      if (event.data) {
        try {
          payload = event.data.json();
        } catch (_err) {
          try {
            const text = event.data.text();
            payload = { title: "Dashboard", body: text };
          } catch (_err2) {
            payload = { title: "Dashboard", body: "You have a new notification." };
          }
        }
      }

      const title = payload.title || "Dashboard";
      const body = payload.body || "You have a new notification.";
      const url = payload.url || "/";
      const tag = payload.tag || "dashboard-notification";

      await self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        data: { url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const url = (notification.data && notification.data.url) || "/";
  notification.close();

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const targetUrl = new URL(url, self.location.origin).href;

      for (const client of allClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      // No exact match — focus any open client on the same origin, then navigate it.
      for (const client of allClients) {
        if ("focus" in client && "navigate" in client) {
          await client.focus();
          return client.navigate(targetUrl);
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSubscription = event.oldSubscription;
        const options = oldSubscription
          ? {
              userVisibleOnly: true,
              applicationServerKey: oldSubscription.options
                ? oldSubscription.options.applicationServerKey
                : undefined,
            }
          : { userVisibleOnly: true };

        await self.registration.pushManager.subscribe(options);
        // Re-sending the new subscription to the server is app-specific and
        // handled by the page (via a "message" round trip or a background
        // sync) since this service worker has no knowledge of the API shape.
      } catch (_err) {
        // If resubscription fails there is nothing more we can do here.
      }
    })()
  );
});

// ---------------------------------------------------------------------------
// messaging
// ---------------------------------------------------------------------------

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
