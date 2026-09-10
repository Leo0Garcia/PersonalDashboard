import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "../types";

/**
 * The calendar strip is read-only in the design. No provider integration
 * exists yet — rows come from `calendar_events`, which a future Google or
 * CalDAV sync would populate.
 */
export async function fetchTodaysEvents(sb: SupabaseClient): Promise<CalendarEvent[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, error } = await sb
    .from("calendar_events")
    .select("*")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CalendarEvent[];
}
