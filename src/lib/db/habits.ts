import type { SupabaseClient } from "@supabase/supabase-js";
import type { Habit, HabitCompletion } from "../types";
import { localDateKey } from "../derive";

export async function fetchHabits(sb: SupabaseClient): Promise<Habit[]> {
  const { data, error } = await sb
    .from("habits")
    .select("*")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Habit[];
}

/** Completions for the trailing `days` window — enough for the 7-day trail and streaks. */
export async function fetchCompletions(
  sb: SupabaseClient,
  days = 120,
): Promise<HabitCompletion[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from("habit_completions")
    .select("*")
    .gte("completed_on", localDateKey(since))
    .order("completed_on", { ascending: false });

  if (error) throw error;
  return (data ?? []) as HabitCompletion[];
}

/** One tap toggles today. Optimistic and instant — no confirmation. */
export async function toggleHabit(
  sb: SupabaseClient,
  userId: string,
  habitId: string,
  date: Date,
  currentlyDone: boolean,
): Promise<void> {
  const key = localDateKey(date);

  if (currentlyDone) {
    const { error } = await sb
      .from("habit_completions")
      .delete()
      .eq("habit_id", habitId)
      .eq("completed_on", key);
    if (error) throw error;
    return;
  }

  const { error } = await sb
    .from("habit_completions")
    .insert({ user_id: userId, habit_id: habitId, completed_on: key });

  // 23505 = already ticked on another device a moment ago. Not an error.
  if (error && error.code !== "23505") throw error;
}

export async function createHabit(
  sb: SupabaseClient,
  userId: string,
  name: string,
  existing: Habit[],
): Promise<Habit> {
  const { data, error } = await sb
    .from("habits")
    .insert({
      user_id: userId,
      name,
      sort_order: existing.length,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Habit;
}

export async function updateHabit(
  sb: SupabaseClient,
  id: string,
  patch: Partial<Pick<Habit, "name" | "schedule" | "sort_order" | "include_in_evening_nudge">>,
): Promise<void> {
  const { error } = await sb.from("habits").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteHabit(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("habits").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderHabits(sb: SupabaseClient, ordered: Habit[]): Promise<void> {
  await Promise.all(
    ordered.map((h, i) =>
      h.sort_order === i
        ? Promise.resolve()
        : sb.from("habits").update({ sort_order: i }).eq("id", h.id),
    ),
  );
}
