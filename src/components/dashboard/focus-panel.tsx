"use client";

import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys, useTasks } from "@/lib/hooks/use-data";
import { setFocus } from "@/lib/db/tasks";
import { focusTasks, isOverdue } from "@/lib/derive";
import { dueChip } from "@/lib/format";
import type { Task } from "@/lib/types";

/**
 * Today's Focus — the emotional centre of the app, and the antidote to a
 * 47-item backlog. Capped at three by a partial unique index in Postgres,
 * so a fourth star is impossible rather than merely discouraged.
 */
export function FocusPanel({
  scale = "mac",
  showFootnote = false,
  onSelectTask,
  online,
}: {
  scale?: "mac" | "phone";
  showFootnote?: boolean;
  onSelectTask?: (task: Task) => void;
  online: boolean;
}) {
  const phone = scale === "phone";
  const { supabase, userId } = useSession();
  const { data: tasks } = useTasks();
  const qc = useQueryClient();

  const focused = focusTasks(tasks ?? []);
  const slots: (Task | null)[] = [0, 1, 2].map(
    (i) => focused.find((t) => t.focus_position === i + 1) ?? null,
  );

  async function clear(task: Task) {
    if (!online) return;
    await setFocus(supabase, userId, task.id, null);
    await qc.invalidateQueries({ queryKey: keys.tasks });
  }

  return (
    <div
      className="rounded-[10px]"
      style={{
        background: "var(--accent-ground)",
        border: "1px solid var(--accent-border)",
        padding: phone ? 15 : "15px 16px 16px",
      }}
    >
      <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
        <span className="mono-label" style={{ fontSize: 11, color: "var(--accent)" }}>
          Today&rsquo;s Focus
        </span>
        <span
          className="mono-meta font-medium"
          style={{ fontSize: 11, color: "var(--accent-quiet)" }}
        >
          {focused.length} / 3
        </span>
      </div>

      <div className="flex flex-col">
        {slots.map((task, i) => (
          <div
            key={i}
            className="flex items-start"
            style={{
              gap: 11,
              paddingTop: i === 0 ? 0 : 11,
              paddingBottom: i === 2 ? 0 : 11,
              borderTop: i === 0 ? undefined : "1px solid var(--accent-divider)",
              minHeight: phone ? 44 : undefined,
            }}
          >
            {phone ? (
              <span
                className="mono-meta flex shrink-0 items-center justify-center font-semibold"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: `1.5px ${task ? "solid" : "dashed"} var(--accent)`,
                  color: "var(--accent)",
                  fontSize: 11,
                }}
              >
                {i + 1}
              </span>
            ) : (
              <span
                className="mono-meta shrink-0 font-semibold"
                style={{ width: 14, color: "var(--accent)", fontSize: 13, lineHeight: "1.35" }}
              >
                {i + 1}
              </span>
            )}

            {task ? (
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelectTask?.(task)}
                  className="block w-full text-left"
                  style={{
                    fontSize: phone ? 15.5 : 14.5,
                    fontWeight: 500,
                    lineHeight: 1.35,
                    color: "var(--accent-ink)",
                    textDecoration: task.status === "done" ? "line-through" : undefined,
                    opacity: task.status === "done" ? 0.65 : 1,
                  }}
                >
                  {task.title}
                </button>
                <FocusMeta task={task} phone={phone} />
              </div>
            ) : (
              <span
                className="flex-1"
                style={{
                  fontSize: phone ? 15.5 : 14.5,
                  color: "var(--accent-quiet)",
                  lineHeight: 1.35,
                }}
              >
                Pick a {i === 0 ? "first" : i === 1 ? "second" : "third"} — or leave it open
              </span>
            )}

            {task && (
              <button
                type="button"
                onClick={() => void clear(task)}
                disabled={!online}
                aria-label={`Remove ${task.title} from Today's Focus`}
                className="flex shrink-0 items-center justify-center disabled:opacity-40"
                style={{ width: 28, height: 28, marginTop: -3, color: "var(--accent-quiet)" }}
              >
                <X size={14} strokeWidth={2.25} />
              </button>
            )}
          </div>
        ))}
      </div>

      {showFootnote && (
        <p
          className="mono-meta"
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: "var(--accent-quiet)",
            marginTop: 14,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          Focus is capped at three. Drop a task here from the board to swap one out.
        </p>
      )}
    </div>
  );
}

function FocusMeta({ task, phone }: { task: Task; phone: boolean }) {
  const chip = dueChip(task);
  const overdue = isOverdue(task);
  const parts: string[] = [];
  if (chip) parts.push(chip.label);
  if (task.status === "in_progress") parts.push("IN PROGRESS");
  if (task.status === "done") parts.push("DONE");
  if (parts.length === 0) return null;

  return (
    <span
      className="mono-meta block font-medium"
      style={{
        fontSize: phone ? 10 : 10.5,
        marginTop: 4,
        color: overdue ? "var(--status-overdue)" : "var(--accent-meta)",
      }}
    >
      {parts.join(" · ")}
    </span>
  );
}
