"use client";

import { Check, Star, Text } from "lucide-react";
import type { CSSProperties } from "react";
import type { Task } from "@/lib/types";
import { dueChip, doneStamp, tagLabel } from "@/lib/format";
import { isOverdue } from "@/lib/derive";
import { Chip } from "@/components/ui/primitives";

const PRIORITY_COLOUR: Record<number, string> = {
  1: "var(--prio-1)",
  2: "var(--prio-2)",
  3: "var(--prio-3)",
};

export type TaskCardScale = "mac" | "phone";

/**
 * The single most repeated component in the design. Every variant in the
 * handoff's spec sheet lives here: plain, due, overdue, tagged, prioritised,
 * focused, with-notes, done and selected.
 */
export function TaskCard({
  task,
  scale = "mac",
  selected = false,
  dimmed = false,
  onClick,
  children,
  style,
  dragging = false,
}: {
  task: Task;
  scale?: TaskCardScale;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: CSSProperties;
  dragging?: boolean;
}) {
  const phone = scale === "phone";
  const done = task.status === "done";
  const overdue = isOverdue(task);
  const chip = dueChip(task);
  const stamp = doneStamp(task);
  const focused = task.focus_position !== null;

  const base: CSSProperties = {
    background: done ? "var(--bg-recessed)" : selected ? "var(--bg-raised)" : "var(--bg-card)",
    border: selected
      ? "1.5px solid var(--accent)"
      : `1px solid ${done ? "var(--line-softer)" : "var(--line)"}`,
    borderRadius: phone ? 10 : 8,
    padding: phone ? 13 : 12,
    boxShadow: dragging
      ? "var(--shadow-lift)"
      : focused && task.status === "in_progress"
        ? "inset 0 0 0 1px rgba(183,206,78,.14)"
        : "var(--shadow-card)",
    opacity: dimmed ? 0.55 : 1,
    // Status is never colour-only: the red rail is always paired with an
    // "OVERDUE …" chip below it.
    borderLeft: overdue ? "2px solid var(--status-overdue)" : undefined,
    ...style,
  };

  const hasMeta = chip || task.tags.length > 0 || task.priority || task.notes;

  return (
    <div
      className={`relative flex flex-col ${onClick ? "cursor-pointer" : ""}`}
      style={{ ...base, gap: 9 }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {focused && !done && (
        <span
          className="mono-meta absolute font-semibold"
          style={{
            top: phone ? 11 : 10,
            right: phone ? 12 : 11,
            fontSize: 10,
            color: "var(--accent)",
            letterSpacing: "0.04em",
          }}
          aria-label={`In Today's Focus, position ${task.focus_position}`}
        >
          <Star size={9} strokeWidth={2.5} className="inline align-[-1px]" fill="currentColor" />
          {task.focus_position}
        </span>
      )}

      <div className="flex items-start" style={{ gap: 7 }}>
        {done && (
          <Check
            size={13}
            strokeWidth={3}
            style={{ color: "var(--status-done)", marginTop: 2, flexShrink: 0 }}
          />
        )}
        <span
          style={{
            fontSize: phone ? 15.5 : 14,
            fontWeight: 500,
            lineHeight: 1.35,
            color: done ? "var(--ink-2)" : "var(--ink-1)",
            textDecoration: done ? "line-through" : undefined,
            textDecorationColor: done ? "var(--ink-4)" : undefined,
            paddingRight: focused && !done ? 22 : 0,
          }}
        >
          {task.title}
        </span>
      </div>

      {done && stamp && (
        <span
          className="mono-meta"
          style={{ fontSize: 10.5, color: "var(--ink-3-quiet)", marginLeft: 19, marginTop: -4 }}
        >
          {stamp}
        </span>
      )}

      {!done && hasMeta && (
        <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
          {chip && (
            <Chip
              variant={chip.variant === "normal" ? "neutral" : chip.variant}
              size={phone ? 10 : 10.5}
            >
              {chip.label}
            </Chip>
          )}
          {task.priority && (
            <span
              className="mono-meta font-semibold"
              style={{
                fontSize: phone ? 10 : 10.5,
                letterSpacing: "0.06em",
                color: PRIORITY_COLOUR[task.priority],
              }}
            >
              P{task.priority}
            </span>
          )}
          {task.tags.map((tag) => (
            <Chip key={tag} variant="tag" size={phone ? 10 : 10.5}>
              {tagLabel(tag)}
            </Chip>
          ))}
          {task.notes && (
            <Text
              size={12}
              strokeWidth={2.5}
              style={{ color: selected ? "var(--accent)" : "var(--ink-2-dim)" }}
              aria-label="Has notes"
            />
          )}
        </div>
      )}

      {children}
    </div>
  );
}
