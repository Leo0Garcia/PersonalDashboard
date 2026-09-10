import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent, CalendarSubscription } from "../types";

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

// ---------------- iCal subscriptions ----------------

/**
 * Apple publishes iCloud calendars as `webcal://`, which `fetch` cannot open.
 * The sync function rewrites it, but normalising here too means the stored URL
 * and the UI both show something clickable.
 */
export function normaliseIcsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("webcal://")) return `https://${trimmed.slice("webcal://".length)}`;
  return trimmed;
}

export function isValidIcsUrl(raw: string): boolean {
  try {
    const url = new URL(normaliseIcsUrl(raw));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function fetchSubscriptions(
  sb: SupabaseClient,
): Promise<CalendarSubscription[]> {
  const { data, error } = await sb
    .from("calendar_subscriptions")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CalendarSubscription[];
}

export async function addSubscription(
  sb: SupabaseClient,
  userId: string,
  name: string,
  url: string,
  colour: CalendarSubscription["colour"] = "meeting",
): Promise<CalendarSubscription> {
  const { data, error } = await sb
    .from("calendar_subscriptions")
    .insert({
      user_id: userId,
      name: name.trim() || "Calendar",
      url: normaliseIcsUrl(url),
      colour,
    })
    .select()
    .single();

  if (error) throw error;
  return data as CalendarSubscription;
}

export async function updateSubscription(
  sb: SupabaseClient,
  id: string,
  patch: Partial<Pick<CalendarSubscription, "name" | "url" | "colour" | "enabled">>,
): Promise<void> {
  const next = patch.url ? { ...patch, url: normaliseIcsUrl(patch.url) } : patch;
  const { error } = await sb.from("calendar_subscriptions").update(next).eq("id", id);
  if (error) throw error;
}

/** Removing a subscription cascades its cached events away. */
export async function deleteSubscription(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("calendar_subscriptions").delete().eq("id", id);
  if (error) throw error;
}

export async function syncCalendars(
  sb: SupabaseClient,
  subscriptionId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.functions.invoke("sync-calendars", {
    body: subscriptionId ? { subscription_id: subscriptionId } : {},
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
