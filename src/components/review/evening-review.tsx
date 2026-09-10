"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, MoreHorizontal, X, Plus } from "lucide-react";
import type { Task } from "@/lib/types";
import { useSession } from "@/components/providers";
import { useTasks, keys } from "@/lib/hooks/use-data";
import { updateTask, setFocus, nextFreeFocusSlot } from "@/lib/db/tasks";
import { isOverdue, isCompletedToday, focusTasks } from "@/lib/derive";
import { dueChip } from "@/lib/format";
import { TaskCard } from "@/components/dashboard/task-card";
import { Panel } from "@/components/ui/primitives";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Local "tomorrow at 09:00" — never string-slice an ISO date, that shifts across midnight in BST. */
function tomorrowAt9(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function tonightAt8(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(20, 0, 0, 0);
  return d;
}

/** Upcoming Saturday at 09:00 (today counts as "upcoming" if it is already Saturday and unpassed logic isn't relevant here — we always roll forward). */
function upcomingSaturdayAt9(now = new Date()): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const delta = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

function nextWeekAt9(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Small overlay menu anchored under a trigger button. Closes on outside click via a full-screen scrim. */
function InlineMenu({
  items,
  onClose,
}: {
  items: { label: string; onSelect: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  return (
    <div className="relative z-20">
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className="absolute right-0 z-20 mt-1 min-w-[150px] overflow-hidden rounded-[10px]"
        style={{
          background: "var(--bg-raised, var(--bg-panel))",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="mono-meta block w-full px-3 py-3 text-left font-semibold"
            style={{
              fontSize: 11,
              minHeight: 44,
              color: item.danger ? "var(--status-overdue)" : "var(--ink-2)",
              background: "transparent",
            }}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClearedRow({
  task,
  onArchive,
}: {
  task: Task;
  onArchive: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="flex items-center gap-2 py-2.5"
      style={{ borderBottom: "1px solid var(--line-softer)" }}
    >
      <Check size={14} strokeWidth={3} style={{ color: "var(--status-done)", flexShrink: 0 }} />
      <span
        className="flex-1 truncate"
        style={{
          fontSize: 14.5,
          color: "var(--ink-2)",
          textDecoration: "line-through",
          textDecorationColor: "var(--ink-4)",
        }}
      >
        {task.title}
      </span>
      <div className="relative">
        <button
          type="button"
          aria-label={`More actions for ${task.title}`}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center justify-center rounded-[8px]"
          style={{ width: 44, height: 44, color: "var(--ink-3)" }}
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <InlineMenu
            onClose={() => setMenuOpen(false)}
            items={[{ label: "Archive", onSelect: () => onArchive(task.id) }]}
          />
        )}
      </div>
    </div>
  );
}

function DecisionCard({
  task,
  onTomorrow,
  onSnooze,
  onArchive,
  onMarkDone,
}: {
  task: Task;
  onTomorrow: (id: string) => void;
  onSnooze: (id: string, date: Date) => void;
  onArchive: (id: string) => void;
  onMarkDone: (id: string) => void;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const actionBase: React.CSSProperties = {
    minHeight: 44,
    borderRadius: 8,
    fontSize: 11,
    letterSpacing: "0.07em",
  };

  return (
    <div className="flex flex-col gap-2">
      <TaskCard task={task} scale="phone" />
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onTomorrow(task.id)}
          className="mono-meta flex items-center justify-center font-semibold"
          style={{ ...actionBase, background: "var(--accent)", color: "var(--on-accent)" }}
        >
          Tomorrow
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSnoozeOpen((v) => !v)}
            className="mono-meta flex w-full items-center justify-center font-semibold"
            style={{
              ...actionBase,
              background: "var(--chip-fill)",
              border: "1px solid var(--line-dashed)",
              color: "var(--ink-2)",
            }}
          >
            Snooze
          </button>
          {snoozeOpen && (
            <InlineMenu
              onClose={() => setSnoozeOpen(false)}
              items={[
                { label: "Tonight", onSelect: () => onSnooze(task.id, tonightAt8()) },
                { label: "Weekend", onSelect: () => onSnooze(task.id, upcomingSaturdayAt9()) },
                { label: "Next week", onSelect: () => onSnooze(task.id, nextWeekAt9()) },
              ]}
            />
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label={`More actions for ${task.title}`}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex w-full items-center justify-center"
            style={{
              ...actionBase,
              background: "var(--chip-fill)",
              border: "1px solid var(--line-dashed)",
              color: "var(--ink-2)",
            }}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <InlineMenu
              onClose={() => setMenuOpen(false)}
              items={[
                { label: "Mark done", onSelect: () => onMarkDone(task.id) },
                { label: "Archive", onSelect: () => onArchive(task.id), danger: true },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function EveningReview({ onFinish }: { onFinish: () => void }) {
  const { supabase, userId } = useSession();
  const qc = useQueryClient();
  const { data: tasks } = useTasks();

  const now = useMemo(() => new Date(), []);
  const weekday = WEEKDAY_NAMES[now.getDay()];

  const invalidate = () => void qc.invalidateQueries({ queryKey: keys.tasks });

  const cleared = useMemo(
    () => (tasks ?? []).filter((t) => isCompletedToday(t, now)),
    [tasks, now],
  );
  const open = useMemo(
    () => (tasks ?? []).filter((t) => t.status === "todo" || t.status === "in_progress"),
    [tasks],
  );
  const overdueTasks = useMemo(
    () => (tasks ?? []).filter((t) => isOverdue(t, now)),
    [tasks, now],
  );
  const focused = useMemo(() => focusTasks(tasks ?? []), [tasks]);

  const suggestions = useMemo(() => {
    const focusedIds = new Set(focused.map((t) => t.id));
    const pool = (tasks ?? []).filter(
      (t) => t.status !== "done" && !t.archived_at && !focusedIds.has(t.id),
    );
    const score = (t: Task): [number, number, number] => {
      const overdueScore = isOverdue(t, now) ? 0 : 1;
      const dueScore = t.due_at ? new Date(t.due_at).getTime() : Infinity;
      const priorityScore = t.priority ?? 4;
      return [overdueScore, dueScore, priorityScore];
    };
    return pool
      .sort((a, b) => {
        const sa = score(a);
        const sb = score(b);
        return sa[0] - sb[0] || sa[1] - sb[1] || sa[2] - sb[2];
      })
      .slice(0, 3);
  }, [tasks, focused, now]);

  async function archiveTask(id: string) {
    await updateTask(supabase, id, { archived_at: new Date().toISOString() });
    invalidate();
  }

  async function markDone(id: string) {
    await updateTask(supabase, id, {
      status: "done",
    });
    invalidate();
  }

  async function snoozeTo(id: string, date: Date) {
    await updateTask(supabase, id, { due_at: date.toISOString() });
    invalidate();
  }

  async function removeFocus(taskId: string) {
    await setFocus(supabase, userId, taskId, null);
    invalidate();
  }

  async function addFocus(taskId: string) {
    const slot = nextFreeFocusSlot(tasks ?? []);
    if (slot === null) return;
    await setFocus(supabase, userId, taskId, slot);
    invalidate();
  }

  async function finishReview() {
    await Promise.all(
      cleared.map((t) => updateTask(supabase, t.id, { archived_at: new Date().toISOString() })),
    );
    invalidate();
    onFinish();
  }

  const loading = tasks === undefined;

  return (
    <div
      className="flex min-h-full flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="mx-auto w-full flex-1 px-4 pt-6" style={{ maxWidth: 560 }}>
        {/* Header */}
        <div className="mb-7">
          <div className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
            Evening Review
          </div>
          <div
            className="mt-1"
            style={{ fontSize: 24, fontWeight: 600, color: "var(--ink-1)" }}
          >
            Wrap up {weekday}
          </div>
          {!loading && (
            <div
              className="mono-meta mt-2"
              style={{ fontSize: 10.5, color: "var(--ink-3)" }}
            >
              {cleared.length} DONE &middot; {open.length} OPEN &middot; {overdueTasks.length}{" "}
              OVERDUE
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading&hellip;</div>
        ) : (
          <>
            {/* Cleared today */}
            <section className="mb-7">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="mono-label" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Cleared Today
                </span>
                {cleared.length > 0 && (
                  <span
                    className="mono-meta font-semibold"
                    style={{ fontSize: 11, color: "var(--status-done)" }}
                  >
                    {cleared.length}
                  </span>
                )}
              </div>
              {cleared.length === 0 ? (
                <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                  Nothing cleared today. That&rsquo;s allowed.
                </div>
              ) : (
                <div>
                  {cleared.map((t) => (
                    <ClearedRow key={t.id} task={t} onArchive={archiveTask} />
                  ))}
                </div>
              )}
            </section>

            {/* Needs a decision */}
            {overdueTasks.length > 0 && (
              <section className="mb-7">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <span className="mono-label" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    Needs A Decision
                  </span>
                  <span
                    className="mono-meta font-semibold"
                    style={{ fontSize: 11, color: "var(--status-overdue)" }}
                  >
                    {overdueTasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  {overdueTasks.map((t) => (
                    <DecisionCard
                      key={t.id}
                      task={t}
                      onTomorrow={(id) => snoozeTo(id, tomorrowAt9())}
                      onSnooze={snoozeTo}
                      onArchive={archiveTask}
                      onMarkDone={markDone}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Tomorrow's three */}
            <section className="mb-7">
              <Panel accent style={{ padding: 14 }}>
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="mono-label" style={{ fontSize: 11, color: "var(--accent)" }}>
                    Tomorrow&rsquo;s Three
                  </span>
                  <span
                    className="mono-meta"
                    style={{ fontSize: 11, color: "var(--accent-quiet)" }}
                  >
                    {focused.length} / 3
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {([1, 2, 3] as const).map((slot) => {
                    const task = focused.find((t) => t.focus_position === slot);
                    if (task) {
                      return (
                        <div key={slot} className="flex items-center gap-2.5">
                          <span
                            className="mono-meta flex flex-shrink-0 items-center justify-center font-semibold"
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              border: "1.5px solid var(--accent)",
                              color: "var(--accent)",
                              fontSize: 13,
                            }}
                          >
                            {slot}
                          </span>
                          <span
                            className="flex-1 truncate"
                            style={{ fontSize: 15.5, fontWeight: 500, color: "var(--accent-ink)" }}
                          >
                            {task.title}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${task.title} from Tomorrow's Three`}
                            onClick={() => removeFocus(task.id)}
                            className="flex flex-shrink-0 items-center justify-center"
                            style={{ width: 44, height: 44, color: "var(--accent-quiet)" }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div key={slot} className="flex items-center gap-2.5">
                        <span
                          className="flex flex-shrink-0 items-center justify-center"
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: "1.5px dashed var(--accent-border)",
                          }}
                        >
                          <Plus size={12} style={{ color: "var(--accent-quiet)" }} />
                        </span>
                        <span
                          className="flex-1"
                          style={{ fontSize: 13.5, color: "var(--accent-quiet)" }}
                        >
                          Pick a third &mdash; or leave it open
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {focused.length < 3 && suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((t) => {
                    const chip = dueChip(t, now);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => addFocus(t.id)}
                        className="mono-meta font-semibold"
                        style={{
                          fontSize: 11,
                          padding: "9px 10px",
                          borderRadius: 5,
                          border: "1px solid var(--line-dashed)",
                          background: "var(--bg-card)",
                          color: "var(--ink-2)",
                          minHeight: 44,
                        }}
                      >
                        {t.title}
                        {chip ? ` · ${chip.label}` : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Footer */}
      <div
        className="sticky bottom-0"
        style={{
          background: "var(--bg-chrome)",
          borderTop: "1px solid var(--line-soft)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto w-full px-4 py-3" style={{ maxWidth: 560 }}>
          <button
            type="button"
            onClick={finishReview}
            className="mono-meta w-full font-semibold"
            style={{
              height: 50,
              borderRadius: 12,
              background: "var(--accent)",
              color: "var(--on-accent)",
              fontSize: 12,
              letterSpacing: "0.07em",
            }}
          >
            Finish Review
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="mono-meta mt-2 w-full text-center"
            style={{
              fontSize: 11,
              color: "var(--ink-3-quiet)",
              minHeight: 44,
            }}
          >
            Skip Tonight
          </button>
        </div>
      </div>
    </div>
  );
}
