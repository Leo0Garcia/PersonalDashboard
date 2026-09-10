// send-push
//
// Sends a Web Push notification (RFC 8291 payload encryption, RFC 8292 VAPID
// auth) to every push subscription a user has registered, using the Deno-native
// `@negrel/webpush` library (JSR, MIT, explicitly built for Deno/Cloudflare
// Workers/Supabase Edge Functions — see https://github.com/negrel/webpush).
// It wraps the WebCrypto primitives Deno's edge runtime already implements
// (SubtleCrypto ECDH/HKDF/AES-GCM, plus `fetch`), so unlike `npm:web-push`
// (which pulls in Node's `crypto`/`https` modules and does not run cleanly
// under Supabase's Deno-based edge runtime) it needs no Node compat shims.
//
// Called with the SERVICE ROLE key, either directly (e.g. for a manual test
// push) or from `run-notification-rules`. `verify_jwt` is enabled for this
// function, but the service role key is itself a valid signed JWT, so calls
// authenticated with it pass the platform's gateway check without any extra
// code here.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import * as webpush from "@negrel/webpush";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------- base64url helpers ----------

function b64urlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- VAPID key material (built once, reused across invocations) ----------
//
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are the standard "web-push" raw
// base64url encoding: the public key is an uncompressed P-256 point
// (0x04 || X(32) || Y(32)), the private key is the raw 32-byte scalar (`d`).
// @negrel/webpush's importVapidKeys() expects JWK-shaped keys, so we split
// the raw point into its x/y coordinates and hand it all three JWK fields.
let vapidKeysPromise: Promise<CryptoKeyPair> | undefined;
function getVapidKeys(): Promise<CryptoKeyPair> {
  if (!vapidKeysPromise) {
    vapidKeysPromise = (async () => {
      const pub = b64urlToBytes(VAPID_PUBLIC_KEY);
      const priv = b64urlToBytes(VAPID_PRIVATE_KEY);
      if (pub.length !== 65 || pub[0] !== 0x04) {
        throw new Error(
          "VAPID_PUBLIC_KEY must be the base64url-encoded uncompressed P-256 point (65 bytes, 0x04 prefix)",
        );
      }
      const x = bytesToB64url(pub.slice(1, 33));
      const y = bytesToB64url(pub.slice(33, 65));
      return await webpush.importVapidKeys(
        {
          publicKey: { kty: "EC", crv: "P-256", x, y, ext: true },
          privateKey: { kty: "EC", crv: "P-256", x, y, d: bytesToB64url(priv), ext: true },
        },
        { extractable: false },
      );
    })();
  }
  return vapidKeysPromise;
}

let appServerPromise: Promise<webpush.ApplicationServer> | undefined;
function getAppServer(): Promise<webpush.ApplicationServer> {
  if (!appServerPromise) {
    appServerPromise = getVapidKeys().then((vapidKeys) =>
      webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys })
    );
  }
  return appServerPromise;
}

// ---------- request handling ----------

interface SendPushRequest {
  user_id: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function isSendPushRequest(x: unknown): x is SendPushRequest {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.user_id === "string" && typeof r.title === "string" && typeof r.body === "string";
}


// Both browser-invoked functions need CORS. supabase-js sends Content-Type and
// Authorization, which makes the browser fire an OPTIONS preflight first; with
// no handler for it the call is blocked before it ever reaches this code and
// surfaces as "Failed to send a request to the Edge Function".
//
// Allowing any origin is safe here because verify_jwt is enabled: a caller
// still needs a valid Supabase JWT, which another site cannot obtain.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  ...CORS_HEADERS,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (!isSendPushRequest(payload)) {
    return new Response(
      JSON.stringify({ error: "user_id, title and body are required" }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const { user_id, title, body, url, tag } = payload;

  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (subsError) {
    console.error("send-push: failed to load push_subscriptions", subsError);
    return new Response(JSON.stringify({ error: "failed to load subscriptions" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, pruned: 0, failed: 0 }), {
      headers: JSON_HEADERS,
    });
  }

  let appServer: webpush.ApplicationServer;
  try {
    appServer = await getAppServer();
  } catch (err) {
    console.error("send-push: failed to build VAPID application server", err);
    return new Response(JSON.stringify({ error: "server misconfigured (VAPID keys)" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const messagePayload = JSON.stringify({
    title,
    body,
    url: url ?? "/",
    tag: tag ?? "general",
  });

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        });
        await subscriber.pushTextMessage(messagePayload, {});
        sent++;

        // Best-effort freshness marker; a failure here shouldn't fail the push.
        const { error: touchError } = await admin
          .from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", sub.id);
        if (touchError) {
          console.error(`send-push: failed to update last_seen_at for ${sub.id}`, touchError);
        }
      } catch (err) {
        const status = err instanceof webpush.PushMessageError ? err.response.status : undefined;

        // 404/410 mean the push service has permanently discarded this
        // subscription (uninstalled, unsubscribed, browser data cleared) —
        // it will never succeed again, so prune it. Anything else (network
        // blip, 5xx, rate limiting) is logged but the row is kept: it may
        // still be valid and a retry could succeed later.
        if (status === 404 || status === 410) {
          pruned++;
          const { error: delError } = await admin.from("push_subscriptions").delete().eq("id", sub.id);
          if (delError) {
            console.error(`send-push: failed to prune dead subscription ${sub.id}`, delError);
          }
        } else {
          failed++;
          console.error(`send-push: delivery failed for subscription ${sub.id} (status ${status ?? "n/a"})`, err);
        }
      }
    }),
  );

  return new Response(JSON.stringify({ sent, pruned, failed }), {
    headers: JSON_HEADERS,
  });
});
