import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task, TaskStatus } from "../types";
import { byStatus } from "../derive";
import { rankForIndex, rankForTop } from "./rank";

/**
 * Task queries. Deliberately framework-free — no React, no Next imports — so
 * this layer moves to a Capacitor or Expo shell unchanged if the app ever
 * needs to be native.
 */

export async function fetchTasks(sb: SupabaseClient): Promise<Task[]> {
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .is("archived_at", null)
    .order("rank", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Task[];
}

export type ParsedCapture = {
  title: string;
  tags: string[];
  dueAt: string | null;
};

const WEEKDAYS: Record<string, number> = {
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};

/**
 * Quick Capture inline parsing: `#tag` attaches a tag, natural-language dates
 * set a due date, and both are stripped from the saved title.
 */
export function parseCapture(input: string, now = new Date()): ParsedCapture {
  const tags: string[] = [];
  let dueAt: Date | null = null;

  let text = input.replace(/#([\w-]+)/g, (_m, tag: string) => {
    tags.push(String(tag).toLowerCase());
    return "";
  });

  const setTime = (d: Date) => {
    d.setHours(9, 0, 0, 0);
    return d;
  };

  const datePatterns: [RegExp, () => Date][] = [
    [/\btoday\b/i, () => setTime(new Date(now))],
    [
      /\btomorrow\b|\btmrw\b/i,
      () => {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        return setTime(d);
      },
    ],
    [
      /\bnext week\b/i,
      () => {
        const d = new Date(now);
        d.setDate(d.getDate() + 7);
        return setTime(d);
      },
    ],
  ];

  for (const [re, build] of datePatterns) {
    if (re.test(text)) {
      dueAt = build();
      text = text.replace(re, "");
      break;
    }
  }

  if (!dueAt) {
    const dayRe = new RegExp(
      `\\b(next\\s+)?(${Object.keys(WEEKDAYS).join("|")})\\b`,
      "i",
    );
    const match = text.match(dayRe);
    if (match) {
      const wantsNext = Boolean(match[1]);
      const target = WEEKDAYS[match[2].toLowerCase()];
      const current = now.getDay() === 0 ? 7 : now.getDay();
      let delta = target - current;
      if (delta <= 0) delta += 7;
      if (wantsNext && delta < 7) delta += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + delta);
      dueAt = setTime(d);
      text = text.replace(dayRe, "");
    }
  }

  return {
    title: text.replace(/\s+/g, " ").trim(),
    tags,
    dueAt: dueAt ? dueAt.toISOString() : null,
  };
}

export async function createTask(
  sb: SupabaseClient,
  userId: string,
  input: string,
  existing: Task[],
): Promise<Task> {
  const parsed = parseCapture(input);
  if (!parsed.title) throw new Error("A task needs a title");

  const { data, error } = await sb
    .from("tasks")
    .insert({
      user_id: userId,
      title: parsed.title,
      tags: parsed.tags,
      due_at: parsed.dueAt,
      status: "todo",
      rank: rankForTop(byStatus(existing, "todo")),
    })
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(
  sb: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      Task,
      "title" | "notes" | "status" | "rank" | "due_at" | "priority" | "tags" | "archived_at"
    >
  >,
): Promise<Task> {
  const { data, error } = await sb
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

/** Move a task to a status at a given index. Writes exactly one row. */
export async function moveTask(
  sb: SupabaseClient,
  task: Task,
  toStatus: TaskStatus,
  index: number,
  allTasks: Task[],
): Promise<Task> {
  const column = byStatus(allTasks, toStatus).filter((t) => t.id !== task.id);
  const rank = rankForIndex(column, Math.max(0, Math.min(index, column.length)));
  return updateTask(sb, task.id, { status: toStatus, rank });
}

export async function deleteTask(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Focus is capped at three by a partial unique index on (user_id,
 * focus_position). Clearing the slot first keeps a swap from colliding with
 * that constraint mid-flight.
 */
export async function setFocus(
  sb: SupabaseClient,
  userId: string,
  taskId: string,
  position: 1 | 2 | 3 | null,
): Promise<void> {
  if (position === null) {
    const { error } = await sb
      .from("tasks")
      .update({ focus_position: null })
      .eq("id", taskId);
    if (error) throw error;
    return;
  }

  const { error: clearError } = await sb
    .from("tasks")
    .update({ focus_position: null })
    .eq("user_id", userId)
    .eq("focus_position", position);
  if (clearError) throw clearError;

  const { error } = await sb
    .from("tasks")
    .update({ focus_position: position })
    .eq("id", taskId);
  if (error) throw error;
}

/** Next free focus slot, or null when all three are taken. */
export function nextFreeFocusSlot(tasks: Task[]): 1 | 2 | 3 | null {
  const taken = new Set(
    tasks.filter((t) => t.focus_position !== null).map((t) => t.focus_position),
  );
  for (const slot of [1, 2, 3] as const) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

export async function clearAllFocus(sb: SupabaseClient, userId: string): Promise<void> {
  const { error } = await sb
    .from("tasks")
    .update({ focus_position: null })
    .eq("user_id", userId)
    .not("focus_position", "is", null);
  if (error) throw error;
}
