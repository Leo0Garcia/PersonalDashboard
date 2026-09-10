"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys, useTasks } from "@/lib/hooks/use-data";
import { moveTask } from "@/lib/db/tasks";
import { byStatus } from "@/lib/derive";
import { STATUS_LABEL, TASK_STATUSES, type Task, type TaskStatus } from "@/lib/types";
import { TaskCard } from "./task-card";

const STATUS_CAP: Record<TaskStatus, string> = {
  todo: "var(--status-todo)",
  in_progress: "var(--status-inprog)",
  done: "var(--status-done)",
};

const STATUS_TINT: Record<TaskStatus, string> = {
  todo: "var(--status-todo-tint)",
  in_progress: "var(--status-inprog-tint)",
  done: "var(--status-done-tint)",
};

export function BoardMac({
  online,
  wipLimit,
  onSelectTask,
  selectedId,
}: {
  online: boolean;
  wipLimit: number;
  onSelectTask: (task: Task) => void;
  selectedId?: string | null;
}) {
  const { supabase } = useSession();
  const { data: tasks } = useTasks();
  const qc = useQueryClient();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const all = useMemo(() => tasks ?? [], [tasks]);
  const columns = useMemo(
    () =>
      Object.fromEntries(
        TASK_STATUSES.map((s) => [s, byStatus(all, s)]),
      ) as Record<TaskStatus, Task[]>,
    [all],
  );

  const activeTask = activeId ? all.find((t) => t.id === activeId) ?? null : null;

  const sensors = useSensors(
    // 4px threshold, so a click still opens the detail inspector.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function statusOf(id: string): TaskStatus | null {
    if (TASK_STATUSES.includes(id as TaskStatus)) return id as TaskStatus;
    return all.find((t) => t.id === id)?.status ?? null;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const over = e.over;
    if (!over) {
      setOverStatus(null);
      setOverIndex(null);
      return;
    }

    const overId = String(over.id);
    const target = statusOf(overId);
    if (!target) return;

    setOverStatus(target);

    const column = columns[target].filter((t) => t.id !== activeId);
    if (TASK_STATUSES.includes(overId as TaskStatus)) {
      setOverIndex(column.length);
    } else {
      const idx = column.findIndex((t) => t.id === overId);
      setOverIndex(idx === -1 ? column.length : idx);
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    const task = activeId ? all.find((t) => t.id === activeId) : null;
    const target = overStatus;
    const index = overIndex;

    setActiveId(null);
    setOverStatus(null);
    setOverIndex(null);

    if (!task || !target || index === null || !e.over) return;
    if (task.status === target) {
      const current = columns[target].findIndex((t) => t.id === task.id);
      if (current === index || current === index - 1) return;
    }

    // Optimistic: the board must feel instant. Reverting restores the original.
    const previous = qc.getQueryData<Task[]>(keys.tasks);
    qc.setQueryData<Task[]>(keys.tasks, (prev = []) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: target } : t)),
    );

    try {
      await moveTask(supabase, task, target, index, all);
    } catch {
      if (previous) qc.setQueryData(keys.tasks, previous);
    } finally {
      await qc.invalidateQueries({ queryKey: keys.tasks });
    }
  }

  const transitionCaption =
    activeTask && overStatus && overStatus !== activeTask.status
      ? `${STATUS_LABEL[activeTask.status]} → ${STATUS_LABEL[overStatus]}`
      : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverStatus(null);
        setOverIndex(null);
      }}
    >
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14 }}>
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            wipLimit={wipLimit}
            activeId={activeId}
            isTarget={overStatus === status}
            dimmed={Boolean(activeId) && overStatus !== null && overStatus !== status}
            dropIndex={overStatus === status ? overIndex : null}
            onSelectTask={onSelectTask}
            selectedId={selectedId}
            online={online}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask && (
          <div style={{ transform: "rotate(-1.6deg)", position: "relative" }}>
            <TaskCard task={activeTask} scale="mac" dragging />
            <GripVertical
              size={13}
              style={{ position: "absolute", top: 10, right: 9, color: "var(--ink-3)" }}
            />
            {transitionCaption && (
              <span
                className="mono-meta absolute font-semibold whitespace-nowrap"
                style={{
                  fontSize: 10.5,
                  color: "var(--accent)",
                  top: "100%",
                  marginTop: 8,
                  left: 2,
                }}
              >
                {transitionCaption}
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  wipLimit,
  activeId,
  isTarget,
  dimmed,
  dropIndex,
  onSelectTask,
  selectedId,
  online,
}: {
  status: TaskStatus;
  tasks: Task[];
  wipLimit: number;
  activeId: string | null;
  isTarget: boolean;
  dimmed: boolean;
  dropIndex: number | null;
  onSelectTask: (task: Task) => void;
  selectedId?: string | null;
  online: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: status });

  // The count decrements the moment a card is lifted out of this column.
  const visible = tasks.filter((t) => t.id !== activeId);
  const liftedFromHere = tasks.some((t) => t.id === activeId);
  const count = visible.length;
  const overWip = status === "in_progress" && count >= wipLimit && isTarget;

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-0 flex-col overflow-hidden transition-opacity duration-150"
      style={{
        background: isTarget ? "var(--drop-ground)" : "var(--bg-column)",
        border: isTarget ? "1.5px solid var(--accent)" : "1px solid var(--line-softer)",
        borderRadius: 10,
        boxShadow: isTarget ? "0 0 0 4px rgba(183,206,78,.10)" : undefined,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <div style={{ height: 3, background: STATUS_CAP[status] }} />

      <div
        className="flex items-center justify-between"
        style={{ padding: "13px 14px 11px", borderBottom: "1px solid var(--line-softer)" }}
      >
        <span
          className="mono-col"
          style={{ fontSize: 11.5, color: isTarget ? "var(--accent)" : STATUS_TINT[status] }}
        >
          {STATUS_LABEL[status]}
        </span>
        <span
          className="mono-col"
          style={{
            fontSize: 11.5,
            color: isTarget
              ? "var(--accent)"
              : status === "in_progress" && count > wipLimit
                ? "var(--status-inprog)"
                : "var(--ink-3)",
          }}
        >
          {status === "in_progress" ? `${count} / ${wipLimit}` : count}
        </span>
      </div>

      <div className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ padding: 12, gap: 10 }}>
        <SortableContext items={visible.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visible.map((task, i) => (
            <div key={task.id} className="contents">
              {dropIndex === i && <DropIndicator index={i} />}
              <SortableCard
                task={task}
                onSelect={() => onSelectTask(task)}
                selected={selectedId === task.id}
                disabled={!online}
              />
            </div>
          ))}
          {dropIndex !== null && dropIndex >= visible.length && (
            <DropIndicator index={visible.length} />
          )}
        </SortableContext>

        {liftedFromHere && dropIndex === null && (
          <div
            style={{
              height: 46,
              borderRadius: 8,
              border: "1px dashed var(--line-dashed)",
              background: "var(--drag-placeholder)",
            }}
            aria-hidden
          />
        )}

        {overWip && (
          <span
            className="mono-meta"
            style={{ fontSize: 10.5, color: "var(--status-inprog)", lineHeight: 1.4 }}
          >
            WIP limit reached on drop — allowed, but flagged
          </span>
        )}

        {!activeId && (
          <button
            type="button"
            className="mono-meta w-full text-left font-medium disabled:opacity-40"
            disabled={!online}
            style={{
              border: "1px dashed var(--line-dashed)",
              borderRadius: 8,
              padding: "11px 12px",
              fontSize: 11.5,
              color: "var(--ink-3-quiet)",
            }}
          >
            <Plus size={11} strokeWidth={2.5} className="mr-1.5 inline align-[-1px]" />
            Add task
          </button>
        )}
      </div>

      {status === "done" && (
        <div
          className="mono-meta text-center"
          style={{
            fontSize: 11,
            color: "var(--ink-3-quiet)",
            padding: "10px 12px",
            borderTop: "1px solid var(--line-softer)",
          }}
        >
          Showing today · view all
        </div>
      )}
    </div>
  );
}

function DropIndicator({ index }: { index: number }) {
  return (
    <div
      className="mono-meta flex items-center justify-center font-semibold"
      style={{
        height: 74,
        borderRadius: 8,
        border: "1.5px dashed var(--accent)",
        background: "var(--drop-ground)",
        color: "var(--accent)",
        fontSize: 11,
        letterSpacing: "0.09em",
        flexShrink: 0,
      }}
      aria-hidden
    >
      Drop here · position {index + 1}
    </div>
  );
}

function SortableCard({
  task,
  onSelect,
  selected,
  disabled,
}: {
  task: Task;
  onSelect: () => void;
  selected: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} scale="mac" selected={selected} onClick={onSelect} />
    </div>
  );
}
