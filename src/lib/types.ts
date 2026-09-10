export type TaskStatus = "todo" | "in_progress" | "done";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

/** Phone segmented control uses abbreviated labels — "IN PROG 2" in the design. */
export const STATUS_SHORT: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Prog",
  done: "Done",
};

export type Task = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  rank: string;
  due_at: string | null;
  priority: 1 | 2 | 3 | null;
  tags: string[];
  focus_position: 1 | 2 | 3 | null;
  status_changed_at: string;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday */
  schedule: number[];
  sort_order: number;
  include_in_evening_nudge: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HabitCompletion = {
  id: string;
  user_id: string;
  habit_id: string;
  completed_on: string; // YYYY-MM-DD
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  category: string;
  source: string;
  external_id: string | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  theme: "system" | "light" | "dark";
  wip_limit: number;
};

export type NotificationPreferences = {
  user_id: string;
  morning_digest: boolean;
  digest_hour: number;
  digest_minute: 0 | 30;
  evening_nudge: boolean;
  evening_nudge_hour: number;
  due_reminders: boolean;
  threshold_alerts: boolean;
};

export type Theme = "system" | "light" | "dark";
