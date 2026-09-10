import type { Task } from "./types";
import { isOverdue, isDueToday, localDateKey } from "./derive";

const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "FRI 12 SEP" */
export function shortDate(d: Date): string {
  return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

/** "THURSDAY 10 SEP" — the phone greeting label */
export function longDateLabel(d: Date): string {
  const full = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  return `${full[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function daysBetween(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / 86_400_000);
}

export type DueChip = { label: string; variant: "normal" | "today" | "overdue" } | null;

/**
 * The date chip on a task card. Status is never carried by colour alone —
 * an overdue card's red left border is always backed by chip text saying so.
 */
export function dueChip(task: Task, now = new Date()): DueChip {
  if (!task.due_at || task.status === "done") return null;
  const due = new Date(task.due_at);

  if (isOverdue(task, now)) {
    const days = daysBetween(due, now);
    return {
      label: days >= 2 ? `OVERDUE ${days} DAYS` : `OVERDUE ${due.getDate()} ${MON[due.getMonth()]}`,
      variant: "overdue",
    };
  }

  if (isDueToday(task, now)) return { label: "DUE TODAY", variant: "today" };

  return { label: shortDate(due), variant: "normal" };
}

/** "DONE 06:58" / "DONE YESTERDAY 21:30" */
export function doneStamp(task: Task, now = new Date()): string | null {
  if (!task.completed_at) return null;
  const at = new Date(task.completed_at);
  const delta = daysBetween(at, now);
  if (delta === 0) return `DONE ${hhmm(at)}`;
  if (delta === 1) return `DONE YESTERDAY ${hhmm(at)}`;
  return `DONE ${shortDate(at)} ${hhmm(at)}`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}H ${m}M`;
  if (h) return `${h}H`;
  return `${m}M`;
}

export function tagLabel(tag: string): string {
  return `#${tag.toUpperCase()}`;
}

export { localDateKey };
