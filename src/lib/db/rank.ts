import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { Task } from "../types";

/**
 * Fractional ranks: moving a card writes ONE row. Integer positions would
 * renumber the whole column, and with Realtime on that means a burst of sync
 * events and visible flicker on the other device.
 */

export function rankBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

export function ranksBetween(a: string | null, b: string | null, n: number): string[] {
  return generateNKeysBetween(a, b, n);
}

/** Rank for a card inserted at the top of a column — Quick Capture's target. */
export function rankForTop(columnTasks: Task[]): string {
  const first = columnTasks[0];
  return generateKeyBetween(null, first ? first.rank : null);
}

export function rankForBottom(columnTasks: Task[]): string {
  const last = columnTasks[columnTasks.length - 1];
  return generateKeyBetween(last ? last.rank : null, null);
}

/**
 * Rank for dropping at `index` within an ordered column, excluding the card
 * being moved (callers must filter it out first, or a move within the same
 * column computes a rank against itself).
 */
export function rankForIndex(ordered: Task[], index: number): string {
  const before = index > 0 ? ordered[index - 1]?.rank ?? null : null;
  const after = ordered[index]?.rank ?? null;
  return generateKeyBetween(before, after);
}
