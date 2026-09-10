"use client";

import { Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys, useCompletions, useHabits } from "@/lib/hooks/use-data";
import { toggleHabit } from "@/lib/db/habits";
import { habitsDoneToday, localDateKey, weekTrail } from "@/lib/derive";
import type { Habit, HabitCompletion } from "@/lib/types";

/**
 * Habits never enter the board, never become tasks, and reset at midnight.
 * A missed day is simply an unfilled square — no penalty copy.
 */
export function HabitsWidget({
  scale = "mac",
  online,
  onEdit,
}: {
  scale?: "mac" | "phone";
  online: boolean;
  onEdit?: () => void;
}) {
  const phone = scale === "phone";
  const { supabase, userId } = useSession();
  const { data: habits } = useHabits();
  const { data: completions } = useCompletions();
  const qc = useQueryClient();

  const list = habits ?? [];
  const done = habitsDoneToday(list, completions ?? []);
  const today = new Date();
  const todayKey = localDateKey(today);

  async function toggle(habit: Habit, currentlyDone: boolean) {
    if (!online) return;

    // Optimistic: one tap, instant, no confirmation.
    qc.setQueryData<HabitCompletion[]>(keys.completions, (prev = []) =>
      currentlyDone
        ? prev.filter((c) => !(c.habit_id === habit.id && c.completed_on === todayKey))
        : [
            ...prev,
            {
              id: `optimistic-${habit.id}`,
              user_id: userId,
              habit_id: habit.id,
              completed_on: todayKey,
              created_at: new Date().toISOString(),
            },
          ],
    );

    try {
      await toggleHabit(supabase, userId, habit.id, today, currentlyDone);
    } finally {
      await qc.invalidateQueries({ queryKey: keys.completions });
    }
  }

  if (list.length === 0) return null;

  const box = phone ? 26 : 20;

  return (
    <div
      className="rounded-[10px]"
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--line-soft)",
        padding: phone ? 15 : "14px 15px 15px",
      }}
    >
      <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
        <span className="mono-label" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Habits
        </span>
        <span className="mono-meta font-medium" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {done} / {list.length} today
        </span>
      </div>

      <div className="flex flex-col">
        {list.map((habit, i) => {
          const trail = weekTrail(habit, completions ?? [], today);
          const isDone = trail.find((d) => d.isToday)?.done ?? false;

          return (
            <div
              key={habit.id}
              className="flex items-center"
              style={{
                gap: 11,
                minHeight: phone ? 44 : undefined,
                paddingTop: i === 0 ? 0 : 11,
                paddingBottom: 11,
                borderTop: i === 0 ? undefined : "1px solid var(--line-soft)",
              }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={isDone}
                aria-label={habit.name}
                disabled={!online}
                onClick={() => void toggle(habit, isDone)}
                className="flex shrink-0 items-center justify-center transition-colors duration-150 disabled:opacity-40"
                style={{
                  width: box,
                  height: box,
                  borderRadius: phone ? 7 : 5,
                  background: isDone ? "var(--accent)" : "transparent",
                  border: isDone ? "none" : "1.5px solid var(--line-strong)",
                  color: "var(--on-accent)",
                }}
              >
                {isDone && <Check size={phone ? 15 : 12} strokeWidth={3} />}
              </button>

              <span
                className="min-w-0 flex-1 truncate"
                style={{
                  fontSize: phone ? 15 : 13.5,
                  fontWeight: 500,
                  color: isDone ? "var(--ink-1)" : "var(--ink-2)",
                }}
              >
                {habit.name}
              </span>

              <div className="flex shrink-0" style={{ gap: 3 }} aria-hidden>
                {trail.map((day) => (
                  <span
                    key={day.key}
                    style={{
                      width: phone ? 8 : 7,
                      height: phone ? 8 : 7,
                      borderRadius: 2,
                      background: day.done
                        ? day.isToday
                          ? "var(--accent)"
                          : "var(--accent-dim)"
                        : day.isToday
                          ? "transparent"
                          : "var(--line-soft)",
                      border:
                        day.isToday && !day.done ? "1px solid var(--accent-dim)" : undefined,
                      opacity: day.scheduled ? 1 : 0.35,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mono-meta flex items-center justify-between"
        style={{
          fontSize: 10.5,
          color: "var(--ink-3-quiet)",
          paddingTop: 11,
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <span>Last 7 days · Mon → today</span>
        {onEdit && (
          <button type="button" onClick={onEdit} className="mono-meta">
            Edit in settings
          </button>
        )}
      </div>
    </div>
  );
}
