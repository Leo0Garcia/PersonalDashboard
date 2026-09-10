import type { CalendarEvent, Habit, HabitCompletion, Task } from "./types";

/**
 * Derived state. The handoff is explicit that overdue, counts, streaks and
 * WIP-over-limit are computed, never stored.
 */

export function isOverdue(task: Task, now = new Date()): boolean {
  if (!task.due_at || task.status === "done") return false;
  return new Date(task.due_at).getTime() < now.getTime();
}

export function isDueToday(task: Task, now = new Date()): boolean {
  if (!task.due_at || task.status === "done") return false;
  const due = new Date(task.due_at);
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export function isCompletedToday(task: Task, now = new Date()): boolean {
  if (!task.completed_at) return false;
  const at = new Date(task.completed_at);
  return (
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  );
}

export function dueWithinDays(task: Task, days: number, now = new Date()): boolean {
  if (!task.due_at || task.status === "done") return false;
  const due = new Date(task.due_at).getTime();
  const limit = now.getTime() + days * 86_400_000;
  return due >= now.getTime() && due <= limit;
}

export type WeekStats = {
  dueThisWeek: number;
  overdue: number;
  completedToday: number;
  inProgress: number;
  overWipLimit: boolean;
};

export function weekStats(tasks: Task[], wipLimit: number, now = new Date()): WeekStats {
  const live = tasks.filter((t) => !t.archived_at);
  const inProgress = live.filter((t) => t.status === "in_progress").length;
  return {
    dueThisWeek: live.filter((t) => dueWithinDays(t, 7, now)).length,
    overdue: live.filter((t) => isOverdue(t, now)).length,
    completedToday: live.filter((t) => isCompletedToday(t, now)).length,
    inProgress,
    overWipLimit: inProgress > wipLimit,
  };
}

export function focusTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.focus_position !== null && !t.archived_at)
    .sort((a, b) => (a.focus_position ?? 0) - (b.focus_position ?? 0));
}

export function byStatus(tasks: Task[], status: Task["status"]): Task[] {
  return tasks
    .filter((t) => t.status === status && !t.archived_at)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

/** Local YYYY-MM-DD. Never use toISOString() here — it shifts across midnight in BST. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function isHabitScheduled(habit: Habit, d: Date): boolean {
  return habit.schedule.includes(isoWeekday(d));
}

/** The seven-day trail: Monday of the current week through today. */
export function weekTrail(
  habit: Habit,
  completions: HabitCompletion[],
  now = new Date(),
): { date: Date; key: string; done: boolean; scheduled: boolean; isToday: boolean }[] {
  const todayKey = localDateKey(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - (isoWeekday(now) - 1));

  const doneKeys = new Set(
    completions.filter((c) => c.habit_id === habit.id).map((c) => c.completed_on),
  );

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const key = localDateKey(date);
    return {
      date,
      key,
      done: doneKeys.has(key),
      scheduled: isHabitScheduled(habit, date),
      isToday: key === todayKey,
    };
  });
}

/**
 * Streak = consecutive scheduled days completed. Unscheduled days do not
 * break it, per the handoff.
 */
export function habitStreak(
  habit: Habit,
  completions: HabitCompletion[],
  now = new Date(),
): number {
  const doneKeys = new Set(
    completions.filter((c) => c.habit_id === habit.id).map((c) => c.completed_on),
  );

  let streak = 0;
  const cursor = new Date(now);

  // Today not yet ticked shouldn't zero the streak — start from yesterday then.
  if (isHabitScheduled(habit, cursor) && !doneKeys.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  for (let guard = 0; guard < 730; guard++) {
    if (!isHabitScheduled(habit, cursor)) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (!doneKeys.has(localDateKey(cursor))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function habitsDoneToday(
  habits: Habit[],
  completions: HabitCompletion[],
  now = new Date(),
): number {
  const key = localDateKey(now);
  const ids = new Set(habits.map((h) => h.id));
  return completions.filter((c) => c.completed_on === key && ids.has(c.habit_id)).length;
}

export function todaysEvents(events: CalendarEvent[], now = new Date()): CalendarEvent[] {
  const key = localDateKey(now);
  return events
    .filter((e) => localDateKey(new Date(e.starts_at)) === key)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export function totalBookedMinutes(events: CalendarEvent[]): number {
  return events.reduce(
    (sum, e) =>
      sum + (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60_000,
    0,
  );
}

/** First gap after the last event of the day — powers "CLEAR AFTER 15:00". */
export function clearAfter(events: CalendarEvent[]): Date | null {
  if (events.length === 0) return null;
  const last = events.reduce((latest, e) =>
    new Date(e.ends_at) > new Date(latest.ends_at) ? e : latest,
  );
  return new Date(last.ends_at);
}
