import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline · Dashboard" };

/**
 * Service-worker navigation fallback. Reached only when the requested page is
 * not in the cache and the network is unavailable.
 */
export default function OfflinePage() {
  return (
    <div
      className="safe-x flex items-center justify-center"
      style={{ minHeight: "100dvh", background: "var(--bg-base)", padding: 24 }}
    >
      <div style={{ maxWidth: 320 }}>
        <span
          style={{ display: "block", width: 11, height: 11, borderRadius: 2, background: "var(--status-inprog)", marginBottom: 18 }}
          aria-hidden
        />
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>
          You&rsquo;re offline
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 10 }}>
          This page isn&rsquo;t cached yet. Your board and habits are still available from the
          last time you opened the app.
        </p>
        <a
          href="/"
          className="mono-meta inline-flex items-center font-semibold"
          style={{
            marginTop: 18,
            minHeight: 44,
            padding: "0 16px",
            borderRadius: 10,
            background: "var(--bg-card)",
            border: "1px solid var(--line-strong)",
            color: "var(--ink-1)",
            fontSize: 11.5,
          }}
        >
          Back to the board
        </a>
      </div>
    </div>
  );
}
