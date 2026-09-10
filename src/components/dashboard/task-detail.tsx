"use client";

import { ChevronDown, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys, useTasks } from "@/lib/hooks/use-data";
import { deleteTask, nextFreeFocusSlot, setFocus, updateTask } from "@/lib/db/tasks";
import { hhmm, shortDate, tagLabel } from "@/lib/format";
import { STATUS_LABEL, TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { Toggle } from "@/components/ui/primitives";

const STATUS_TINT: Record<TaskStatus, string> = {
  todo: "var(--status-todo-tint)",
  in_progress: "var(--status-inprog-tint)",
  done: "var(--status-done-tint)",
};

const PRIORITY_TINT: Record<number, { fg: string; bg: string }> = {
  1: { fg: "var(--status-overdue)", bg: "var(--overdue-chip-bg)" },
  2: { fg: "var(--status-inprog)", bg: "var(--chip-fill-strong)" },
  3: { fg: "var(--ink-2)", bg: "var(--chip-fill-strong)" },
};

/**
 * Saving is automatic — the design has no Save button anywhere. The "SAVED"
 * line is the only confirmation.
 */
export function TaskDetail({
  task,
  onClose,
  scale = "mac",
  online,
}: {
  task: Task;
  onClose: () => void;
  scale?: "mac" | "phone";
  online: boolean;
}) {
  const phone = scale === "phone";
  const { supabase, userId } = useSession();
  const { data: tasks } = useTasks();
  const qc = useQueryClient();

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setConfirmDelete(false);
  }, [task.id, task.title, task.notes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useCallback(
    async (patch: Parameters<typeof updateTask>[2]) => {
      if (!online) return;
      await updateTask(supabase, task.id, patch);
      setSavedAt(new Date());
      await qc.invalidateQueries({ queryKey: keys.tasks });
    },
    [online, supabase, task.id, qc],
  );

  /** Debounced so typing doesn't write a row per keystroke. */
  const saveDebounced = useCallback(
    (patch: Parameters<typeof updateTask>[2]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(patch), 600);
    },
    [save],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const focusFull = nextFreeFocusSlot(tasks ?? []) === null && task.focus_position === null;

  async function toggleFocus(next: boolean) {
    if (!online) return;
    const slot = next ? nextFreeFocusSlot(tasks ?? []) ?? 1 : null;
    await setFocus(supabase, userId, task.id, slot);
    setSavedAt(new Date());
    await qc.invalidateQueries({ queryKey: keys.tasks });
  }

  const body = (
    <>
      <div
        className="flex items-center justify-between"
        style={{
          padding: phone ? "16px 18px 14px" : "20px 24px 16px",
          borderBottom: "1px solid var(--line-softer)",
        }}
      >
        <span className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          Task detail
        </span>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span className="mono-meta" style={{ fontSize: 10.5, color: "var(--status-done)" }}>
            {savedAt ? `Saved ${hhmm(savedAt)}` : "Saved"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task detail"
            className="mono-meta flex items-center justify-center rounded-[5px]"
            style={{
              minWidth: phone ? 44 : 34,
              minHeight: phone ? 44 : 24,
              fontSize: 10,
              background: "var(--chip-fill)",
              border: "1px solid var(--line-dashed)",
              color: "var(--ink-3)",
            }}
          >
            {phone ? <X size={16} /> : "ESC"}
          </button>
        </div>
      </div>

      <div
        className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ padding: phone ? "18px" : "20px 24px", gap: 20 }}
      >
        <input
          value={title}
          disabled={!online}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) saveDebounced({ title: e.target.value.trim() });
          }}
          aria-label="Task title"
          style={{
            fontSize: phone ? 18 : 19,
            fontWeight: 500,
            background: "var(--bg-card)",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            padding: 13,
            boxShadow: "var(--glow-accent)",
            caretColor: "var(--accent)",
            color: "var(--ink-1)",
          }}
        />

        <Field label="Status">
          <div
            className="flex gap-[3px] rounded-[8px] p-[3px]"
            style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}
          >
            {TASK_STATUSES.map((s) => {
              const active = s === task.status;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!online}
                  onClick={() => void save({ status: s })}
                  className="mono-meta flex-1 rounded-[6px] font-semibold"
                  style={{
                    fontSize: 10.5,
                    padding: "9px 4px",
                    minHeight: phone ? 44 : undefined,
                    background: active ? "var(--chip-fill-strong)" : "transparent",
                    color: active ? STATUS_TINT[s] : "var(--ink-3)",
                  }}
                >
                  {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid" style={{ gridTemplateColumns: phone ? "1fr 1fr" : "1fr 148px", gap: 14 }}>
          <Field label="Due">
            <div className="relative">
              <input
                type="date"
                disabled={!online}
                value={task.due_at ? new Date(task.due_at).toISOString().slice(0, 10) : ""}
                onChange={(e) => {
                  if (!e.target.value) return void save({ due_at: null });
                  // Build the date in local time — parsing "YYYY-MM-DD" as UTC
                  // shifts the day backwards in western timezones.
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  const local = new Date(y, m - 1, d, 9, 0, 0, 0);
                  void save({ due_at: local.toISOString() });
                }}
                aria-label="Due date"
                className="mono-meta w-full font-semibold"
                style={{
                  fontSize: 12,
                  background: "var(--bg-card)",
                  border: "1px solid var(--line-soft)",
                  borderRadius: 8,
                  padding: "11px 12px",
                  minHeight: 44,
                  color: "var(--ink-1)",
                  colorScheme: "inherit",
                }}
              />
              {!task.due_at && (
                <span
                  className="mono-meta pointer-events-none absolute"
                  style={{ left: 12, top: 14, fontSize: 12, color: "var(--ink-4)" }}
                >
                  No date
                  <ChevronDown size={11} className="ml-1 inline" />
                </span>
              )}
            </div>
          </Field>

          <Field label="Priority">
            <div
              className="flex gap-[3px] rounded-[8px] p-[3px]"
              style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}
            >
              {[1, 2, 3].map((p) => {
                const active = task.priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={!online}
                    onClick={() => void save({ priority: active ? null : (p as 1 | 2 | 3) })}
                    className="mono-meta flex-1 rounded-[6px] font-semibold"
                    style={{
                      fontSize: 10.5,
                      padding: "9px 0",
                      minHeight: phone ? 44 : undefined,
                      background: active ? PRIORITY_TINT[p].bg : "transparent",
                      color: active ? PRIORITY_TINT[p].fg : "var(--ink-3)",
                    }}
                  >
                    P{p}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <Field label="Tags">
          <div className="flex flex-wrap items-center" style={{ gap: 7 }}>
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="mono-meta inline-flex items-center rounded-[4px] font-medium"
                style={{
                  fontSize: 10.5,
                  padding: "7px 8px",
                  gap: 6,
                  background: "var(--chip-fill)",
                  border: "1px solid var(--line-dashed)",
                  color: "var(--ink-2)",
                }}
              >
                {tagLabel(tag)}
                <button
                  type="button"
                  disabled={!online}
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => void save({ tags: task.tags.filter((t) => t !== tag) })}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </span>
            ))}

            {addingTag ? (
              <input
                autoFocus
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={() => {
                  setAddingTag(false);
                  setTagDraft("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagDraft.trim()) {
                    const next = tagDraft.trim().replace(/^#/, "").toLowerCase();
                    if (!task.tags.includes(next)) void save({ tags: [...task.tags, next] });
                    setTagDraft("");
                    setAddingTag(false);
                  }
                  if (e.key === "Escape") {
                    setAddingTag(false);
                    setTagDraft("");
                  }
                }}
                aria-label="New tag"
                className="mono-meta rounded-[4px]"
                style={{
                  fontSize: 10.5,
                  padding: "7px 8px",
                  width: 110,
                  background: "var(--bg-card)",
                  border: "1px solid var(--accent)",
                  color: "var(--ink-1)",
                  caretColor: "var(--accent)",
                }}
              />
            ) : (
              <button
                type="button"
                disabled={!online}
                onClick={() => setAddingTag(true)}
                className="mono-meta inline-flex items-center rounded-[4px] font-medium"
                style={{
                  fontSize: 10.5,
                  padding: "7px 8px",
                  gap: 4,
                  border: "1px dashed var(--accent)",
                  color: "var(--accent)",
                }}
              >
                <Plus size={10} strokeWidth={2.75} /> Tag
              </button>
            )}
          </div>
        </Field>

        <Field label="Notes" hint="⌘⏎ save">
          <textarea
            value={notes}
            disabled={!online}
            onChange={(e) => {
              setNotes(e.target.value);
              saveDebounced({ notes: e.target.value || null });
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                void save({ notes: notes || null });
              }
            }}
            aria-label="Notes"
            rows={phone ? 5 : 7}
            style={{
              width: "100%",
              resize: "vertical",
              background: "var(--bg-panel)",
              border: "1px solid var(--line-strong)",
              borderRadius: 8,
              padding: 13,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              caretColor: "var(--accent)",
            }}
          />
        </Field>

        <div
          className="flex items-center justify-between rounded-[8px]"
          style={{
            background: "var(--accent-ground)",
            border: "1px solid var(--accent-border)",
            padding: "12px 14px",
            gap: 12,
          }}
        >
          <div className="min-w-0">
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--accent-ink)" }}>
              In Today&rsquo;s Focus
            </div>
            <div className="mono-meta" style={{ fontSize: 10, color: "var(--accent-meta)", marginTop: 3 }}>
              {task.focus_position
                ? `Position ${task.focus_position} of 3`
                : focusFull
                  ? "All three slots taken"
                  : "Not selected"}
            </div>
          </div>
          <Toggle
            checked={task.focus_position !== null}
            onChange={(v) => void toggleFocus(v)}
            label="In Today's Focus"
            disabled={!online || (focusFull && task.focus_position === null)}
            size="small"
          />
        </div>
      </div>

      <div
        className="flex items-end justify-between"
        style={{
          padding: phone ? "14px 18px" : "16px 24px",
          borderTop: "1px solid var(--line-softer)",
          gap: 12,
        }}
      >
        <span
          className="mono-meta"
          style={{ fontSize: 10, lineHeight: 1.5, color: "var(--ink-3-quiet)" }}
        >
          Created {shortDate(new Date(task.created_at))} {hhmm(new Date(task.created_at))}
          <br />
          Moved to {STATUS_LABEL[task.status]} {hhmm(new Date(task.status_changed_at))}
        </span>
        <button
          type="button"
          disabled={!online}
          onClick={async () => {
            if (!confirmDelete) return setConfirmDelete(true);
            await deleteTask(supabase, task.id);
            await qc.invalidateQueries({ queryKey: keys.tasks });
            onClose();
          }}
          onBlur={() => setConfirmDelete(false)}
          className="mono-meta shrink-0 font-semibold"
          style={{ fontSize: 10.5, color: "var(--status-overdue)", minHeight: 44 }}
        >
          {confirmDelete ? "Tap again to delete" : "Delete"}
        </button>
      </div>
    </>
  );

  if (phone) {
    return (
      <div
        className="safe-bottom fixed inset-0 z-50 flex flex-col"
        style={{ background: "var(--bg-chrome)" }}
        role="dialog"
        aria-label="Task detail"
      >
        <div className="safe-top" />
        {body}
      </div>
    );
  }

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 432,
        background: "var(--bg-chrome)",
        borderLeft: "1px solid var(--line)",
        boxShadow: "var(--shadow-inspector)",
      }}
      role="complementary"
      aria-label="Task detail"
    >
      {body}
    </aside>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col" style={{ gap: 8 }}>
      <div className="flex items-baseline justify-between">
        <span className="mono-label" style={{ fontSize: 10, color: "var(--ink-3)" }}>
          {label}
        </span>
        {hint && (
          <span className="mono-meta" style={{ fontSize: 10, color: "var(--ink-4)" }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
