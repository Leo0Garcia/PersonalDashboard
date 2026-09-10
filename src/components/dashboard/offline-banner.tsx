"use client";

import { AlertCircle } from "lucide-react";

/**
 * Writes are disabled rather than queued, so the banner states the cache
 * timestamp and the controls themselves go visibly inert.
 */
export function OfflineBanner({
  scale = "mac",
  cachedAt,
  onRetry,
}: {
  scale?: "mac" | "phone";
  cachedAt: string;
  onRetry?: () => void;
}) {
  const phone = scale === "phone";

  return (
    <div
      className="flex items-center"
      style={{
        gap: 10,
        background: "var(--offline-bg)",
        borderBottom: "1px solid var(--offline-border)",
        padding: phone ? "10px 18px" : "11px 24px",
      }}
      role="status"
      aria-live="polite"
    >
      <AlertCircle
        size={phone ? 16 : 18}
        strokeWidth={2}
        style={{ color: "var(--offline-icon)", flexShrink: 0 }}
      />
      <span style={{ fontSize: phone ? 13 : 13.5, color: "var(--offline-ink)", flex: 1 }}>
        {phone
          ? `Offline — cached ${cachedAt}. Edits disabled.`
          : `Offline — showing tasks cached at ${cachedAt}. Changes are disabled until you reconnect.`}
      </span>
      {!phone && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mono-meta shrink-0 rounded-[5px] font-medium"
          style={{
            fontSize: 11,
            padding: "6px 9px",
            border: "1px solid var(--offline-border)",
            color: "var(--offline-ink)",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
