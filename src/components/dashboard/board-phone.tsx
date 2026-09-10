"use client";

import { ArrowLeft, ArrowRight, MoreHorizontal, Star } from "lucide-react";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys, useTasks } from "@/lib/hooks/use-data";
import { moveTask, nextFreeFocusSlot, setFocus, updateTask } from "@/lib/db/tasks";
import { byStatus } from "@/lib/derive";
import { STATUS_LABEL, STATUS_SHORT, TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { TaskCard } from "./task-card";

const STATUS_CAP: Record<TaskStatus, string> = {
  todo: "var(--status-todo)",
  in_progress: "var(--status-inprog)",
  done: "var(--status-done)",
};

// null at each end rather than wrapping: "Move" on a Done card sending it back
// to To Do is surprising, and there is a dedicated Back button for going the
// other way.
const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  todo: "in_progress",
  in_progress: "done",
  done: null,
};

const PREV_STATUS: Record<TaskStatus, TaskStatus | null> = {
  todo: null,
  in_progress: "todo",
  done: "in_progress",
};

/**
 * Three columns do not fit a 390px screen, so one shows at a time. There is no
 * drag-and-drop here — the visible MOVE buttons are the primary path, with a
 * horizontal swipe as a shortcut.
 */
export function BoardPhone({
  online,
  onSelectTask,
}: {
  online: boolean;
  onSelectTask: (task: Task) => void;
}) {
  const { supabase, userId } = useSession();
  const { data: tasks } = useTasks();
  const qc = useQueryClient();

  const [column, setColumn] = useState<TaskStatus>("todo");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Task | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const all = tasks ?? [];
  const counts = Object.fromEntries(
    TASK_STATUSES.map((s) => [s, byStatus(all, s).length]),
  ) as Record<TaskStatus, number>;
  const visible = byStatus(all, column);

  async function move(task: Task, to: TaskStatus) {
    if (!online) return;
    setExpandedId(null);
    setMenuFor(null);
    const previous = qc.getQueryData<Task[]>(keys.tasks);
    qc.setQueryData<Task[]>(keys.tasks, (prev = []) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: to } : t)),
    );
    try {
      await moveTask(supabase, task, to, 0, all);
    } catch {
      if (previous) qc.setQueryData(keys.tasks, previous);
    } finally {
      await qc.invalidateQueries({ queryKey: keys.tasks });
    }
  }

  async function toggleFocus(task: Task) {
    if (!online) return;
    const slot = task.focus_position ? null : nextFreeFocusSlot(all);
    if (task.focus_position === null && slot === null) {
      // All three taken — the design calls for a swap prompt; the detail sheet
      // is where that choice belongs.
      onSelectTask(task);
      return;
    }
    await setFocus(supabase, userId, task.id, slot);
    await qc.invalidateQueries({ queryKey: keys.tasks });
  }

  function switchColumn(direction: 1 | -1) {
    const i = TASK_STATUSES.indexOf(column);
    const next = TASK_STATUSES[(i + direction + TASK_STATUSES.length) % TASK_STATUSES.length];
    setColumn(next);
    setExpandedId(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ gap: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Board</h1>

      <div>
        <div
          className="flex gap-[3px] rounded-[9px] p-[3px]"
          style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}
          role="tablist"
          aria-label="Board column"
        >
          {TASK_STATUSES.map((s) => {
            const active = s === column;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setColumn(s);
                  setExpandedId(null);
                }}
                className="mono-meta flex-1 rounded-[7px] font-semibold"
                style={{
                  fontSize: 11,
                  padding: "9px 4px",
                  background: active ? "var(--chip-fill-strong)" : "transparent",
                  color: active ? "var(--ink-1)" : "var(--ink-3)",
                }}
              >
                {STATUS_SHORT[s]} {counts[s]}
              </button>
            );
          })}
        </div>

        {/* Readable at arm's length — this bar is what carries the status */}
        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: STATUS_CAP[column],
            marginTop: 10,
          }}
        />
      </div>

      <div
        className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ gap: 10 }}
        onTouchStart={(e) => {
          touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            switchColumn(dx < 0 ? 1 : -1);
          }
        }}
      >
        {visible.length === 0 && (
          <p style={{ fontSize: 14, color: "var(--ink-3)", padding: "8px 2px" }}>
            Nothing in {STATUS_LABEL[column]}.
          </p>
        )}

        {visible.map((task) => {
          const expanded = expandedId === task.id;
          return (
            <TaskCard
              key={task.id}
              task={task}
              scale="phone"
              selected={expanded}
              onClick={() => setExpandedId(expanded ? null : task.id)}
            >
              {expanded && (
                <div
                  className="flex items-center"
                  style={{
                    gap: 8,
                    marginTop: 4,
                    paddingTop: 12,
                    borderTop: "1px solid var(--line-soft)",
                  }}
                >
                  {PREV_STATUS[task.status] && (
                    <ActionButton
                      disabled={!online}
                      label={`Move back to ${STATUS_LABEL[PREV_STATUS[task.status]!]}`}
                      onClick={() => void move(task, PREV_STATUS[task.status]!)}
                    >
                      <ArrowLeft size={15} strokeWidth={2.5} />
                    </ActionButton>
                  )}

                  {NEXT_STATUS[task.status] && (
                    <ActionButton
                      flex
                      disabled={!online}
                      label={`Move to ${STATUS_LABEL[NEXT_STATUS[task.status]!]}`}
                      onClick={() => void move(task, NEXT_STATUS[task.status]!)}
                    >
                      <span className="mono-meta font-semibold" style={{ fontSize: 11 }}>
                        {STATUS_LABEL[NEXT_STATUS[task.status]!]}
                      </span>
                      <ArrowRight size={13} strokeWidth={2.5} />
                    </ActionButton>
                  )}

                  <ActionButton
                    disabled={!online}
                    label={
                      task.focus_position
                        ? "Remove from Today's Focus"
                        : "Add to Today's Focus"
                    }
                    onClick={() => void toggleFocus(task)}
                  >
                    <Star
                      size={15}
                      strokeWidth={2.25}
                      fill={task.focus_position ? "var(--accent)" : "none"}
                      style={{ color: task.focus_position ? "var(--accent)" : undefined }}
                    />
                  </ActionButton>

                  <ActionButton
                    disabled={!online}
                    label="More actions"
                    onClick={() => setMenuFor(task)}
                  >
                    <MoreHorizontal size={16} strokeWidth={2.25} />
                  </ActionButton>
                </div>
              )}
            </TaskCard>
          );
        })}

        <p
          className="mono-meta"
          style={{
            fontSize: 10.5,
            lineHeight: 1.5,
            color: "var(--ink-3-quiet)",
            textTransform: "none",
            letterSpacing: 0,
            padding: "6px 2px 0",
          }}
        >
          Tap a card to expand actions. Arrows move it a column either way; ⋯ picks any column.
        </p>
      </div>

      {menuFor && (
        <TaskSheet
          task={menuFor}
          onClose={() => setMenuFor(null)}
          onMove={(to) => void move(menuFor, to)}
          onEdit={() => {
            const t = menuFor;
            setMenuFor(null);
            onSelectTask(t);
          }}
          onArchive={async () => {
            const t = menuFor;
            setMenuFor(null);
            await updateTask(supabase, t.id, { archived_at: new Date().toISOString() });
            await qc.invalidateQueries({ queryKey: keys.tasks });
          }}
        />
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  label,
  flex,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  flex?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex items-center justify-center gap-[6px] rounded-[8px]"
      style={{
        minHeight: 44,
        minWidth: 44,
        flex: flex ? 1 : undefined,
        background: "var(--bg-base)",
        border: "1px solid var(--line-soft)",
        color: disabled ? "var(--ink-4)" : "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}

function TaskSheet({
  task,
  onClose,
  onMove,
  onEdit,
  onArchive,
}: {
  task: Task;
  onClose: () => void;
  onMove: (to: TaskStatus) => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.5)" }} />
      <div
        className="safe-bottom relative w-full"
        style={{
          background: "var(--bg-panel)",
          borderTop: "1px solid var(--line)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 12,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Actions for ${task.title}`}
      >
        <p
          className="truncate"
          style={{ fontSize: 14, fontWeight: 500, padding: "6px 8px 12px", color: "var(--ink-2)" }}
        >
          {task.title}
        </p>
        {TASK_STATUSES.filter((s) => s !== task.status).map((s) => (
          <SheetRow key={s} onClick={() => onMove(s)}>
            Move to {STATUS_LABEL[s]}
          </SheetRow>
        ))}
        <SheetRow onClick={onEdit}>Edit details</SheetRow>
        <SheetRow onClick={onArchive}>Archive</SheetRow>
        <SheetRow onClick={onClose} muted>
          Cancel
        </SheetRow>
      </div>
    </div>
  );
}

function SheetRow({
  children,
  onClick,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[8px] text-left"
      style={{
        minHeight: 48,
        padding: "0 12px",
        fontSize: 15.5,
        color: muted ? "var(--ink-3)" : "var(--ink-1)",
      }}
    >
      {children}
    </button>
  );
}
