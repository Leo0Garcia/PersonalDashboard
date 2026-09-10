"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "@/components/providers";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchHabits, fetchCompletions } from "@/lib/db/habits";
import { fetchTodaysEvents } from "@/lib/db/calendar";
import { fetchNotificationPreferences } from "@/lib/db/profile";
import type { Task } from "@/lib/types";

export const keys = {
  tasks: ["tasks"] as const,
  habits: ["habits"] as const,
  completions: ["habit_completions"] as const,
  events: ["calendar_events"] as const,
  prefs: ["notification_preferences"] as const,
};

export function useTasks() {
  const { supabase } = useSession();
  return useQuery({ queryKey: keys.tasks, queryFn: () => fetchTasks(supabase) });
}

export function useHabits() {
  const { supabase } = useSession();
  return useQuery({ queryKey: keys.habits, queryFn: () => fetchHabits(supabase) });
}

export function useCompletions() {
  const { supabase } = useSession();
  return useQuery({ queryKey: keys.completions, queryFn: () => fetchCompletions(supabase) });
}

export function useTodaysEvents() {
  const { supabase } = useSession();
  return useQuery({ queryKey: keys.events, queryFn: () => fetchTodaysEvents(supabase) });
}

export function useNotificationPreferences() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: keys.prefs,
    queryFn: () => fetchNotificationPreferences(supabase),
  });
}

/**
 * Optimistic task mutation. Applies the patch to the cache immediately and
 * rolls back on error — the board must feel instant even on a slow connection.
 */
export function useTaskMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  optimistic?: (tasks: Task[], vars: TVars) => Task[],
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onMutate: async (vars: TVars) => {
      if (!optimistic) return { previous: undefined };
      await qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      if (previous) qc.setQueryData<Task[]>(keys.tasks, optimistic(previous, vars));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.tasks, context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

/**
 * Realtime sync. Subscribed once at the shell level rather than per widget:
 * one channel, and every relevant query key invalidated when the other device
 * writes. This is what makes an edit on the phone appear on the Mac.
 */
export function useRealtimeSync() {
  const { supabase, userId } = useSession();
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        () => void qc.invalidateQueries({ queryKey: keys.tasks }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "habits", filter: `user_id=eq.${userId}` },
        () => void qc.invalidateQueries({ queryKey: keys.habits }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "habit_completions",
          filter: `user_id=eq.${userId}`,
        },
        () => void qc.invalidateQueries({ queryKey: keys.completions }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, qc]);
}
