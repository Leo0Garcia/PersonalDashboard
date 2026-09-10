import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPreferences, Profile } from "../types";

export async function fetchProfile(sb: SupabaseClient): Promise<Profile | null> {
  const { data, error } = await sb.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function updateProfile(
  sb: SupabaseClient,
  id: string,
  patch: Partial<Pick<Profile, "display_name" | "timezone" | "theme" | "wip_limit">>,
): Promise<void> {
  const { error } = await sb.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function fetchNotificationPreferences(
  sb: SupabaseClient,
): Promise<NotificationPreferences | null> {
  const { data, error } = await sb
    .from("notification_preferences")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as NotificationPreferences) ?? null;
}

export async function updateNotificationPreferences(
  sb: SupabaseClient,
  userId: string,
  patch: Partial<Omit<NotificationPreferences, "user_id">>,
): Promise<void> {
  const { error } = await sb
    .from("notification_preferences")
    .update(patch)
    .eq("user_id", userId);
  if (error) throw error;
}
