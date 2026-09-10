"use client";

import { createContext, useContext } from "react";

type Shell = { online: boolean; isDesktop: boolean; cachedAt: string };

export const ShellContext = createContext<Shell>({
  online: true,
  isDesktop: false,
  cachedAt: "",
});

export function useShell(): Shell {
  return useContext(ShellContext);
}
