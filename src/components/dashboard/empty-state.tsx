"use client";

import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys, useTasks } from "@/lib/hooks/use-data";
import { createTask } from "@/lib/db/tasks";

const SUGGESTIONS = [
  "Book dentist",
  "Reply to Mark about the Q3 numbers",
  "Renew car insurance — due Friday",
];

const STEPS: [string, string][] = [
  ["Capture.", "One line, one tap. No fields to fill in."],
  ["Move.", "To Do → In Progress → Done, on either device."],
  ["Pick three.", "Each morning, star up to three for Today's Focus."],
];

/** First run must feel inviting, not dead. */
export function EmptyState({ online }: { online: boolean }) {
  const { supabase, userId } = useSession();
  const { data: tasks } = useTasks();
  const qc = useQueryClient();

  async function add(text: string) {
    if (!online) return;
    await createTask(supabase, userId, text, tasks ?? []);
    await qc.invalidateQueries({ queryKey: keys.tasks });
  }

  return (
    <div className="flex flex-1 flex-col" style={{ gap: 26 }}>
      <div>
        <span
          style={{ display: "block", width: 11, height: 11, borderRadius: 2, background: "var(--accent)", marginBottom: 16 }}
          aria-hidden
        />
        <h1 style={{ fontSize: 27, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15 }}>
          Empty board.
          <br />
          That&rsquo;s the right place to start.
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 12 }}>
          Type whatever&rsquo;s on your mind below. It lands in To Do — you can sort it out later.
        </p>
      </div>

      <div>
        <span className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          Try one of these
        </span>
        <div className="flex flex-col" style={{ gap: 8, marginTop: 10 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!online}
              onClick={() => void add(s)}
              className="flex items-center justify-between text-left disabled:opacity-40"
              style={{
                minHeight: 48,
                background: "var(--bg-panel)",
                border: "1px dashed var(--line-dashed)",
                borderRadius: 10,
                padding: 13,
                fontSize: 15,
                color: "var(--ink-2-bright)",
                gap: 12,
              }}
            >
              {s}
              <Plus size={15} strokeWidth={2.5} style={{ color: "var(--accent)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          How it works
        </span>
        <div className="flex flex-col" style={{ gap: 12, marginTop: 10 }}>
          {STEPS.map(([lead, rest], i) => (
            <div key={lead} className="flex items-start" style={{ gap: 11 }}>
              <span
                className="mono-meta flex shrink-0 items-center justify-center font-semibold"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: "var(--bg-card)",
                  border: "1px solid var(--line)",
                  fontSize: 10,
                  color: "var(--ink-2)",
                }}
              >
                {i + 1}
              </span>
              <p style={{ fontSize: 14, lineHeight: 1.45, color: "var(--ink-2)" }}>
                <span style={{ color: "var(--ink-1)", fontWeight: 500 }}>{lead}</span> {rest}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
