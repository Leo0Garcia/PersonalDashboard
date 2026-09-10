"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys, useTasks } from "@/lib/hooks/use-data";
import { createTask, parseCapture } from "@/lib/db/tasks";

/**
 * The lowest-friction path into the app, so it carries the accent glow at rest
 * rather than only on focus. Offline it becomes visibly inert — writes are
 * disabled, not queued.
 */
export function QuickCapture({
  scale = "mac",
  online,
  cachedAt,
  showHints = false,
  autoFocus = false,
}: {
  scale?: "mac" | "phone";
  online: boolean;
  cachedAt?: string;
  showHints?: boolean;
  autoFocus?: boolean;
}) {
  const phone = scale === "phone";
  const { supabase, userId } = useSession();
  const { data: tasks } = useTasks();
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K focuses capture from anywhere on the Mac.
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone]);

  useEffect(() => {
    if (autoFocus && !phone) inputRef.current?.focus();
  }, [autoFocus, phone]);

  const parsed = value.trim() ? parseCapture(value) : null;

  async function submit() {
    const text = value.trim();
    if (!text || busy || !online) return;
    setBusy(true);
    try {
      await createTask(supabase, userId, text, tasks ?? []);
      setValue("");
      await qc.invalidateQueries({ queryKey: keys.tasks });
      inputRef.current?.focus(); // keep focus for a second entry
    } finally {
      setBusy(false);
    }
  }

  const disabled = !online;

  return (
    <div className={phone ? "" : "w-full"}>
      <div
        className="flex items-center"
        style={{
          gap: 11,
          height: phone ? 50 : 54,
          padding: phone ? "0 13px" : "0 14px",
          borderRadius: phone ? 12 : 10,
          background: disabled ? "var(--bg-base)" : "var(--bg-card)",
          border: disabled
            ? "1px dashed var(--line-dashed)"
            : "1px solid var(--line-strong)",
          boxShadow: disabled ? "none" : "var(--glow-accent)",
        }}
      >
        <span
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            border: `1.5px solid ${disabled ? "var(--ink-4)" : "var(--accent)"}`,
            color: disabled ? "var(--ink-4)" : "var(--accent)",
          }}
        >
          <Plus size={12} strokeWidth={2.75} />
        </span>

        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") {
              setValue("");
              inputRef.current?.blur();
            }
          }}
          placeholder={
            disabled
              ? "Quick Capture unavailable offline"
              : phone
                ? "Capture a task…"
                : "Capture a task…"
          }
          aria-label="Quick capture"
          className="min-w-0 flex-1 bg-transparent"
          style={{
            fontSize: phone ? 16 : 17,
            color: disabled ? "var(--ink-4)" : "var(--ink-1)",
            caretColor: "var(--accent)",
          }}
        />

        {phone ? (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            className="mono-meta shrink-0 rounded-[5px] font-semibold disabled:opacity-40"
            style={{
              fontSize: 10.5,
              padding: "7px 9px",
              background: "var(--accent)",
              color: "var(--on-accent)",
            }}
          >
            Add
          </button>
        ) : (
          <span
            className="mono-meta shrink-0 rounded-[5px] font-medium"
            style={{
              fontSize: 11,
              padding: "5px 7px",
              background: "var(--chip-fill)",
              border: "1px solid var(--line-dashed)",
              color: "var(--ink-3)",
            }}
          >
            ↵ Add
          </span>
        )}
      </div>

      {/* Parsed tokens surface as you type so it's clear what will be captured */}
      {parsed && (parsed.tags.length > 0 || parsed.dueAt) && !disabled && (
        <div
          className="mono-meta flex flex-wrap items-center"
          style={{ gap: 8, marginTop: 7, fontSize: 10.5, color: "var(--accent-meta)" }}
        >
          {parsed.dueAt && (
            <span>
              DUE{" "}
              {new Date(parsed.dueAt)
                .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
                .toUpperCase()}
            </span>
          )}
          {parsed.tags.map((t) => (
            <span key={t}>#{t.toUpperCase()}</span>
          ))}
        </div>
      )}

      {showHints && !phone && (
        <div
          className="flex flex-wrap"
          style={{ gap: 18, marginTop: 9, fontSize: 11.5, color: "var(--ink-3-quiet)" }}
        >
          {disabled ? (
            <span>Offline — cached {cachedAt ?? "earlier"}. Edits disabled.</span>
          ) : (
            <>
              <span>Quick Capture — lands in To Do</span>
              <span>⌘K from anywhere</span>
              <span>Type #tag or &ldquo;fri&rdquo; to set a due date</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
