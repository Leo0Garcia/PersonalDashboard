"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useSession } from "@/components/providers";
import { keys, useCompletions, useHabits } from "@/lib/hooks/use-data";
import { createHabit, deleteHabit, reorderHabits, updateHabit } from "@/lib/db/habits";
import { habitStreak } from "@/lib/derive";
import { MonoLabel, Panel, Toggle } from "@/components/ui/primitives";
import type { Habit, HabitCompletion } from "@/lib/types";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const rowTitleStyle: CSSProperties = {
  fontSize: 15.5,
  fontWeight: 500,
  color: "var(--ink-1)",
};

const rowDescStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.4,
  color: "var(--ink-3)",
  marginTop: 2,
};

function Divider() {
  return <div style={{ height: 1, background: "var(--line-softer)" }} />;
}

function formatSchedule(schedule: number[]): string {
  if (schedule.length === 7) return "EVERY DAY";
  return [...schedule]
    .sort((a, b) => a - b)
    .map((d) => DAY_ABBR[d - 1])
    .join(" · ");
}

function SortableHabitRow({
  habit,
  completions,
  selected,
  onSelect,
}: {
  habit: Habit;
  completions: HabitCompletion[];
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: habit.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    background: selected ? "var(--bg-raised, var(--bg-card))" : undefined,
  };

  const streak = habitStreak(habit, completions);
  const schedule = formatSchedule(habit.schedule);
  const subline = streak > 0 ? `${schedule} · ${streak} DAY STREAK` : schedule;

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${habit.name}`}
        className="flex items-center justify-center shrink-0"
        style={{ width: 32, minHeight: 60, cursor: "grab", touchAction: "none" }}
      >
        <GripVertical size={16} style={{ color: "var(--ink-4)" }} />
      </button>
      <button
        type="button"
        onClick={() => onSelect(habit.id)}
        aria-expanded={selected}
        className="flex flex-1 items-center justify-between text-left"
        style={{ minHeight: 60, paddingRight: 16, paddingLeft: 2, gap: 12 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={rowTitleStyle}>{habit.name}</div>
          <div className="mono-meta" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 3 }}>
            {subline}
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
      </button>
    </div>
  );
}

function HabitEditorPanel({
  habit,
  onClose,
}: {
  habit: Habit;
  onClose: () => void;
}) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState(habit.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!confirmingDelete) return;
    const t = window.setTimeout(() => setConfirmingDelete(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmingDelete]);

  async function patch(p: Partial<Pick<Habit, "name" | "schedule" | "include_in_evening_nudge">>) {
    const previous = qc.getQueryData<Habit[]>(keys.habits);
    if (previous) {
      qc.setQueryData<Habit[]>(
        keys.habits,
        previous.map((h) => (h.id === habit.id ? { ...h, ...p } : h)),
      );
    }
    try {
      await updateHabit(supabase, habit.id, p);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch {
      if (previous) qc.setQueryData(keys.habits, previous);
    } finally {
      void qc.invalidateQueries({ queryKey: keys.habits });
    }
  }

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(habit.name);
      return;
    }
    if (trimmed !== habit.name) void patch({ name: trimmed });
  }

  function toggleDay(day: number) {
    const has = habit.schedule.includes(day);
    if (has && habit.schedule.length === 1) return; // never leave a habit with no scheduled days
    const next = has
      ? habit.schedule.filter((d) => d !== day)
      : [...habit.schedule, day].sort((a, b) => a - b);
    void patch({ schedule: next });
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const previous = qc.getQueryData<Habit[]>(keys.habits);
    if (previous) qc.setQueryData<Habit[]>(keys.habits, previous.filter((h) => h.id !== habit.id));
    onClose();
    try {
      await deleteHabit(supabase, habit.id);
    } catch {
      if (previous) qc.setQueryData(keys.habits, previous);
    } finally {
      void qc.invalidateQueries({ queryKey: keys.habits });
    }
  }

  return (
    <Panel style={{ marginTop: 16, padding: 16, borderRadius: 12 }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        aria-label="Habit name"
        style={{
          width: "100%",
          minHeight: 44,
          fontSize: 16,
          padding: "10px 12px",
          borderRadius: 8,
          background: "var(--bg-card)",
          border: "1px solid var(--line-strong)",
          color: "var(--ink-1)",
          boxShadow: "var(--glow-accent)",
          caretColor: "var(--accent)",
        }}
      />

      <MonoLabel size={10.5} style={{ color: "var(--ink-3)", display: "block", marginTop: 18, marginBottom: 8 }}>
        REPEATS ON
      </MonoLabel>
      <div className="flex" style={{ gap: 6 }}>
        {DAY_LETTERS.map((letter, idx) => {
          const day = idx + 1;
          const active = habit.schedule.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              aria-pressed={active}
              aria-label={DAY_NAMES[idx]}
              className="flex flex-1 items-center justify-center font-semibold"
              style={{
                minHeight: 44,
                borderRadius: 8,
                fontSize: 13,
                background: active ? "var(--accent)" : "var(--chip-fill)",
                color: active ? "var(--on-accent)" : "var(--accent)",
                border: active ? "1px solid transparent" : "1px solid var(--line-dashed)",
              }}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line-softer)" }}>
        <div className="flex items-center justify-between" style={{ minHeight: 44, gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={rowTitleStyle}>Include in evening nudge</div>
            <div style={rowDescStyle}>Ask if it&apos;s unticked at 22:00</div>
          </div>
          <Toggle
            checked={habit.include_in_evening_nudge}
            onChange={(next) => void patch({ include_in_evening_nudge: next })}
            label="Include in evening nudge"
            size="large"
          />
        </div>
      </div>

      <div
        className="flex items-center justify-between"
        style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-softer)" }}
      >
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="mono-meta font-semibold"
          style={{ fontSize: 10.5, color: "var(--status-overdue)", minHeight: 44 }}
        >
          {confirmingDelete ? "TAP AGAIN TO CONFIRM" : "DELETE HABIT"}
        </button>
        {saved && (
          <span className="mono-meta font-semibold" style={{ fontSize: 10.5, color: "var(--status-done)" }}>
            SAVED
          </span>
        )}
      </div>
    </Panel>
  );
}

export function HabitsEditor({ onBack }: { onBack: () => void }) {
  const { supabase, userId } = useSession();
  const qc = useQueryClient();
  const { data: habits } = useHabits();
  const { data: completions } = useCompletions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (addOpen) addInputRef.current?.focus();
  }, [addOpen]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!habits || !over || active.id === over.id) return;
    const oldIndex = habits.findIndex((h) => h.id === active.id);
    const newIndex = habits.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(habits, oldIndex, newIndex).map((h, i) => ({
      ...h,
      sort_order: i,
    }));
    qc.setQueryData(keys.habits, reordered);
    try {
      await reorderHabits(supabase, reordered);
    } finally {
      void qc.invalidateQueries({ queryKey: keys.habits });
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || !habits) {
      setAddOpen(false);
      return;
    }
    setNewName("");
    setAddOpen(false);
    try {
      const created = await createHabit(supabase, userId, trimmed, habits);
      qc.setQueryData<Habit[]>(keys.habits, [...habits, created]);
    } finally {
      void qc.invalidateQueries({ queryKey: keys.habits });
    }
  }

  const selectedHabit = habits?.find((h) => h.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 560, padding: "24px 16px 56px" }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 24 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex items-center justify-center shrink-0"
          style={{ width: 36, height: 36, borderRadius: 8 }}
        >
          <ChevronLeft size={20} style={{ color: "var(--ink-1)" }} />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-1)" }}>Habits</h1>
      </div>

      <section>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <MonoLabel size={10.5} style={{ color: "var(--ink-3)" }}>
            YOUR HABITS
          </MonoLabel>
          <span className="mono-meta" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
            DRAG TO REORDER
          </span>
        </div>

        {!habits && (
          <Panel style={{ borderRadius: 12, padding: 16 }}>
            <span className="mono-meta" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              LOADING…
            </span>
          </Panel>
        )}

        {habits && habits.length === 0 && (
          <Panel style={{ borderRadius: 12, padding: 16 }}>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>No habits yet.</span>
          </Panel>
        )}

        {habits && habits.length > 0 && (
          <Panel style={{ borderRadius: 12, overflow: "hidden" }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
              <SortableContext items={habits.map((h) => h.id)} strategy={verticalListSortingStrategy}>
                {habits.map((h, i) => (
                  <div key={h.id}>
                    {i > 0 && <Divider />}
                    <SortableHabitRow
                      habit={h}
                      completions={completions ?? []}
                      selected={selectedId === h.id}
                      onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                    />
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          </Panel>
        )}

        {addOpen ? (
          <input
            ref={addInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              } else if (e.key === "Escape") {
                setNewName("");
                setAddOpen(false);
              }
            }}
            onBlur={() => {
              setNewName("");
              setAddOpen(false);
            }}
            placeholder="Habit name"
            aria-label="New habit name"
            style={{
              width: "100%",
              marginTop: 12,
              minHeight: 48,
              padding: "0 14px",
              borderRadius: 10,
              background: "var(--bg-card)",
              border: "1px solid var(--line-strong)",
              color: "var(--ink-1)",
              fontSize: 15,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mono-meta flex w-full items-center justify-center font-semibold"
            style={{
              marginTop: 12,
              minHeight: 48,
              borderRadius: 10,
              border: "1px dashed var(--line-dashed)",
              color: "var(--accent)",
              fontSize: 12,
              letterSpacing: "0.07em",
            }}
          >
            + ADD HABIT
          </button>
        )}

        <p className="mono-meta" style={{ marginTop: 14, fontSize: 10.5, lineHeight: 1.5, color: "var(--ink-3-quiet)" }}>
          Four or five is plenty. Habits never appear on the board — they reset at midnight and
          don&apos;t become tasks.
        </p>

        {selectedHabit && (
          // Keyed on habit id so switching the selected habit remounts the panel — its
          // local `name` and `confirmingDelete` state initialise fresh with no effect needed.
          <HabitEditorPanel key={selectedHabit.id} habit={selectedHabit} onClose={() => setSelectedId(null)} />
        )}
      </section>
    </div>
  );
}
