"use client";

import { useEffect, useState } from "react";

/**
 * Drives the offline banner and the disabled write controls. The handoff is
 * explicit that writes are disabled rather than queued, so failed writes are
 * prevented rather than reported after the fact.
 */
export function useOnlineStatus(): { online: boolean; since: Date | null } {
  const [online, setOnline] = useState(true);
  const [since, setSince] = useState<Date | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    if (!navigator.onLine) setSince(new Date());

    const goOnline = () => {
      setOnline(true);
      setSince(null);
    };
    const goOffline = () => {
      setOnline(false);
      setSince(new Date());
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { online, since };
}
