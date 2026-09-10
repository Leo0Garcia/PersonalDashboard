"use client";

import { Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/components/providers";
import { useShell } from "@/components/dashboard/shell-context";
import { useTasks } from "@/lib/hooks/use-data";
import { byStatus, weekStats } from "@/lib/derive";
import { greeting, longDateLabel } from "@/lib/format";
import type { Task } from "@/lib/types";
import { BoardMac } from "@/components/dashboard/board-mac";
import { CalendarStrip } from "@/components/dashboard/calendar-strip";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FocusPanel } from "@/components/dashboard/focus-panel";
import { HabitsWidget } from "@/components/dashboard/habits-widget";
import { QuickCapture } from "@/components/dashboard/quick-capture";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { TaskCard } from "@/components/dashboard/task-card";
import { TaskDetail } from "@/components/dashboard/task-detail";

export default function DashboardPage() {
  const { isDesktop, online, cachedAt } = useShell();
  const { profile } = useSession();
  const { data: tasks, isLoading } = useTasks();
  const [selected, setSelected] = useState<Task | null>(null);

  const all = tasks ?? [];
  const wipLimit = profile?.wip_limit ?? 3;
  const stats = weekStats(all, wipLimit);
  const fresh = !isLoading && all.length === 0;

  // Keep the selected task in sync with realtime updates from the other device.
  const selectedLive = selected ? all.find((t) => t.id === selected.id) ?? null : null;

  if (isDesktop) {
    return (
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div style={{ padding: "16px 24px 0" }}>
            <CalendarStrip />
          </div>

          <div style={{ padding: "16px 24px" }}>
            <QuickCapture scale="mac" online={online} cachedAt={cachedAt} showHints autoFocus />
          </div>

          {fresh ? (
            <div className="scroll-quiet overflow-y-auto" style={{ padding: "0 24px 24px", maxWidth: 620 }}>
              <EmptyState online={online} />
            </div>
          ) : (
            <div
              className="grid min-h-0 flex-1"
              style={{ gridTemplateColumns: "296px 1fr", gap: 22, padding: "0 24px 24px" }}
            >
              <div className="flex min-h-0 flex-col" style={{ gap: 12 }}>
                {/* Focus and habits scroll; the tiles stay pinned to the bottom
                    of the rail so they never fall below the fold at 1440x900. */}
                <div className="scroll-quiet flex min-h-0 flex-1 flex-col" style={{ gap: 12, overflowY: "auto" }}>
                  <FocusPanel scale="mac" showFootnote online={online} onSelectTask={setSelected} />
                  <HabitsWidget scale="mac" online={online} />
                </div>
                <div className="shrink-0">
                  <StatTiles
                    scale="mac"
                    stats={[
                      { label: "Due 7d", value: stats.dueThisWeek },
                      {
                        label: "Overdue",
                        value: stats.overdue,
                        tone: stats.overdue > 0 ? "var(--status-overdue)" : undefined,
                      },
                      {
                        label: "Done",
                        value: stats.completedToday,
                        tone: "var(--status-done)",
                      },
                    ]}
                  />
                </div>
              </div>

              <BoardMac
                online={online}
                wipLimit={wipLimit}
                onSelectTask={setSelected}
                selectedId={selectedLive?.id}
              />
            </div>
          )}
        </div>

        {selectedLive && (
          <TaskDetail
            task={selectedLive}
            scale="mac"
            online={online}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    );
  }

  // ---- Phone: Today's Focus is the default landing view ----
  const upNext = byStatus(all, "todo").slice(0, 4);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{ padding: "14px 18px 18px", gap: 14 }}
      >
        <div className="flex items-start justify-between" style={{ gap: 12 }}>
          <div>
            <span className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
              {longDateLabel(new Date())}
            </span>
            <h1
              style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6 }}
            >
              {greeting(new Date())}
            </h1>
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex shrink-0 items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "var(--bg-card)",
              border: "1px solid var(--line)",
              color: "var(--ink-2)",
            }}
          >
            <SettingsIcon size={16} strokeWidth={2} />
          </Link>
        </div>

        {fresh ? (
          <EmptyState online={online} />
        ) : (
          <>
            <FocusPanel scale="phone" online={online} onSelectTask={setSelected} />

            <StatTiles
              stats={[
                { label: "Due 7d", value: stats.dueThisWeek },
                {
                  label: "Overdue",
                  value: stats.overdue,
                  tone: stats.overdue > 0 ? "var(--status-overdue)" : undefined,
                },
                { label: "Done", value: stats.completedToday, tone: "var(--status-done)" },
              ]}
            />

            <HabitsWidget scale="phone" online={online} />

            {upNext.length > 0 && (
              <div>
                <span className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                  Up next · To Do
                </span>
                <div className="flex flex-col" style={{ gap: 10, marginTop: 10 }}>
                  {upNext.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      scale="phone"
                      onClick={() => setSelected(task)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pinned above the tab bar — it never scrolls away */}
      <div
        style={{
          background: "var(--bg-chrome)",
          borderTop: "1px solid var(--line-soft)",
          padding: "12px 18px 10px",
        }}
      >
        <QuickCapture scale="phone" online={online} cachedAt={cachedAt} />
      </div>

      {selectedLive && (
        <TaskDetail
          task={selectedLive}
          scale="phone"
          online={online}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
