"use client";

import { useState } from "react";
import { useSession } from "@/components/providers";
import { useShell } from "@/components/dashboard/shell-context";
import { BoardMac } from "@/components/dashboard/board-mac";
import { BoardPhone } from "@/components/dashboard/board-phone";
import { QuickCapture } from "@/components/dashboard/quick-capture";
import { TaskDetail } from "@/components/dashboard/task-detail";
import { useTasks } from "@/lib/hooks/use-data";
import type { Task } from "@/lib/types";

export default function BoardPage() {
  const { isDesktop, online, cachedAt } = useShell();
  const { profile } = useSession();
  const { data: tasks } = useTasks();
  const [selected, setSelected] = useState<Task | null>(null);

  const selectedLive = selected
    ? (tasks ?? []).find((t) => t.id === selected.id) ?? null
    : null;

  if (isDesktop) {
    return (
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div style={{ padding: "16px 24px" }}>
            <QuickCapture scale="mac" online={online} cachedAt={cachedAt} autoFocus />
          </div>
          <div className="flex min-h-0 flex-1 flex-col" style={{ padding: "0 24px 24px" }}>
            <BoardMac
              online={online}
              wipLimit={profile?.wip_limit ?? 3}
              onSelectTask={setSelected}
              selectedId={selectedLive?.id}
            />
          </div>
        </div>
        {selectedLive && (
          <TaskDetail task={selectedLive} scale="mac" online={online} onClose={() => setSelected(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: "14px 18px 0" }}>
        <BoardPhone online={online} onSelectTask={setSelected} />
      </div>
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
        <TaskDetail task={selectedLive} scale="phone" online={online} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
