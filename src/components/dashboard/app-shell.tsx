"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/hooks/use-online";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { useRealtimeSync } from "@/lib/hooks/use-data";
import { registerServiceWorker } from "@/lib/pwa/register-sw";
import { hhmm } from "@/lib/format";
import { MacHeader, PhoneTabBar, SafeTop } from "./chrome";
import { OfflineBanner } from "./offline-banner";
import { ShellContext } from "./shell-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { online } = useOnlineStatus();
  const isDesktop = useIsDesktop();
  const qc = useQueryClient();
  const [cachedAt, setCachedAt] = useState<string>("");

  useRealtimeSync();

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  // Stamp the last successful sync so the offline banner can name it.
  useEffect(() => {
    if (online) setCachedAt(hhmm(new Date()));
  }, [online]);

  // Avoid committing to a layout until the media query has resolved, so the
  // phone layout never flashes on a Mac.
  if (isDesktop === null) {
    return <div style={{ minHeight: "100dvh", background: "var(--bg-base)" }} />;
  }

  return (
    <ShellContext.Provider value={{ online, isDesktop, cachedAt }}>
      <div
        className="flex flex-col"
        style={{ height: "100dvh", background: "var(--bg-base)", overflow: "hidden" }}
      >
        {isDesktop ? <MacHeader online={online} /> : <SafeTop />}

        {!online && (
          <OfflineBanner
            scale={isDesktop ? "mac" : "phone"}
            cachedAt={cachedAt || "earlier"}
            onRetry={() => void qc.refetchQueries()}
          />
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>

        {!isDesktop && <PhoneTabBar />}
      </div>
    </ShellContext.Provider>
  );
}
