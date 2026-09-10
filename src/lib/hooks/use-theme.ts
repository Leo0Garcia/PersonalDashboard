"use client";

import { useCallback, useEffect, useState } from "react";
import type { Theme } from "@/lib/types";

const STORAGE_KEY = "dashboard-theme";

/**
 * Dark is the primary target, but the default follows the system preference;
 * the header toggle overrides it. Stored per-device — a browser convenience,
 * not synced state.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
    } catch {
      // Private mode or blocked site data — the system default is fine.
    }
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal.
    }
  }, []);

  const resolved: "light" | "dark" =
    theme === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  return { theme, resolved, setTheme };
}
