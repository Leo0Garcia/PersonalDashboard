import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. The publishable key is designed to be public —
 * every table is protected by RLS, so this key alone grants nothing.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
