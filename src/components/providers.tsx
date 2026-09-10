"use client";

import {
  QueryClient,
  type QueryClientConfig,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

const queryConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Must be >= the persister maxAge or persisted data is discarded on load.
      gcTime: ONE_WEEK,
      retry: 2,
      refetchOnWindowFocus: true,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "online" },
  },
};

/**
 * IndexedDB-backed persistence. This is what makes a cold offline launch show
 * the last-known board immediately instead of an empty skeleton.
 */
function makePersister() {
  return createAsyncStoragePersister({
    storage: {
      getItem: (key) => get(key).then((v) => v ?? null),
      setItem: (key, value) => set(key, value),
      removeItem: (key) => del(key),
    },
    key: "dashboard-query-cache",
    throttleTime: 1000,
  });
}

type SessionValue = {
  supabase: SupabaseClient;
  userId: string;
  profile: Profile | null;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <Providers>");
  return ctx;
}

export function Providers({
  children,
  userId,
  profile,
}: {
  children: ReactNode;
  userId: string;
  profile: Profile | null;
}) {
  const [queryClient] = useState(() => new QueryClient(queryConfig));
  const [persister] = useState(() => (typeof window === "undefined" ? null : makePersister()));
  const supabase = useMemo(() => createClient(), []);

  const value = useMemo<SessionValue>(
    () => ({ supabase, userId, profile }),
    [supabase, userId, profile],
  );

  if (!persister) {
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: ONE_WEEK }}
    >
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    </PersistQueryClientProvider>
  );
}
